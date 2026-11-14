import { randomUUID } from 'node:crypto';
import { identifier, reject } from '../admin/admin-contract.js';
import { audit, command, cursorFor, decodeCursor, fingerprint, iso, queryInput } from '../admin/admin-store.js';
import { getRevision, listRevisions, revisionOf, type RevisionSelection } from '../revisions/admin-revisions.js';
import type { Database, SqlClient } from '../../database.js';

const support = {
  'muscle-group': { owner: 'muscle_groups', reference: 'revision_muscle_groups', refId: 'group_id' },
  equipment: { owner: 'equipment', reference: 'revision_equipment', refId: 'equipment_id' },
  'exercise-variant': { owner: 'exercise_variants', reference: 'revision_variants', refId: 'variant_id' },
  media: { owner: 'media_assets', reference: 'revision_media', refId: 'media_id' },
} as const;

export type SupportType = keyof typeof support;
type SupportData = {
  nameVi?: string; slug?: string; regionKey?: string; sortOrder?: number; side?: string;
  exerciseId?: string; notes?: string;
  kind?: string; uploadId?: string; sourceUri?: string; credit?: string;
  licenseRef?: string; altText?: string; rightsStatus?: string;
};
export type SupportInput = { contentType: SupportType; data: SupportData };
export type SupportCreate = SupportInput & { id: string };
type Owner = Record<string, unknown> & {
  id: string; lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; edit_version: number; updated_at: Date;
  current_draft_version: number; current_published_version: number | null;
  document: SupportData; object_version: string | null;
};
type Action = 'PUBLISH' | 'ARCHIVE' | 'RESTORE';
const snapshot = (type: SupportType, id: string, document: unknown) => ({ id, contentType: type, data: document as SupportData });

export function supportType(value: string): SupportType {
  if (!Object.hasOwn(support, value)) reject(404, 'NOT_FOUND');
  return value as SupportType;
}

function selectOwner(type: SupportType, extra = '') {
  return `SELECT o.*, r.document, r.svg_regions AS revision_regions, r.object_version${extra} FROM ${support[type].owner} o
    JOIN support_revisions r ON r.content_type=$1 AND r.content_id=o.id AND r.version=o.current_draft_version`;
}
async function getOwner(db: SqlClient, type: SupportType, id: string, lock = false) {
  if (lock) {
    const owner = await db.query(`SELECT id FROM ${support[type].owner} WHERE id=$1 FOR UPDATE`, [id]);
    if (!owner.rows.length) reject(404, 'NOT_FOUND');
  }
  const row = (await db.query<Owner & { revision_regions: string[] }>(selectOwner(type) + ' WHERE o.id=$2', [type, id])).rows[0];
  if (!row) reject(404, 'NOT_FOUND');
  return row;
}
function resultOf(type: SupportType, row: Owner) {
  return {
    version: row.edit_version,
    detail: { id: row.id, contentType: type, data: row.document, status: row.lifecycle,
      editVersion: row.edit_version, updatedAt: iso(row.updated_at),
      ...(row.current_published_version === null ? {} : { publishedVersion: row.current_published_version }) },
  };
}
function validateInput(type: SupportType, input: SupportInput) {
  if (input.contentType !== type) reject(422, 'CONTENT_TYPE_MISMATCH');
  if (Object.values(input.data).some(value => typeof value === 'string' && (!value.trim() || value.includes('\u0000')))) {
    reject(422, 'VALIDATION_ERROR');
  }
  if (type === 'media' && input.data.sourceUri !== undefined) {
    const url = URL.parse(input.data.sourceUri);
    if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) reject(422, 'MEDIA_SOURCE_INVALID');
  }
}

async function readyObject(db: SqlClient, data: SupportData, actor?: string) {
  const row = (await db.query<{ object_version: string }>(`SELECT object_version FROM media_uploads
    WHERE id=$1 AND status='READY' AND verified_at IS NOT NULL AND revoked_at IS NULL AND detected_mime=expected_mime
      AND (($2='IMAGE' AND detected_mime IN ('image/jpeg','image/png','image/webp') AND expected_bytes<=10485760)
        OR ($2='VIDEO' AND detected_mime IN ('video/mp4','video/webm')))
      AND ($3::uuid IS NULL OR actor_id=$3) FOR SHARE`, [data.uploadId, data.kind, actor ?? null])).rows[0];
  if (!row) reject(422, 'MEDIA_UPLOAD_NOT_READY');
  return row.object_version;
}
async function saveRevision(db: SqlClient, type: SupportType, id: string, version: number, data: SupportData,
  regions: string[], objectVersion: string | null, actor: string, action: string) {
  await db.query(`INSERT INTO support_revisions(content_type,content_id,version,document,svg_regions,object_version,actor,action)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [type, id, version, JSON.stringify(data), JSON.stringify(regions), objectVersion, actor, action]);
}

async function restoreDraft(db: SqlClient, type: SupportType, id: string, actor: string, expected: number, sourceVersion: number, reason?: string) {
  const source = await getRevision(db, type, id, sourceVersion);
  const data = source.document as SupportData;
  // Recheck media rights before a restored approved snapshot can be published again.
  const draft = type === 'media' && data.rightsStatus === 'APPROVED' ? { ...data, rightsStatus: 'PENDING' } : data;
  const version = expected + 1, action = reason === undefined ? 'RESTORE' : 'RESTORE_REVISION';
  await saveRevision(db, type, id, version, draft, source.svg_regions, source.object_version, actor, action);
  await db.query(`UPDATE ${support[type].owner} SET edit_version=$2,current_draft_version=$2,updated_at=now(),
    lifecycle=CASE WHEN lifecycle='ARCHIVED' THEN 'DRAFT' ELSE lifecycle END WHERE id=$1`, [id, version]);
  await audit(db, actor, type, id, action, expected, version, randomUUID(), undefined, reason, sourceVersion);
  return { version, draft };
}

async function projectTaxonomy(db: SqlClient, type: SupportType, id: string, data: SupportData, regions: string[]) {
  if (type !== 'muscle-group' && type !== 'equipment') return;
  const table = support[type].owner;
  const taken = await db.query(`SELECT 1 FROM ${table} WHERE id<>$1 AND lifecycle='PUBLISHED' AND slug=$2`, [id, data.slug]);
  if (taken.rows.length) reject(409, 'SLUG_UNAVAILABLE');
  if (type === 'muscle-group') {
    const overlap = await db.query("SELECT 1 FROM muscle_groups WHERE id<>$1 AND lifecycle='PUBLISHED' AND svg_regions ?| $2::text[]", [id, regions]);
    if (overlap.rows.length) reject(409, 'REGION_KEY_UNAVAILABLE');
    await db.query('UPDATE muscle_groups SET label_vi=$2,slug=$3,svg_regions=$4,sort_order=$5 WHERE id=$1',
      [id, data.nameVi, data.slug, JSON.stringify(regions), data.sortOrder]);
  } else {
    await db.query('UPDATE equipment SET label_vi=$2,slug=$3 WHERE id=$1', [id, data.nameVi, data.slug]);
  }
}

export class AdminSupport {
  constructor(private readonly db: Database) {}

  async get(type: SupportType, id: string) { return resultOf(type, await getOwner(this.db, type, id)); }

  listRevisions(type: SupportType, id: string, query: Record<string, unknown>) {
    return listRevisions(this.db, type, id, query, document => snapshot(type, id, document));
  }

  async getRevision(type: SupportType, id: string, version: number) {
    const row = await getRevision(this.db, type, id, version);
    return revisionOf(row, snapshot(type, id, row.document));
  }

  restoreRevision(type: SupportType, id: string, actor: string, expected: number, key: string, selection: RevisionSelection) {
    return command(this.db, actor, `support:restore-revision:${type}:${id}`, key, { expected, selection }, async db => {
      const row = await getOwner(db, type, id, true);
      if (row.edit_version !== expected) reject(412, 'VERSION_MISMATCH');
      const { version, draft } = await restoreDraft(db, type, id, actor, expected, selection.version, selection.reason);
      return { version, detail: revisionOf(await getRevision(db, type, id, version), snapshot(type, id, draft)) };
    });
  }

  async list(type: SupportType, input: Record<string, unknown>) {
    const { query, limit } = queryInput(input, ['q', 'status', 'sort', 'cursor', 'limit', 'exerciseId']);
    const search = query.q?.trim() ?? '', sort = query.sort ?? 'updated_desc';
    if ((query.q !== undefined && !search) || search.length > 120 ||
        (query.status !== undefined && !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(query.status)) ||
        !['updated_desc', 'name_asc'].includes(sort) ||
        (query.exerciseId !== undefined && !identifier.test(query.exerciseId))) reject(400, 'BAD_REQUEST');
    if (query.exerciseId !== undefined && type !== 'exercise-variant') reject(422, 'FILTER_NOT_APPLICABLE');
    const filter = fingerprint([type, search, query.status ?? null, sort, limit, query.exerciseId ?? null]);
    const cursor = decodeCursor(query.cursor, filter);
    const name = type === 'media' ? "r.document->>'altText'" : "r.document->>'nameVi'";
    const nameSort = sort === 'name_asc';
    const sortKey = nameSort ? `catalog_search_key(${name}) COLLATE "C"` : "date_trunc('milliseconds',o.updated_at)";
    const cursorKey = nameSort ? '$5::text COLLATE "C"' : '$5::timestamptz';
    if (!nameSort && cursor && !Number.isFinite(Date.parse(cursor.key))) reject(400, 'INVALID_CURSOR');
    const { rows } = await this.db.query<Owner & { sort_key: string | Date }>(
      selectOwner(type, ', ' + sortKey + ' AS sort_key') +
      ` WHERE ($2::text IS NULL OR o.lifecycle=$2) AND strpos(catalog_search_key(${name}),catalog_search_key($3))>0
        AND ($4::text IS NULL OR ${sortKey} ${nameSort ? '>' : '<'} ${cursorKey} OR (${sortKey}=${cursorKey} AND o.id COLLATE "C" > $4 COLLATE "C"))
        ${type === 'exercise-variant' ? 'AND ($7::text IS NULL OR o.exercise_id=$7)' : ''}
        ORDER BY sort_key ${nameSort ? 'ASC' : 'DESC'}, o.id COLLATE "C" LIMIT $6`,
      [type, query.status ?? null, search, cursor?.id ?? null, cursor && !nameSort ? new Date(cursor.key).toISOString() : cursor?.key ?? null,
        limit + 1, ...(type === 'exercise-variant' ? [query.exerciseId ?? null] : [])]);
    const page = rows.slice(0, limit), last = page.at(-1);
    return { items: page.map(row => resultOf(type, row).detail), nextCursor: rows.length > limit && last
      ? cursorFor(filter, last.id, nameSort ? String(last.sort_key) : iso(last.sort_key as Date)) : null };
  }

  create(type: SupportType, input: SupportCreate, actor: string, key: string) {
    validateInput(type, input);
    const { id, data } = input, table = support[type].owner;
    return command(this.db, actor, 'support:create:' + type, key, input, async db => {
      const variant = type === 'exercise-variant';
      if (variant && !(await db.query('SELECT 1 FROM exercises WHERE id=$1 AND deleted_at IS NULL FOR SHARE', [data.exerciseId])).rows.length) reject(422, 'INVALID_EXERCISE_REFERENCE');
      const objectVersion = type === 'media' ? await readyObject(db, data, actor) : null;
      const inserted = await db.query(`INSERT INTO ${table}(id,lifecycle,created_by${variant ? ',exercise_id' : ''})
        VALUES($1,'DRAFT',$2${variant ? ',$3' : ''}) ON CONFLICT(id) DO NOTHING RETURNING id`,
        [id, actor, ...(variant ? [data.exerciseId] : [])]);
      if (!inserted.rows.length) reject(409, 'CONTENT_ID_EXISTS');
      await saveRevision(db, type, id, 1, data, data.regionKey ? [data.regionKey] : [], objectVersion, actor, 'CREATE_DRAFT');
      await db.query(`UPDATE ${table} SET current_draft_version=1 WHERE id=$1`, [id]);
      await audit(db, actor, type, id, 'CREATE_DRAFT', null, 1, randomUUID());
      return resultOf(type, await getOwner(db, type, id));
    });
  }

  update(type: SupportType, id: string, input: SupportInput, actor: string, expected: number) {
    validateInput(type, input);
    return this.db.transaction(async db => {
      const row = await getOwner(db, type, id, true);
      if (row.edit_version !== expected) reject(412, 'VERSION_MISMATCH');
      if (row.lifecycle === 'ARCHIVED') reject(409, 'CONTENT_ARCHIVED');
      const data = { ...row.document, ...input.data };
      if (data.exerciseId !== row.document.exerciseId) reject(422, 'VARIANT_PARENT_IMMUTABLE');
      const regions = input.data.regionKey === undefined ? row.revision_regions : [input.data.regionKey];
      const objectChanged = data.uploadId !== row.document.uploadId || data.kind !== row.document.kind;
      const provenanceChanged = ['sourceUri', 'credit', 'licenseRef'].some(field =>
        data[field as keyof SupportData] !== row.document[field as keyof SupportData]);
      if (type === 'media' && (objectChanged || provenanceChanged) && input.data.rightsStatus === undefined) data.rightsStatus = 'PENDING';
      const objectVersion = type === 'media' && objectChanged ? await readyObject(db, data, actor) : row.object_version;
      if (type === 'media' && input.data.rightsStatus === 'REJECTED') {
        await db.query('UPDATE media_uploads SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1', [data.uploadId]);
      }
      const version = expected + 1;
      await saveRevision(db, type, id, version, data, regions, objectVersion, actor, 'UPDATE_DRAFT');
      await db.query(`UPDATE ${support[type].owner} SET edit_version=$2,current_draft_version=$2,updated_at=now() WHERE id=$1`, [id, version]);
      await audit(db, actor, type, id, 'UPDATE_DRAFT', expected, version, randomUUID());
      return resultOf(type, await getOwner(db, type, id));
    });
  }

  transition(type: SupportType, id: string, action: Action, actor: string, expected: number, key: string, reason?: string) {
    return command(this.db, actor, `support:${action}:${type}:${id}`, key, { expected, reason: reason ?? null }, async db => {
      // Exercise publication and bootstrap import acquire the same lock before they pin support revisions.
      await db.query('SELECT pg_advisory_xact_lock(73002)');
      const row = await getOwner(db, type, id, true);
      if (row.edit_version !== expected) reject(412, 'VERSION_MISMATCH');
      const { owner, reference, refId } = support[type];
      const version = expected + 1;
      let revision = 'v' + version;
      if (action === 'PUBLISH') {
        if (row.lifecycle === 'ARCHIVED' || row.current_draft_version === row.current_published_version) reject(409, 'NO_PUBLISHABLE_DRAFT');
        if (type === 'media') {
          if (row.document.rightsStatus !== 'APPROVED') reject(422, 'MEDIA_NOT_APPROVED');
          if (await readyObject(db, row.document) !== row.object_version) reject(422, 'MEDIA_UPLOAD_NOT_READY');
        }
        await projectTaxonomy(db, type, id, row.document, row.revision_regions);
        await db.query(`UPDATE ${owner} SET lifecycle='PUBLISHED',edit_version=$2,current_published_version=current_draft_version,
          updated_at=now() WHERE id=$1`, [id, version]);
      } else if (action === 'ARCHIVE') {
        if (row.lifecycle === 'ARCHIVED') reject(409, 'CONTENT_ARCHIVED');
        const linked = await db.query(`SELECT 1 FROM ${reference} r JOIN exercises e ON e.id=r.exercise_id
          AND e.current_published_version=r.version WHERE r.${refId}=$1 AND e.lifecycle='PUBLISHED' LIMIT 1`, [id]);
        if (linked.rows.length) reject(409, 'CONTENT_IN_PUBLIC_USE');
        await db.query(`UPDATE ${owner} SET lifecycle='ARCHIVED',edit_version=$2,current_published_version=NULL,
          updated_at=now() WHERE id=$1`, [id, version]);
      } else {
        if (row.lifecycle !== 'ARCHIVED') reject(409, 'CONTENT_NOT_ARCHIVED');
        await restoreDraft(db, type, id, actor, expected, row.current_draft_version);
        return resultOf(type, await getOwner(db, type, id));
      }
      if (action === 'PUBLISH' || (action === 'ARCHIVE' && row.lifecycle === 'PUBLISHED')) {
        revision = 'cms-' + randomUUID();
        await db.query(`INSERT INTO publication_revisions(revision,content_type,content_id,entity_version,action,actor)
          VALUES($1,$2,$3,$4,$5,$6)`, [revision, type, id, action === 'PUBLISH' ? row.current_draft_version : row.current_published_version, action, actor]);
      }
      await audit(db, actor, type, id, action, expected, version, randomUUID(), revision, reason);
      return resultOf(type, await getOwner(db, type, id));
    });
  }
}
