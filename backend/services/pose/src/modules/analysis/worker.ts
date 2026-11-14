import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, sep } from 'node:path';
import type { Database } from '../../database.js';
import type { Storage } from './storage.js';
import type { Engine } from '../../engine.js';
import { iso, modelOf, validateRaw, valid } from '../../contract.js';
type Claim = Record<string, unknown> & { id: string; owner_id: string; upload_id: string; exercise_id: string; model_sha256: string; config_version: string;
  claim_token: string; dispatched_at: Date | null; attempts: number; expires_at: Date;
  object_key: string; object_version: string; size_bytes: number; sha256: string; mime: string; raw_expires_at: Date };
const exec = promisify(execFile);
export class PoseWorker {
  constructor(readonly db: Database, readonly storage: Storage, readonly engine: Engine,
    readonly tools: { ffmpeg: string; ffprobe: string; temp: string }) {}
  async claim() {
    return this.db.transaction(async db => {
      // Dispatch may have reached the engine. A reclaimed lease must never send it again.
      await db.query(`UPDATE pose_jobs SET status='FAILED',error_code='INFERENCE_OUTCOME_UNKNOWN',claim_token=NULL,lease_until=NULL,updated_at=now()
        WHERE status='RUNNING' AND lease_until<=now() AND dispatched_at IS NOT NULL`);
      await db.query(`UPDATE pose_jobs SET status=CASE WHEN attempts>=3 THEN 'FAILED' ELSE 'QUEUED' END,
        error_code=CASE WHEN attempts>=3 THEN 'WORKER_RETRY_EXHAUSTED' ELSE NULL END,claim_token=NULL,lease_until=NULL,updated_at=now()
        WHERE status='RUNNING' AND lease_until<=now() AND dispatched_at IS NULL`);
      const row = (await db.query<Claim>(`SELECT j.*,u.object_key,u.object_version,u.size_bytes,u.sha256,u.mime,u.raw_expires_at
        FROM pose_jobs j JOIN pose_uploads u ON u.id=j.upload_id WHERE j.status='QUEUED' AND j.available_at<=now()
        ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`)).rows[0];
      if (!row) return null;
      const token = randomUUID();
      await db.query(`UPDATE pose_jobs SET status='RUNNING',claim_token=$2,lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now() WHERE id=$1`, [row.id, token]);
      return { ...row, claim_token: token, attempts: row.attempts + 1 };
    });
  }
  async runNext(signal: AbortSignal) {
    const job = await this.claim();
    if (!job) return false;
    const root = resolve(this.tools.temp);
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, 'pose-'));
    const file = join(directory, 'input.' + (job.mime === 'video/mp4' ? 'mp4' : 'webm'));
    const limit = AbortSignal.any([signal, AbortSignal.timeout(240000)]);
    let dispatched = false;
    try {
      if (new Date(job.raw_expires_at).getTime() <= Date.now()) throw new Error('UPLOAD_EXPIRED');
      const model = modelOf(job.exercise_id);
      if (model.sha256 !== job.model_sha256 || model.schemaVersion !== job.config_version) throw new Error('MODEL_VERSION_UNAVAILABLE');
      const hash = createHash('sha256'); let length = 0;
      const meter = new Transform({ transform(chunk: Buffer, _enc, cb) {
        length += chunk.length;
        if (length > job.size_bytes || length > 104857600) cb(new Error('UPLOAD_BYTES_INVALID'));
        else { hash.update(chunk); cb(null, chunk); }
      } });
      await pipeline(await this.storage.read(job.object_key, job.object_version, limit), meter, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal: limit });
      if (length !== job.size_bytes || hash.digest('hex') !== job.sha256) throw new Error('UPLOAD_BYTES_INVALID');
      const handle = await open(file, 'r'); const magic = Buffer.alloc(12);
      try { await handle.read(magic, 0, 12, 0); } finally { await handle.close(); }
      if (job.mime === 'video/mp4' ? magic.toString('ascii', 4, 8) !== 'ftyp' : magic.subarray(0, 4).toString('hex') !== '1a45dfa3') throw new Error('VIDEO_INVALID');
      const base = ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm', '-max_alloc', '67108864'];
      let info: any;
      try {
        const probe = await exec(this.tools.ffprobe, [...base, '-show_streams', '-show_format', '-of', 'json', file], { windowsHide: true, timeout: 10000, maxBuffer: 262144, signal: limit });
        info = JSON.parse(probe.stdout);
        const videos = info.streams.filter((s: any) => s.codec_type === 'video');
        const duration = Number(info.format.duration), v = videos[0], parts = String(v?.avg_frame_rate).split('/').map(Number), fps = parts[0] / parts[1];
        if (videos.length !== 1 || !['h264', 'vp8', 'vp9'].includes(v.codec_name) || !Number.isFinite(duration) || duration <= 0 || duration > 120 ||
            !Number.isFinite(fps) || fps <= 0 || fps > 60 || fps * duration > 7200 || Number(v.nb_frames) > 7200 ||
            !Number.isInteger(v.width) || !Number.isInteger(v.height) || Math.max(v.width, v.height) > 1920 || Math.min(v.width, v.height) > 1080) throw new Error();
        const decoded = await exec(this.tools.ffmpeg, ['-nostdin', '-xerror', ...base, '-threads', '1', '-i', file,
          '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-frames:v', '7201', '-progress', 'pipe:1', '-f', 'null', '-'],
          { windowsHide: true, timeout: 30000, maxBuffer: 262144, signal: limit });
        const frames = [...decoded.stdout.matchAll(/^frame=(\d+)\s*$/gm)].at(-1);
        const elapsed = [...decoded.stdout.matchAll(/^out_time_us=(-?\d+)\s*$/gm)].at(-1);
        if (!frames || Number(frames[1]) < 2 || Number(frames[1]) > 7200 || !elapsed || Number(elapsed[1]) > 120000000) throw new Error();
      } catch { throw new Error('VIDEO_INVALID'); }
      await this.engine.ready(AbortSignal.any([limit, AbortSignal.timeout(5000)]));
      const marked = await this.db.query(`UPDATE pose_jobs SET dispatched_at=now() WHERE id=$1 AND status='RUNNING' AND claim_token=$2 AND lease_until>now() RETURNING id`, [job.id, job.claim_token]);
      if (!marked.rows.length) return true;
      dispatched = true;
      const raw = await this.engine.analyze(file, model.poseId, job.mime, AbortSignal.any([limit, AbortSignal.timeout(180000)]));
      validateRaw(model, raw);
      delete raw.comparison;
      raw.source = { video_sha256: job.sha256 };
      raw.model_provenance = { model_sha256: model.sha256 };
      const id = randomUUID(), completedAt = new Date();
      const summary = { id, source: 'VIDEO', exerciseId: model.catalogId, modelVersion: 'ST-GCNpp-V4', configVersion: model.schemaVersion,
        repCount: null, repCountStatus: 'UNAVAILABLE', reps: [], formStatus: raw.quality.usable ? 'ASSESSED' : 'INSUFFICIENT_EVIDENCE',
        limitations: ['Phân tích toàn video V4 chưa đếm rep.', 'Nhãn quan sát không xác nhận kỹ thuật đúng hoặc chẩn đoán y tế.'], completedAt: iso(completedAt), expiresAt: iso(job.expires_at) };
      if (!valid('PoseResult', summary)) throw new Error('INVALID_ENGINE_RESULT');
      await this.db.transaction(async db => {
        const active = (await db.query(`SELECT id FROM pose_jobs WHERE id=$1 AND status='RUNNING' AND claim_token=$2 AND lease_until>now() FOR UPDATE`, [job.id, job.claim_token])).rows.length;
        if (!active) return;
        await db.query(`INSERT INTO pose_results(id,job_id,owner_id,summary,raw_model_result,source_sha256,model_sha256,schema_version,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, job.id, job.owner_id, JSON.stringify(summary), JSON.stringify(raw), job.sha256, model.sha256, model.schemaVersion, job.expires_at]);
        await db.query("UPDATE pose_jobs SET status='SUCCEEDED',claim_token=NULL,lease_until=NULL,error_code=NULL,updated_at=now() WHERE id=$1", [job.id]);
      });
    } catch (error) {
      const known = ['UPLOAD_EXPIRED', 'MODEL_VERSION_UNAVAILABLE', 'UPLOAD_BYTES_INVALID', 'VIDEO_INVALID'];
      const message = (error as Error).message;
      const terminal = dispatched || known.includes(message) || job.attempts >= 3;
      const code = dispatched ? 'INFERENCE_OUTCOME_UNKNOWN' : known.includes(message) ? message : 'POSE_DEPENDENCY_UNAVAILABLE';
      await this.db.query(`UPDATE pose_jobs SET status=$3,error_code=$4,claim_token=NULL,lease_until=NULL,
        available_at=now()+interval '10 seconds',updated_at=now() WHERE id=$1 AND status='RUNNING' AND claim_token=$2 AND lease_until>now()`,
        [job.id, job.claim_token, terminal ? 'FAILED' : 'QUEUED', terminal ? code : null]);
    } finally {
      const target = resolve(directory);
      if (!target.startsWith(root + sep)) throw new Error('Unsafe Pose temporary directory');
      await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
    return true;
  }
  async collectNext(signal: AbortSignal) {
    await this.db.query('DELETE FROM pose_results WHERE expires_at<=now()');
    await this.db.query('DELETE FROM pose_idempotency WHERE expires_at<=now()');
    await this.db.query('DELETE FROM pose_dedupe WHERE expires_at<=now()');
    // Do not delete the key while a valid conditional PUT URL could recreate it.
    const claim = await this.db.transaction(async db => {
      const row = (await db.query<Claim & { deleted_at: Date | null }>(`SELECT u.* FROM pose_uploads u WHERE u.deleted_at IS NULL
        AND u.put_expires_at<=now() AND (u.cleanup_until IS NULL OR u.cleanup_until<=now()) AND
        (u.raw_expires_at<=now() OR NOT EXISTS(SELECT 1 FROM pose_jobs j WHERE j.upload_id=u.id AND j.status IN ('QUEUED','RUNNING')))
        ORDER BY u.raw_expires_at LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
      if (!row) return null;
      const token = randomUUID();
      await db.query("UPDATE pose_uploads SET cleanup_token=$2,cleanup_until=now()+interval '1 minute' WHERE id=$1", [row.id, token]);
      return { ...row, token };
    });
    if (!claim) return false;
    const object = claim.object_version ? { version: claim.object_version } : await this.storage.head(claim.object_key);
    if (object) await this.storage.remove(claim.object_key, object.version, signal);
    await this.db.query('UPDATE pose_uploads SET deleted_at=now(),cleanup_token=NULL,cleanup_until=NULL WHERE id=$1 AND cleanup_token=$2', [claim.id, claim.token]);
    return true;
  }
}
