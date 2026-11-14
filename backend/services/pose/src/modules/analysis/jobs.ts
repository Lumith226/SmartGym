import { randomUUID } from 'node:crypto';
import type { Database, SqlClient } from '../../database.js';
import type { Storage, UploadInput } from './storage.js';
import { fingerprint, iso, modelOf, reject } from '../../contract.js';
type Upload = Record<string, unknown> & { id: string; owner_id: string; object_key: string; object_version: string | null;
  sha256: string; size_bytes: number; mime: string; consent_version: string; put_expires_at: Date; raw_expires_at: Date; deleted_at: Date | null };
type Job = Record<string, unknown> & { id: string; owner_id: string; exercise_id: string; status: string; error_code: string | null;
  created_at: Date; updated_at: Date; expires_at: Date; summary?: unknown };
export async function command<T>(database: Database, owner: string, operation: string, key: string, body: unknown, action: (db: SqlClient) => Promise<T>): Promise<T> {
  const hash = fingerprint(body);
  return database.transaction(async db => {
    await db.query('DELETE FROM pose_idempotency WHERE owner_id=$1 AND operation=$2 AND key=$3 AND expires_at<=now()', [owner, operation, key]);
    const claimed = await db.query(`INSERT INTO pose_idempotency(owner_id,operation,key,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key`, [owner, operation, key, hash]);
    if (!claimed.rows.length) {
      const prior = (await db.query<{ fingerprint: string; response: T }>('SELECT fingerprint,response FROM pose_idempotency WHERE owner_id=$1 AND operation=$2 AND key=$3', [owner, operation, key])).rows[0];
      if (!prior || prior.fingerprint !== hash) reject(409, 'IDEMPOTENCY_CONFLICT');
      return prior.response;
    }
    const result = await action(db);
    await db.query('UPDATE pose_idempotency SET response=$4 WHERE owner_id=$1 AND operation=$2 AND key=$3', [owner, operation, key, JSON.stringify(result)]);
    return result;
  });
}
export function jobOf(j: Job) {
  return { id: j.id, exerciseId: j.exercise_id, status: j.status, createdAt: iso(j.created_at), updatedAt: iso(j.updated_at), expiresAt: iso(j.expires_at),
    ...(j.summary && j.status === 'SUCCEEDED' ? { result: j.summary } : {}), ...(j.error_code ? { failureCode: j.error_code } : {}) };
}
export class PoseJobs {
  constructor(readonly db: Database, readonly storage: Storage, readonly consent: string, readonly prefix = 'pose/uploads') {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(consent) || !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(prefix)) throw new Error('Invalid Pose policy');
  }
  async reserve(owner: string, input: UploadInput, key: string) {
    if (input.consentVersion !== this.consent) reject(422, 'CONSENT_VERSION_UNSUPPORTED');
    const id = await command(this.db, owner, 'reserve', key, input, async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,73012))', [owner]);
      const count = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM pose_uploads WHERE owner_id=$1 AND put_expires_at>now()', [owner])).rows[0].n;
      if (count >= 8) reject(429, 'UPLOAD_QUOTA_EXCEEDED');
      const id = randomUUID();
      await db.query(`INSERT INTO pose_uploads(id,owner_id,object_key,sha256,size_bytes,mime,consent_version,put_expires_at,raw_expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes',now()+interval '24 hours')`, [id, owner, this.prefix + '/' + id, input.sha256, input.sizeBytes, input.mimeType, input.consentVersion]);
      return id;
    });
    const upload = (await this.db.query<Upload>('SELECT * FROM pose_uploads WHERE id=$1 AND owner_id=$2', [id, owner])).rows[0];
    if (!upload || new Date(upload.put_expires_at).getTime() <= Date.now() || upload.deleted_at) reject(410, 'UPLOAD_EXPIRED');
    return { uploadId: id, ...(await this.storage.grant(upload.object_key, input, upload.put_expires_at)), expiresAt: iso(upload.put_expires_at) };
  }
  async get(owner: string, id: string, database: SqlClient = this.db) {
    const job = (await database.query<Job>(`SELECT j.*,r.summary FROM pose_jobs j LEFT JOIN pose_results r ON r.job_id=j.id WHERE j.id=$1 AND j.owner_id=$2`, [id, owner])).rows[0];
    if (!job) reject(404, 'NOT_FOUND');
    if (new Date(job.expires_at).getTime() <= Date.now()) reject(410, 'RESULT_EXPIRED');
    return jobOf(job);
  }
  async create(owner: string, input: { uploadId: string; exerciseId: string; consentVersion: string }, key: string) {
    const model = modelOf(input.exerciseId);
    if (input.consentVersion !== this.consent) reject(422, 'CONSENT_VERSION_UNSUPPORTED');
    const jobId = await command(this.db, owner, 'create-job', key, input, async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,73012))', [owner]);
      const upload = (await db.query<Upload>('SELECT * FROM pose_uploads WHERE id=$1 AND owner_id=$2 FOR UPDATE', [input.uploadId, owner])).rows[0];
      if (!upload) reject(404, 'NOT_FOUND');
      if (upload.deleted_at || new Date(upload.raw_expires_at).getTime() <= Date.now()) reject(410, 'UPLOAD_EXPIRED');
      if (upload.consent_version !== input.consentVersion) reject(422, 'CONSENT_VERSION_MISMATCH');
      const previous = (await db.query<{ id: string; exercise_id: string }>('SELECT id,exercise_id FROM pose_jobs WHERE upload_id=$1', [upload.id])).rows[0];
      if (previous) { if (previous.exercise_id !== input.exerciseId) reject(409, 'UPLOAD_ALREADY_CLAIMED'); return previous.id; }
      if (upload.cleanup_token || new Date(upload.put_expires_at).getTime() <= Date.now()) reject(410, 'UPLOAD_EXPIRED');
      const object = await this.storage.head(upload.object_key);
      if (!object) reject(409, 'UPLOAD_INCOMPLETE');
      if (object.mime !== upload.mime || object.size !== upload.size_bytes) reject(422, 'UPLOAD_METADATA_MISMATCH');
      await db.query('DELETE FROM pose_dedupe WHERE owner_id=$1 AND expires_at<=now()', [owner]);
      const old = (await db.query<{ job_id: string }>(`SELECT job_id FROM pose_dedupe WHERE owner_id=$1 AND source_sha256=$2 AND exercise_id=$3 AND model_sha256=$4 AND consent_version=$5`,
        [owner, upload.sha256, model.catalogId, model.sha256, input.consentVersion])).rows[0];
      if (old) return old.job_id;
      const active = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM pose_jobs WHERE owner_id=$1 AND status IN ('QUEUED','RUNNING')", [owner])).rows[0].n;
      if (active >= 2) reject(429, 'JOB_QUOTA_EXCEEDED');
      const id = randomUUID();
      await db.query('UPDATE pose_uploads SET object_version=$2 WHERE id=$1', [upload.id, object.version]);
      await db.query(`INSERT INTO pose_jobs(id,owner_id,upload_id,exercise_id,model_sha256,config_version,consent_version,status,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,'QUEUED',now()+interval '30 days')`, [id, owner, upload.id, model.catalogId, model.sha256, model.schemaVersion, input.consentVersion]);
      await db.query(`INSERT INTO pose_dedupe VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 days')`, [owner, upload.sha256, model.catalogId, model.sha256, input.consentVersion, id]);
      return id;
    });
    return this.get(owner, jobId);
  }
  async cancel(owner: string, id: string) {
    return this.db.transaction(async db => {
      const row = (await db.query<Job>('SELECT * FROM pose_jobs WHERE id=$1 AND owner_id=$2 FOR UPDATE', [id, owner])).rows[0];
      if (!row) reject(404, 'NOT_FOUND');
      if (new Date(row.expires_at).getTime() <= Date.now()) reject(410, 'RESULT_EXPIRED');
      if (row.status === 'CANCELED') return this.get(owner, id, db);
      if (row.status === 'SUCCEEDED' || row.status === 'FAILED') reject(409, 'JOB_ALREADY_TERMINAL');
      await db.query("UPDATE pose_jobs SET status='CANCELED',claim_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1", [id]);
      return this.get(owner, id, db);
    });
  }
  async result(owner: string, id: string, raw: boolean) {
    const r = (await this.db.query<{ summary: unknown; raw_model_result: unknown; source_sha256: string; model_sha256: string; expires_at: Date }>(
      'SELECT * FROM pose_results WHERE id=$1 AND owner_id=$2', [id, owner])).rows[0];
    if (!r) reject(404, 'NOT_FOUND');
    if (new Date(r.expires_at).getTime() <= Date.now()) reject(410, 'RESULT_EXPIRED');
    if (raw && !r.raw_model_result) reject(422, 'NO_RAW_OBSERVATION');
    return raw ? { result: r.summary, rawModelResult: r.raw_model_result, sourceId: 'sha256:' + r.source_sha256, modelSha256: r.model_sha256 } : r.summary;
  }
}
