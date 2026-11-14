import { createHash, randomUUID } from 'node:crypto';
import type { Database, SqlClient } from '../../database.js';
import { identifier, reject } from './admin-contract.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  }
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export const iso = (value: Date) => new Date(value).toISOString();

export function decodeCursor(raw: string | undefined, filter: string): { id: string; key: string } | undefined {
  if (raw === undefined) return;
  try {
    if (!raw || raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (value.filter !== filter || !identifier.test(value.id) || typeof value.key !== 'string' || value.key.includes('\u0000')) throw new Error();
    return value;
  } catch { reject(400, 'INVALID_CURSOR'); }
}
export const cursorFor = (filter: string, id: string, key: string) => Buffer.from(JSON.stringify({ filter, id, key })).toString('base64url');
export function queryInput(input: Record<string, unknown>, allowed: string[]) {
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key) || typeof value !== 'string' || value.includes('\u0000')) reject(400, 'BAD_REQUEST');
  }
  const query = input as Record<string, string | undefined>;
  const raw = query.limit ?? '20';
  if (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > 100) reject(400, 'BAD_REQUEST');
  return { query, limit: Number(raw) };
}

export async function audit(db: SqlClient, actor: string, type: string, id: string, action: string, before: number | null,
  after: number, correlation: string, revision = 'v' + after, reason?: string, sourceVersion?: number) {
  await db.query(`INSERT INTO catalog_audit(id,actor_id,content_type,content_id,action,revision,before_version,after_version,reason,correlation_id,source_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(), actor, type, id, action, revision, before, after, reason ?? null, correlation, sourceVersion ?? null]);
}

export async function command<T>(database: Database, actor: string, operation: string, key: string, input: unknown,
  run: (db: SqlClient) => Promise<T>) {
  const hash = fingerprint(input);
  return database.transaction(async db => {
    await db.query('DELETE FROM idempotency_keys WHERE owner_user_id=$1 AND operation=$2 AND key=$3 AND expires_at<=now()', [actor, operation, key]);
    const claimed = await db.query(`INSERT INTO idempotency_keys(owner_user_id,operation,key,request_fingerprint)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key`, [actor, operation, key, hash]);
    if (!claimed.rows.length) {
      const prior = (await db.query<{ request_fingerprint: string; response: T }>(`
        SELECT request_fingerprint,response FROM idempotency_keys WHERE owner_user_id=$1 AND operation=$2 AND key=$3`,
        [actor, operation, key])).rows[0];
      if (!prior || prior.request_fingerprint !== hash) reject(409, 'IDEMPOTENCY_CONFLICT');
      return prior.response;
    }
    const result = await run(db);
    await db.query('UPDATE idempotency_keys SET response=$4 WHERE owner_user_id=$1 AND operation=$2 AND key=$3', [actor, operation, key, JSON.stringify(result)]);
    return result;
  });
}
