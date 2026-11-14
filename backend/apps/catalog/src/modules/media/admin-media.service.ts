import { randomUUID } from 'node:crypto';
import { reject } from '../admin/admin-contract.js';
import { command } from '../admin/admin-store.js';
import type { Database, SqlClient } from '../../database.js';
import { mediaMime, mediaSize, type MediaStorage, type Upload, type UploadRequest } from './media-types.js';

async function owned(db: SqlClient, id: string, actor: string, lock = false) {
  const { rows } = await db.query<Upload>('SELECT * FROM media_uploads WHERE id=$1 AND actor_id=$2' + (lock ? ' FOR UPDATE' : ''), [id, actor]);
  if (!rows.length) reject(404, 'NOT_FOUND');
  const upload = rows[0];
  if (upload.status === 'EXPIRED' || (upload.status === 'RESERVED' && upload.expires_at.getTime() <= Date.now())) reject(410, 'UPLOAD_EXPIRED');
  return upload;
}
const state = (upload: Upload) => ({ uploadId: upload.id, status: upload.status, mime: upload.expected_mime,
  sizeBytes: upload.expected_bytes, sha256: upload.expected_sha256, ...(upload.error_code ? { errorCode: upload.error_code } : {}) });

export function validateUpload(input: unknown): asserts input is UploadRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject(422, 'VALIDATION_ERROR');
  const { mime, sizeBytes } = input as Partial<UploadRequest>;
  if (typeof mime === 'string' && !mediaMime.includes(mime)) reject(415, 'MEDIA_TYPE_UNSUPPORTED');
  if (mime && typeof sizeBytes === 'number' && sizeBytes > mediaSize(mime)) reject(413, 'MEDIA_TOO_LARGE');
}

export class AdminMedia {
  constructor(private readonly db: Database, private readonly storage: MediaStorage, private readonly prefix: string) {}

  async create(actor: string, key: string, input: UploadRequest) {
    const reservation = await command(this.db, actor, 'media:reserve', key, input, async db => {
      await db.query('SELECT pg_advisory_xact_lock(73003, hashtext($1))', [actor]);
      const { rows } = await db.query<{ n: number }>(`SELECT count(*)::integer AS n FROM media_uploads WHERE actor_id=$1
        AND (status='VERIFYING' OR (status='RESERVED' AND expires_at>now()))`, [actor]);
      if (rows[0].n >= 8) reject(429, 'MEDIA_UPLOAD_LIMIT');
      const id = 'upload_' + randomUUID().replaceAll('-', '');
      const { rows: created } = await db.query<{ expires_at: Date }>(`INSERT INTO media_uploads
        (id,actor_id,object_key,expected_mime,expected_bytes,expected_sha256,status,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'RESERVED',now() + interval '10 minutes') RETURNING expires_at`,
      [id, actor, this.prefix + '/' + id, input.mime, input.sizeBytes, input.sha256]);
      // Store only the stable upload ID in the idempotency receipt. URLs are minted outside the transaction.
      return { id, expiresAt: created[0].expires_at.toISOString() };
    });
    const expiresAt = new Date(reservation.expiresAt);
    if (expiresAt.getTime() - Date.now() < 1000) reject(410, 'UPLOAD_EXPIRED');
    const upload = await owned(this.db, reservation.id, actor);
    const signed = await this.storage.putUrl(upload.object_key, input, expiresAt);
    return { uploadId: upload.id, putUrl: signed.url, expiresAt: reservation.expiresAt, requiredHeaders: signed.headers };
  }

  async get(id: string, actor: string) { return state(await owned(this.db, id, actor)); }

  complete(id: string, actor: string, key: string) {
    return command(this.db, actor, 'media:complete:' + id, key, null, async db => {
      const upload = await owned(db, id, actor, true);
      if (upload.status === 'REJECTED') reject(409, 'MEDIA_UPLOAD_REJECTED');
      if (upload.status !== 'RESERVED') return state(upload);
      await db.query("UPDATE media_uploads SET status='VERIFYING',verify_after=now() WHERE id=$1", [id]);
      return state({ ...upload, status: 'VERIFYING' });
    });
  }

  async preview(id: string, actor: string) {
    const { rows: [upload] } = await this.db.query<Upload>(`
      SELECT u.* FROM media_uploads u WHERE u.id=$1 AND (
        u.actor_id=$2 OR EXISTS (
          SELECT 1 FROM media_assets m
          JOIN support_revisions r ON r.media_id=m.id AND r.version=m.current_published_version
          WHERE m.lifecycle='PUBLISHED' AND r.upload_id=u.id AND r.object_version=u.object_version
            AND r.document->>'rightsStatus'='APPROVED' AND u.revoked_at IS NULL
        )
      )`, [id, actor]);
    if (!upload) reject(404, 'NOT_FOUND');
    if (upload.status === 'EXPIRED' || (upload.status === 'RESERVED' && upload.expires_at.getTime() <= Date.now()))
      reject(410, 'UPLOAD_EXPIRED');
    if (upload.revoked_at) reject(410, 'MEDIA_RIGHTS_REVOKED');
    if (upload.status !== 'READY' || !upload.verified_at || !upload.object_version) reject(422, 'MEDIA_UPLOAD_NOT_READY');
    const expiresAt = new Date(Date.now() + 60000);
    return { url: await this.storage.previewUrl(upload.object_key, upload.object_version, expiresAt), expiresAt: expiresAt.toISOString() };
  }
}
