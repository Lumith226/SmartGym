import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { identifier, reject } from '../admin/admin-contract.js';
import { revisionVersion } from '../revisions/admin-revisions.js';
import type { SqlClient } from '../../database.js';
import type { MediaStorage } from './media-types.js';

export type PublishedMedia = Record<string, unknown> & {
  id: string; version: number; kind: 'IMAGE' | 'VIDEO'; altText: string; credit: string | null;
};
export const publicMediaPath = (id: string, version: number) => `/api/v1/media/${id}/${version}`;

export async function pinPublicMedia(db: SqlClient, ids: string[]) {
  return (await db.query<PublishedMedia>(`SELECT m.id,r.version,r.document->>'kind' AS kind,
    r.document->>'altText' AS "altText",r.document->>'credit' AS credit
    FROM media_assets m JOIN support_revisions r ON r.media_id=m.id AND r.version=m.current_published_version
    JOIN media_uploads u ON u.id=r.upload_id AND u.object_version=r.object_version
    WHERE m.id=ANY($1::text[]) AND m.lifecycle='PUBLISHED' AND r.document->>'rightsStatus'='APPROVED'
      AND u.status='READY' AND u.verified_at IS NOT NULL AND u.revoked_at IS NULL
    ORDER BY m.id FOR SHARE OF m,u`, [ids])).rows;
}

function rangeHeader(value: string | undefined, size: number, response: ServerResponse) {
  if (!value) return;
  const range = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(value);
  if (!range || (!range[1] && !range[2]) || (range[1] && Number(range[1]) >= size) ||
      (range[2] && (range[1] ? Number(range[2]) < Number(range[1]) : Number(range[2]) === 0))) {
    response.setHeader('Content-Range', 'bytes */' + size);
    reject(416, 'MEDIA_RANGE_INVALID');
  }
  return value;
}

export async function servePublicMedia(db: SqlClient, storage: MediaStorage | undefined, id: string, rawVersion: string,
  request: IncomingMessage, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (!identifier.test(id) || !storage) reject(404, 'NOT_FOUND');
  const version = revisionVersion(rawVersion);
  const { rows } = await db.query<{ object_key: string; object_version: string; expected_bytes: number; detected_mime: string }>(`
    SELECT u.object_key,r.object_version,u.expected_bytes,u.detected_mime
    FROM support_revisions r JOIN media_assets m ON m.id=r.media_id
    JOIN media_uploads u ON u.id=r.upload_id AND u.object_version=r.object_version
    WHERE r.media_id=$1 AND r.version=$2 AND m.lifecycle='PUBLISHED' AND r.document->>'rightsStatus'='APPROVED'
      AND u.status='READY' AND u.verified_at IS NOT NULL AND u.revoked_at IS NULL
      AND EXISTS (SELECT 1 FROM revision_media p JOIN exercises e ON e.id=p.exercise_id
        AND e.current_published_version=p.version WHERE p.media_id=$1 AND p.support_version=$2 AND e.lifecycle='PUBLISHED')`, [id, version]);
  const asset = rows[0];
  if (!asset) reject(404, 'NOT_FOUND');
  const range = rangeHeader(request.headers.range, asset.expected_bytes, response);
  const closed = new AbortController(), abort = () => closed.abort();
  response.once('close', abort);
  const signal = AbortSignal.any([closed.signal, AbortSignal.timeout(120000)]);
  try {
    const object = await storage.read(asset.object_key, asset.object_version, signal, range);
    if (!object) reject(404, 'NOT_FOUND');
    if (object.mime !== asset.detected_mime || (range && !object.contentRange) || (!range && object.size !== asset.expected_bytes)) {
      object.body.destroy();
      reject(503, 'CATALOG_MEDIA_UNAVAILABLE');
    }
    response.writeHead(range ? 206 : 200, {
      'Content-Type': asset.detected_mime, 'Content-Length': object.size, 'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes',
      ...(object.contentRange ? { 'Content-Range': object.contentRange } : {}),
    });
    try { await pipeline(object.body, response, { signal }); } catch { response.destroy(); }
  } finally { response.off('close', abort); }
}
