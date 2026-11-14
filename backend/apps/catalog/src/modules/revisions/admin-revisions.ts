import { reject } from '../admin/admin-contract.js';
import { cursorFor, decodeCursor, fingerprint, iso, queryInput } from '../admin/admin-store.js';
import type { SupportType } from '../content/admin-support.service.js';
import type { SqlClient } from '../../database.js';

export type RevisionType = 'exercise' | SupportType;
export type RevisionSelection = { version: number; reason: string };
type RevisionRow = Record<string, unknown> & {
  version: number;
  document: unknown;
  actor: string | null;
  created_at: Date;
  action: string;
  reason: string | null;
  source_version: number | null;
  svg_regions: string[];
  object_version: string | null;
};
const actions: Record<string, string> = {
  BOOTSTRAP: 'CREATE', CREATE_DRAFT: 'CREATE', UPDATE_DRAFT: 'EDIT',
  PUBLISH: 'PUBLISH', ARCHIVE: 'ARCHIVE', RESTORE: 'RESTORE', RESTORE_REVISION: 'RESTORE_REVISION',
};

export function revisionVersion(value: string, code = 'BAD_REQUEST') {
  if (!/^[1-9][0-9]{0,9}$/.test(value) || Number(value) > 2147483647) reject(400, code);
  return Number(value);
}

function select(type: RevisionType) {
  const exercise = type === 'exercise';
  const audit = `LEFT JOIN LATERAL (SELECT action,before_version,source_version,reason FROM catalog_audit
    WHERE content_type=$1 AND content_id=$2 AND after_version=r.version ORDER BY sequence DESC LIMIT 1) a ON true`;
  if (exercise) {
    // A published row stores the public projection. Its audit links to the exact draft that produced it.
    return `SELECT r.version,coalesce(d.document,r.document) AS document,r.author AS actor,r.created_at,
      coalesce(a.action,CASE WHEN r.author IS NOT NULL AND r.document ? 'publishedRevision' THEN 'PUBLISH' ELSE 'BOOTSTRAP' END) AS action,
      a.reason,a.source_version,'[]'::jsonb AS svg_regions,NULL::text AS object_version
      FROM exercise_revisions r ${audit}
      LEFT JOIN exercise_revisions d ON a.action='PUBLISH' AND d.exercise_id=r.exercise_id AND d.version=a.before_version
      WHERE r.exercise_id=$2`;
  }
  return `SELECT r.version,r.document,r.actor,r.created_at,r.action,a.reason,a.source_version,r.svg_regions,r.object_version
    FROM support_revisions r ${audit} WHERE r.content_type=$1 AND r.content_id=$2`;
}

export async function getRevision(db: SqlClient, type: RevisionType, id: string, version: number) {
  const { rows } = await db.query<RevisionRow>(select(type) + ' AND r.version=$3', [type, id, version]);
  if (!rows.length) reject(404, 'NOT_FOUND');
  return rows[0];
}

export function revisionOf<T>(row: RevisionRow, data: T) {
  return { version: row.version, actorUserId: row.actor, at: iso(row.created_at), action: actions[row.action], data,
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.source_version === null ? {} : { sourceVersion: row.source_version }) };
}

export async function listRevisions<T>(db: SqlClient, type: RevisionType, id: string, input: Record<string, unknown>,
  dataOf: (document: unknown) => T) {
  const { query, limit } = queryInput(input, ['limit', 'cursor']);
  const filter = fingerprint([type, id, limit]);
  const cursor = decodeCursor(query.cursor, filter);
  if (cursor && cursor.id !== id) reject(400, 'INVALID_CURSOR');
  const before = cursor ? revisionVersion(cursor.key, 'INVALID_CURSOR') : null;
  const { rows } = await db.query<RevisionRow>(select(type) + ' AND ($3::integer IS NULL OR r.version<$3) ORDER BY r.version DESC LIMIT $4',
    [type, id, before, limit + 1]);
  if (!rows.length && !cursor) reject(404, 'NOT_FOUND');
  const items = rows.slice(0, limit).map(row => revisionOf(row, dataOf(row.document)));
  return { items, nextCursor: rows.length > limit ? cursorFor(filter, id, String(items.at(-1)!.version)) : null };
}
