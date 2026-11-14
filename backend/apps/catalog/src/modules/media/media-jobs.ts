import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Database } from '../../database.js';
import type { MediaInspector } from './media-inspector.js';
import { InvalidMedia, mediaSize, type MediaStorage, type Upload } from './media-types.js';

export class MediaJobs {
  constructor(private readonly db: Database, private readonly storage: MediaStorage, private readonly inspect: MediaInspector) {}

  async verifyNext(shutdown: AbortSignal): Promise<boolean> {
    const token = randomUUID();
    const { rows } = await this.db.query<Upload>(`WITH candidate AS (
      SELECT id FROM media_uploads WHERE status='VERIFYING' AND verify_after<=now()
        AND (lease_until IS NULL OR lease_until<=now()) ORDER BY verify_after,id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE media_uploads u SET lease_token=$1,lease_until=now()+interval '3 minutes',attempts=attempts+1
      FROM candidate WHERE u.id=candidate.id RETURNING u.*`, [token]);
    const upload = rows[0];
    if (!upload) return false;
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(150000)]);
    try {
      const { version, width, height, durationMs } = await this.verify(upload, signal);
      await this.db.query(`UPDATE media_uploads SET status='READY',object_version=$3,detected_mime=expected_mime,
        width=$4,height=$5,duration_ms=$6,verified_at=now(),lease_token=NULL,lease_until=NULL,error_code=NULL
        WHERE id=$1 AND status='VERIFYING' AND lease_token=$2 AND lease_until>now()`, [upload.id, token, version, width, height, durationMs]);
    } catch (error) {
      const rejected = error instanceof InvalidMedia || upload.attempts >= 5;
      const reason = error instanceof InvalidMedia ? error.code : rejected ? 'MEDIA_VERIFIER_UNAVAILABLE' : null;
      await this.db.query(`UPDATE media_uploads SET status=$3,error_code=$4,lease_token=NULL,lease_until=NULL,
        verify_after=now()+$5*interval '1 second' WHERE id=$1 AND status='VERIFYING' AND lease_token=$2 AND lease_until>now()`,
      [upload.id, token, rejected ? 'REJECTED' : 'VERIFYING', reason, 2 ** upload.attempts]);
    }
    return true;
  }

  private async verify(upload: Upload, signal: AbortSignal) {
    const io = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
    const object = await this.storage.head(upload.object_key, io);
    if (!object) {
      if (upload.expires_at.getTime() <= Date.now()) throw new InvalidMedia('MEDIA_OBJECT_MISSING');
      throw new Error('Media object has not arrived');
    }
    if (object.mime !== upload.expected_mime) throw new InvalidMedia('MEDIA_MIME_MISMATCH');
    if (object.size !== upload.expected_bytes || object.size > mediaSize(upload.expected_mime)) throw new InvalidMedia('MEDIA_SIZE_MISMATCH');
    const directory = await mkdtemp(join(tmpdir(), 'smartgym-catalog-media-'));
    const file = join(directory, 'upload.bin');
    try {
      const blob = await this.storage.read(upload.object_key, object.version, io);
      if (!blob) throw new Error('Media version has not arrived');
      if (blob.version !== object.version || blob.mime !== object.mime || blob.size !== object.size || blob.contentRange) {
        blob.body.destroy();
        throw new InvalidMedia('MEDIA_OBJECT_MISMATCH');
      }
      const hash = createHash('sha256'), prefix = Buffer.alloc(64);
      let size = 0;
      const measure = new Transform({ transform(chunk: Buffer, _encoding, next) {
        if (size + chunk.length > upload.expected_bytes) { next(new InvalidMedia('MEDIA_SIZE_MISMATCH')); return; }
        if (size < prefix.length) chunk.copy(prefix, size, 0, Math.min(chunk.length, prefix.length - size));
        size += chunk.length;
        hash.update(chunk);
        next(null, chunk);
      } });
      await pipeline(blob.body, measure, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal: io });
      if (size !== upload.expected_bytes) throw new InvalidMedia('MEDIA_SIZE_MISMATCH');
      if (hash.digest('hex') !== upload.expected_sha256) throw new InvalidMedia('MEDIA_CHECKSUM_MISMATCH');
      return { version: object.version, ...await this.inspect(file, upload.expected_mime, prefix.subarray(0, size), signal) };
    } finally {
      await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await rmdir(directory);
    }
  }

  async collectNext(shutdown: AbortSignal): Promise<boolean> {
    const upload = await this.db.transaction(async db => {
      const { rows } = await db.query<Upload>(`SELECT u.* FROM media_uploads u WHERE purged_at IS NULL
        AND (cleanup_after IS NULL OR cleanup_after<=now())
        AND ((status IN ('RESERVED','REJECTED') AND expires_at<=now()-interval '1 hour') OR status='EXPIRED'
          OR (status='READY' AND coalesce(verified_at,expires_at)<=now()-interval '30 days'))
        AND NOT EXISTS(SELECT 1 FROM support_revisions r WHERE r.upload_id=u.id)
        ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT 1`);
      if (!rows.length) return;
      const row = rows[0];
      // An attachment can have committed while the candidate was being selected. Recheck under the lock.
      if ((await db.query('SELECT 1 FROM support_revisions WHERE upload_id=$1 LIMIT 1', [row.id])).rows.length) return;
      await db.query("UPDATE media_uploads SET status='EXPIRED',cleanup_after=now()+interval '5 minutes' WHERE id=$1", [row.id]);
      return row;
    });
    if (!upload) return false;
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(20000)]);
    const version = upload.object_version ?? (await this.storage.head(upload.object_key, signal))?.version;
    if (version) await this.storage.remove(upload.object_key, version, signal);
    await this.db.query("UPDATE media_uploads SET purged_at=now() WHERE id=$1 AND status='EXPIRED'", [upload.id]);
    return true;
  }
}
