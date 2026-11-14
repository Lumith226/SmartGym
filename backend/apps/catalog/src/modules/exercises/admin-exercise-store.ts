import type { SqlClient } from '../../database.js';
import { reject } from '../admin/admin-contract.js';
import { cursorFor, decodeCursor, fingerprint, iso, queryInput } from '../admin/admin-store.js';

export interface Draft {
  id: string;
  slug: string;
  nameVi: string;
  nameEn?: string;
  summary: string;
  primaryMuscleIds: string[];
  secondaryMuscleIds?: string[];
  equipmentIds: string[];
  instructions: string[];
  commonMistakes?: string[];
  workoutType?: 'STRENGTH' | 'CARDIO' | 'HIIT' | 'CORE' | 'STRETCHING';
  focusArea?: 'FULL_BODY' | 'UPPER_BODY' | 'LOWER_BODY' | 'ABS';
  difficulty?: 1 | 2 | 3 | 4 | 5;
  levelSets?: [number, number, number];
  restSeconds?: number;
  poseStyle?: 'squat' | 'pushup' | 'plank' | 'jump' | 'pull' | 'lunge' | 'core' | 'barbell';
  mediaIds?: string[];
  variantIds?: string[];
  sourceRef?: string;
  profile?: Record<string, unknown>;
  imageRoles?: Partial<Record<'main' | 'start' | 'peak', string>>;
}
export type ExerciseOwner = Record<string, unknown> & {
  id: string;
  lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  edit_version: number;
  current_draft_version: number | null;
  current_published_version: number | null;
  published_from_version: number | null;
  updated_at: Date;
  draft: Draft;
  published_revision: string | null;
};
type Detail = Draft & {
  status: ExerciseOwner['lifecycle'];
  draftVersion: number;
  updatedAt: string;
  publishedVersion?: number;
  publishedRevision?: string;
};
interface CommandResult { detail: Detail; version: number }
const ownerFields = `e.*, d.document AS draft, p.document->>'publishedRevision' AS published_revision`;
const draftSource = `FROM exercises e
  JOIN exercise_revisions d ON d.exercise_id=e.id AND d.version=coalesce(e.current_draft_version,e.current_published_version)`;
const ownerSource = `${draftSource}
  LEFT JOIN exercise_revisions p ON p.exercise_id=e.id AND p.version=e.current_published_version`;

export function draftOf(document: Draft & { variants?: { id: string }[] }): Draft {
  const { id, slug, nameVi, nameEn, summary, primaryMuscleIds, secondaryMuscleIds, equipmentIds, instructions,
    commonMistakes, workoutType, focusArea, difficulty, levelSets, restSeconds, poseStyle, mediaIds, variantIds, sourceRef,
    profile, imageRoles } = document;
  return { id, slug, nameVi, ...(nameEn === undefined ? {} : { nameEn }), summary, primaryMuscleIds,
    secondaryMuscleIds: secondaryMuscleIds ?? [], equipmentIds, instructions, commonMistakes: commonMistakes ?? [],
    ...(workoutType === undefined ? {} : { workoutType }),
    ...(focusArea === undefined ? {} : { focusArea }),
    ...(difficulty === undefined ? {} : { difficulty }),
    ...(levelSets === undefined ? {} : { levelSets }),
    ...(restSeconds === undefined ? {} : { restSeconds }),
    ...(poseStyle === undefined ? {} : { poseStyle }),
    mediaIds: mediaIds ?? [], variantIds: variantIds ?? document.variants?.map(variant => variant.id) ?? [],
    ...(sourceRef === undefined ? {} : { sourceRef }),
    ...(profile === undefined ? {} : { profile }),
    ...(imageRoles === undefined ? {} : { imageRoles }) };
}
export function resultOf(row: ExerciseOwner): CommandResult {
  return {
    detail: {
      ...draftOf(row.draft), status: row.lifecycle, draftVersion: (row.current_draft_version ?? row.current_published_version)!,
      updatedAt: iso(row.updated_at),
      ...(row.current_published_version ? { publishedVersion: row.current_published_version, publishedRevision: row.published_revision! } : {}),
    },
    version: row.edit_version,
  };
}
export async function getOwner(db: SqlClient, id: string, lock = false): Promise<ExerciseOwner> {
  // Read the revision after acquiring the owner lock so a waiting writer gets a fresh SQL snapshot.
  if (lock) {
    const owner = await db.query('SELECT id FROM exercises WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
    if (!owner.rows.length) reject(404, 'NOT_FOUND');
  }
  const row = (await db.query<ExerciseOwner>(`SELECT ${ownerFields} ${ownerSource} WHERE e.id=$1 AND e.deleted_at IS NULL`, [id])).rows[0];
  if (!row) reject(404, 'NOT_FOUND');
  return row;
}
export async function exerciseStats(db: SqlClient) {
  const { rows } = await db.query<{ total: number; published: number; drafts: number; archived: number; unpublishedChanges: number }>(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE lifecycle='PUBLISHED')::int AS published,
      count(*) FILTER (WHERE lifecycle='DRAFT')::int AS drafts,
      count(*) FILTER (WHERE lifecycle='ARCHIVED')::int AS archived,
      count(*) FILTER (WHERE lifecycle='PUBLISHED' AND current_draft_version IS NOT NULL
        AND current_draft_version IS DISTINCT FROM published_from_version)::int AS "unpublishedChanges"
    FROM exercises WHERE deleted_at IS NULL`);
  return rows[0];
}

export async function listExercises(db: SqlClient, input: Record<string, unknown>) {
  const { query, limit } = queryInput(input, ['q', 'status', 'sort', 'cursor', 'limit', 'page']);
  const search = query.q?.trim() ?? '', sort = query.sort ?? 'updated_desc';
  if ((query.q !== undefined && !search) || search.length > 120 ||
      (query.status !== undefined && !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(query.status)) ||
      !['updated_desc', 'name_asc'].includes(sort)) reject(400, 'BAD_REQUEST');
  if (query.page !== undefined && (!/^[1-9][0-9]{0,8}$/.test(query.page) || query.cursor !== undefined)) reject(400, 'BAD_REQUEST');
  const nameSort = sort === 'name_asc';
  const key = nameSort ? `catalog_search_key(d.document->>'nameVi') COLLATE "C"` : `date_trunc('milliseconds',e.updated_at)`;
  const direction = nameSort ? 'ASC' : 'DESC';
  const matches = `e.deleted_at IS NULL AND ($1::text IS NULL OR e.lifecycle=$1) AND strpos(d.search_key,catalog_search_key($2))>0`;

  if (query.page !== undefined) {
    // Read the count and page under the same SQL snapshot. Clamp stale page links after deletions.
    const { rows } = await db.query<ExerciseOwner & { total: number; page: number }>(
      `WITH matching AS (
        SELECT e.id, ${key} AS sort_key ${draftSource}
        WHERE ${matches}
      ), bounds AS (
        SELECT count(*)::int AS total, least($3::int, greatest(1, ceil(count(*)::numeric / $4::int)::int)) AS page
        FROM matching
      ), page_items AS (
        SELECT id, sort_key FROM matching ORDER BY sort_key ${direction}, id COLLATE "C"
        LIMIT $4 OFFSET (SELECT (page-1)::bigint * $4 FROM bounds)
      ) SELECT ${ownerFields}, bounds.total, bounds.page
      ${ownerSource} JOIN page_items ON page_items.id=e.id RIGHT JOIN bounds ON true
        ORDER BY page_items.sort_key ${direction}, e.id COLLATE "C"`,
      [query.status ?? null, search, Number(query.page), limit]);
    const { page, total } = rows[0];
    return { items: rows.filter(row => row.id !== null).map(row => resultOf(row).detail),
      nextCursor: null, pagination: { page, pageSize: limit, total } };
  }

  const filter = fingerprint([search, query.status ?? null, sort, limit]);
  const cursor = decodeCursor(query.cursor, filter);
  const value = nameSort ? '$4::text COLLATE "C"' : '$4::timestamptz';
  if (!nameSort && cursor && !Number.isFinite(Date.parse(cursor.key))) reject(400, 'INVALID_CURSOR');
  const { rows } = await db.query<ExerciseOwner & { sort_key: string | Date }>(
    `SELECT ${ownerFields}, ${key} AS sort_key
    ${ownerSource} WHERE ${matches}
      AND ($3::text IS NULL OR ${key} ${nameSort ? '>' : '<'} ${value} OR (${key}=${value} AND e.id COLLATE "C" > $3 COLLATE "C"))
      ORDER BY sort_key ${direction}, e.id COLLATE "C" LIMIT $5`,
    [query.status ?? null, search, cursor?.id ?? null, cursor && !nameSort ? new Date(cursor.key).toISOString() : cursor?.key ?? null, limit + 1]);
  const page = rows.slice(0, limit), last = page.at(-1);
  return { items: page.map(row => resultOf(row).detail), nextCursor: rows.length > limit && last
    ? cursorFor(filter, last.id, nameSort ? String(last.sort_key) : iso(last.sort_key as Date)) : null };
}
