import { randomUUID } from 'node:crypto';
import type { Database, SqlClient } from '../../database.js';
import { identifier, reject, uuid } from '../admin/admin-contract.js';
import { audit, command, cursorFor, decodeCursor, fingerprint, iso, queryInput } from '../admin/admin-store.js';
import { draftOf, exerciseStats, getOwner, listExercises, resultOf, type Draft, type ExerciseOwner } from './admin-exercise-store.js';
import { getRevision, listRevisions, revisionOf, type RevisionSelection } from '../revisions/admin-revisions.js';
import { pinPublicMedia, publicMediaPath, type PublishedMedia } from '../media/public-media.js';

export type { Draft } from './admin-exercise-store.js';

type Reference = Record<string, unknown> & { id: string; version: number | null };
type PublishedVariant = Reference & { version: number; nameVi: string; notes?: string };
type Pins = { groups: Reference[]; equipment: Reference[]; variants: PublishedVariant[]; media: PublishedMedia[] };

const historyDraft = (document: unknown) => draftOf(document as Parameters<typeof draftOf>[0]);

function requireVersion(row: ExerciseOwner, expected: number) {
  if (row.edit_version !== expected) reject(412, 'VERSION_MISMATCH');
}
async function validateReferences(db: SqlClient, draft: Draft, publish: boolean, mediaOrigin?: string) {
  const secondary = draft.secondaryMuscleIds ?? [];
  if (secondary.some(id => draft.primaryMuscleIds.includes(id))) reject(422, 'OVERLAPPING_MUSCLES');
  const strings = [draft.nameVi, draft.summary, ...draft.instructions, ...(draft.commonMistakes ?? []), draft.nameEn, draft.sourceRef];
  if (strings.some(value => value !== undefined && (!value.trim() || value.includes('\u0000')))) reject(422, 'VALIDATION_ERROR');
  for (const ids of [draft.mediaIds ?? [], draft.variantIds ?? []]) {
    if (new Set(ids).size !== ids.length) reject(422, 'DUPLICATE_REFERENCE');
  }
  const mediaIds = draft.mediaIds ?? [];
  const roles = draft.imageRoles ?? {};
  const roleIds = Object.values(roles);
  if (roles.main && (roles.start || roles.peak) || roles.peak && !roles.start ||
      new Set(roleIds).size !== roleIds.length || roleIds.some(id => !mediaIds.includes(id))) {
    reject(422, 'INVALID_IMAGE_ROLES');
  }
  let media: PublishedMedia[] = [];
  if (publish && mediaIds.length) {
    if (!mediaOrigin) reject(422, 'MEDIA_NOT_APPROVED');
    media = await pinPublicMedia(db, mediaIds);
    if (media.length !== mediaIds.length) reject(422, 'MEDIA_NOT_APPROVED');
    if (media.some(item => roleIds.includes(item.id) && item.kind !== 'IMAGE')) reject(422, 'INVALID_IMAGE_ROLES');
  }
  const suffix = publish ? " AND lifecycle='PUBLISHED' AND current_published_version IS NOT NULL ORDER BY id FOR SHARE" : '';
  const groups = [...draft.primaryMuscleIds, ...secondary];
  const [muscles, equipment] = [
    await db.query<Reference>('SELECT id,current_published_version AS version FROM muscle_groups WHERE id=ANY($1::text[])' + suffix, [groups]),
    await db.query<Reference>('SELECT id,current_published_version AS version FROM equipment WHERE id=ANY($1::text[])' + suffix, [draft.equipmentIds]),
  ];
  if (muscles.rows.length !== groups.length || equipment.rows.length !== draft.equipmentIds.length) reject(422, 'INVALID_TAXONOMY_REFERENCE');
  const variantIds = draft.variantIds ?? [];
  let variants: PublishedVariant[] = [];
  if (publish && variantIds.length) {
    variants = (await db.query<PublishedVariant>(`SELECT v.id,r.version,r.document->>'nameVi' AS "nameVi",r.document->>'notes' AS notes
      FROM exercise_variants v JOIN support_revisions r ON r.variant_id=v.id AND r.version=v.current_published_version
      WHERE v.id=ANY($1::text[]) AND v.exercise_id=$2 AND v.lifecycle='PUBLISHED' ORDER BY v.id FOR SHARE OF v`, [variantIds, draft.id])).rows;
    if (variants.length !== variantIds.length) reject(422, 'VARIANT_NOT_PUBLISHED');
  }
  return { groups: muscles.rows, equipment: equipment.rows, variants, media };
}
async function saveRevision(db: SqlClient, draft: Draft, version: number, actor: string, publication?: { revision: string; pins: Pins; mediaOrigin?: string }) {
  const document = draftOf(draft);
  const { mediaIds: _media, variantIds: _variants, sourceRef: _source, imageRoles, ...publicFields } = document;
  const variants = publication ? (draft.variantIds ?? []).map(id => {
    const variant = publication.pins.variants.find(item => item.id === id)!;
    return { id, nameVi: variant.nameVi, ...(variant.notes ? { notes: variant.notes } : {}) };
  }) : [];
  const media = publication ? (draft.mediaIds ?? []).map(id => {
    const asset = publication.pins.media.find(item => item.id === id)!;
    const role = Object.entries(imageRoles ?? {}).find(([, mediaId]) => mediaId === id)?.[0];
    return {
      kind: asset.kind, altText: asset.altText, ...(asset.credit && { credit: asset.credit }),
      ...(role && { role }),
      url: publication.mediaOrigin + publicMediaPath(id, asset.version),
    };
  }) : [];
  const payload = publication ? { ...publicFields, media, variants, publishedRevision: publication.revision } : document;
  await db.query('INSERT INTO exercise_revisions(exercise_id,version,document,author) VALUES($1,$2,$3,$4)',
    [draft.id, version, JSON.stringify(payload), actor]);
  for (const [rank, ids] of [['PRIMARY', draft.primaryMuscleIds], ['SECONDARY', draft.secondaryMuscleIds ?? []]] as const) {
    for (const group of ids) await db.query('INSERT INTO revision_muscle_groups(exercise_id,version,group_id,rank,support_version) VALUES($1,$2,$3,$4,$5)',
      [draft.id, version, group, rank, publication?.pins.groups.find(item => item.id === group)?.version ?? null]);
  }
  for (const item of draft.equipmentIds) await db.query('INSERT INTO revision_equipment(exercise_id,version,equipment_id,support_version) VALUES($1,$2,$3,$4)',
    [draft.id, version, item, publication?.pins.equipment.find(entry => entry.id === item)?.version ?? null]);
  for (const variant of publication?.pins.variants ?? []) await db.query('INSERT INTO revision_variants VALUES($1,$2,$3,$4)',
    [draft.id, version, variant.id, variant.version]);
  for (const [order, id] of (publication ? draft.mediaIds ?? [] : []).entries()) {
    const asset = publication!.pins.media.find(item => item.id === id)!;
    await db.query('INSERT INTO revision_media(exercise_id,version,media_id,support_version,display_order) VALUES($1,$2,$3,$4,$5)',
      [draft.id, version, id, asset.version, order]);
  }
}
async function appendEvent(db: SqlClient, actor: string, id: string, type: string, version: number, correlationId: string, reason?: string) {
  const revision = 'cms-' + randomUUID(), occurredAt = new Date().toISOString(), eventId = randomUUID();
  const { rows } = await db.query<{ aggregate_version: string }>(`
    INSERT INTO publication_revisions(revision,created_at,exercise_id,entity_version,action,actor,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING aggregate_version`, [revision, occurredAt, id, version, type, actor,reason??null]);
  const aggregateVersion = Number(rows[0].aggregate_version);
  if (!Number.isSafeInteger(aggregateVersion)) throw new Error('Catalog sequence exceeds event range');
  const payload = { id: eventId, type, producer: 'catalog', schemaVersion: 1, aggregateId: 'catalog', aggregateVersion, occurredAt,
    correlationId, data: { exerciseId: id, revision, contentRevision: version, ...(reason ? { reason } : {}) } };
  await db.query('INSERT INTO outbox_events(event_id,type,aggregate_version,occurred_at,correlation_id,payload) VALUES($1,$2,$3,$4,$5,$6)',
    [eventId, type, aggregateVersion, occurredAt, correlationId, JSON.stringify(payload)]);
  return revision;
}

export class AdminCatalog {
  constructor(private readonly db: Database, private readonly mediaOrigin?: string) {}

  async get(id: string) { return resultOf(await getOwner(this.db, id)); }

  stats() { return exerciseStats(this.db); }

  listRevisions(id: string, query: Record<string, unknown>) { return listRevisions(this.db, 'exercise', id, query, historyDraft); }

  async getRevision(id: string, version: number) {
    const row = await getRevision(this.db, 'exercise', id, version);
    return revisionOf(row, historyDraft(row.document));
  }

  list(input: Record<string, unknown>) { return listExercises(this.db, input); }

  async listAudit(input: Record<string, unknown>) {
    const { query, limit } = queryInput(input, ['contentType', 'contentId', 'actorUserId', 'from', 'to', 'cursor', 'limit']);
    if ((query.contentType !== undefined && !['exercise', 'muscle-group', 'equipment', 'exercise-variant', 'media', 'import'].includes(query.contentType)) ||
        (query.contentId !== undefined && !identifier.test(query.contentId)) ||
        (query.actorUserId !== undefined && !uuid.test(query.actorUserId))) reject(400, 'BAD_REQUEST');
    const dates = [query.from, query.to].map(value => {
      if (value === undefined) return null;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) reject(400, 'BAD_REQUEST');
      return new Date(value).toISOString();
    });
    if (dates[0] && dates[1] && dates[0] >= dates[1]) reject(400, 'BAD_REQUEST');
    const filter = fingerprint([query.contentType, query.contentId, query.actorUserId, ...dates, limit]);
    const cursor = decodeCursor(query.cursor, filter);
    if (cursor && (!/^\d{1,19}$/.test(cursor.key) || BigInt(cursor.key) > 9223372036854775807n)) reject(400, 'INVALID_CURSOR');
    const { rows } = await this.db.query<Record<string, unknown> & { sequence: string; contentId: string; at: Date }>(`
      SELECT sequence,id,actor_id AS "actorUserId",action,at,revision,content_type AS "contentType",
        content_id AS "contentId",before_version AS "beforeVersion",after_version AS "afterVersion",
        source_version AS "sourceVersion",correlation_id AS "correlationId",reason
      FROM catalog_audit WHERE ($1::text IS NULL OR content_type=$1) AND ($2::text IS NULL OR content_id=$2)
        AND ($3::uuid IS NULL OR actor_id=$3) AND ($4::timestamptz IS NULL OR at >= $4) AND ($5::timestamptz IS NULL OR at < $5)
        AND ($6::bigint IS NULL OR sequence < $6) ORDER BY sequence DESC LIMIT $7`,
      [query.contentType ?? null, query.contentId ?? null, query.actorUserId ?? null, ...dates, cursor?.key ?? null, limit + 1]);
    const page = rows.slice(0, limit), last = page.at(-1);
    return { items: page.map(({ sequence: _sequence, at, ...row }) => ({
      ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)), at: iso(at),
      ...(row.contentType === 'exercise' ? { exerciseId: row.contentId } : {}),
    })), nextCursor: rows.length > limit && last ? cursorFor(filter, last.contentId, last.sequence) : null };
  }

  listExerciseAudit(input: Record<string, unknown>) {
    queryInput(input, ['exerciseId', 'limit', 'cursor']);
    const { exerciseId, ...page } = input;
    return this.listAudit({ ...page, contentType: 'exercise', ...(exerciseId === undefined ? {} : { contentId: exerciseId }) });
  }

  create(draft: Draft, actor: string, key: string) {
    return command(this.db, actor, 'create', key, draft, async db => {
      await validateReferences(db, draft, false);
      const row = await db.query("INSERT INTO exercises(id,lifecycle,created_by) VALUES($1,'DRAFT',$2) ON CONFLICT DO NOTHING RETURNING id", [draft.id, actor]);
      if (!row.rows.length) reject(409, 'EXERCISE_ID_EXISTS');
      await saveRevision(db, draft, 1, actor);
      await db.query('UPDATE exercises SET current_draft_version=1 WHERE id=$1', [draft.id]);
      await audit(db, actor, 'exercise', draft.id, 'CREATE_DRAFT', null, 1, randomUUID());
      return resultOf(await getOwner(db, draft.id));
    });
  }

  update(id: string, patch: Partial<Draft>, actor: string, expected: number) {
    return this.db.transaction(async db => {
      const row = await getOwner(db, id, true);
      requireVersion(row, expected);
      if (row.lifecycle === 'ARCHIVED') reject(409, 'EXERCISE_ARCHIVED');
      const draft = { ...draftOf(row.draft), ...patch, id }, version = expected + 1;
      await validateReferences(db, draft, false);
      await saveRevision(db, draft, version, actor);
      await db.query('UPDATE exercises SET edit_version=$2,current_draft_version=$2,updated_at=now() WHERE id=$1', [id, version]);
      await audit(db, actor, 'exercise', id, 'UPDATE_DRAFT', expected, version, randomUUID());
      return resultOf(await getOwner(db, id));
    });
  }

  publish(id: string, actor: string, expected: number, key: string) {
    return command(this.db, actor, 'publish:' + id, key, { expected }, async db => {
      // The bootstrap importer uses the same lock. Publication sequence and slug changes follow commit order.
      await db.query('SELECT pg_advisory_xact_lock(73002)');
      const row = await getOwner(db, id, true);
      requireVersion(row, expected);
      if (row.lifecycle === 'ARCHIVED' || !row.current_draft_version || row.current_draft_version === row.published_from_version) reject(409, 'NO_PUBLISHABLE_DRAFT');
      const draft = draftOf(row.draft);
      if (!draft.workoutType || !draft.focusArea || !draft.difficulty) reject(422, 'EXERCISE_CLASSIFICATION_REQUIRED');
      const pins = await validateReferences(db, draft, true, this.mediaOrigin);
      const slug = (await db.query<{ exercise_id: string }>('SELECT exercise_id FROM slug_history WHERE slug=$1', [draft.slug])).rows[0];
      if (slug && slug.exercise_id !== id) reject(409, 'SLUG_UNAVAILABLE');
      await db.query("UPDATE slug_history SET state='ALIAS' WHERE exercise_id=$1 AND state='CANONICAL' AND slug<>$2", [id, draft.slug]);
      await db.query(`INSERT INTO slug_history(slug,exercise_id,state) VALUES($1,$2,'CANONICAL')
        ON CONFLICT(slug) DO UPDATE SET state='CANONICAL'`, [draft.slug, id]);
      const version = expected + 1, correlation = randomUUID();
      const type = row.current_published_version ? 'catalog.exercise.updated.v1' : 'catalog.exercise.published.v1';
      const revision = await appendEvent(db, actor, id, type, version, correlation);
      await saveRevision(db, draft, version, actor, { revision, pins, mediaOrigin: this.mediaOrigin });
      await db.query(`UPDATE exercises SET edit_version=$2,current_published_version=$2,published_from_version=current_draft_version,
        lifecycle='PUBLISHED',updated_at=now() WHERE id=$1`, [id, version]);
      await audit(db, actor, 'exercise', id, 'PUBLISH', expected, version, correlation, revision);
      return resultOf(await getOwner(db, id));
    });
  }

  unpublish(id: string, actor: string, expected: number, key: string, reason: string) {
    return command(this.db, actor, 'unpublish:' + id, key, { expected, reason }, async db => {
      await db.query('SELECT pg_advisory_xact_lock(73002)');
      const row = await getOwner(db, id, true);
      requireVersion(row, expected);
      if (row.lifecycle === 'ARCHIVED') reject(409, 'EXERCISE_ARCHIVED');
      const version = expected + 1, correlation = randomUUID();
      const wasPublished = row.lifecycle === 'PUBLISHED';
      const revision = wasPublished ? await appendEvent(db, actor, id, 'catalog.exercise.unpublished.v1', version, correlation, 'ARCHIVED') : undefined;
      await db.query(`UPDATE exercises SET edit_version=$2,current_draft_version=coalesce(current_draft_version,current_published_version),
        current_published_version=NULL,published_from_version=NULL,lifecycle='ARCHIVED',updated_at=now() WHERE id=$1`, [id, version]);
      await audit(db, actor, 'exercise', id, wasPublished ? 'UNPUBLISH' : 'ARCHIVE', expected, version, correlation, revision, reason);
      return resultOf(await getOwner(db, id));
    });
  }

  deleteArchived(id: string, actor: string, expected: number, key: string) {
    return command(this.db, actor, 'delete:' + id, key, { expected }, async db => {
      const row = await getOwner(db, id, true);
      requireVersion(row, expected);
      if (row.lifecycle !== 'ARCHIVED') reject(409, 'EXERCISE_NOT_ARCHIVED');
      await db.query('UPDATE exercises SET deleted_at=now(),edit_version=$2,updated_at=now() WHERE id=$1', [id, expected + 1]);
      await audit(db, actor, 'exercise', id, 'DELETE', expected, expected + 1, randomUUID());
      return { id, deleted: true };
    });
  }

  restore(id: string, actor: string, expected: number, key: string, selection?: RevisionSelection) {
    return command(this.db, actor, (selection ? 'restore-revision:' : 'restore:') + id, key, { expected, selection: selection ?? null }, async db => {
      const row = await getOwner(db, id, true);
      requireVersion(row, expected);
      if (!selection && row.lifecycle !== 'ARCHIVED') reject(409, 'EXERCISE_NOT_ARCHIVED');
      const sourceVersion = selection?.version ?? row.current_draft_version ?? row.current_published_version!;
      const source = await getRevision(db, 'exercise', id, sourceVersion);
      const draft = historyDraft(source.document), version = expected + 1;
      await validateReferences(db, draft, false);
      await saveRevision(db, draft, version, actor);
      await db.query(`UPDATE exercises SET edit_version=$2,current_draft_version=$2,updated_at=now(),
        lifecycle=CASE WHEN lifecycle='ARCHIVED' THEN 'DRAFT' ELSE lifecycle END WHERE id=$1`, [id, version]);
      await audit(db, actor, 'exercise', id, selection ? 'RESTORE_REVISION' : 'RESTORE', expected, version,
        randomUUID(), undefined, selection?.reason, sourceVersion);
      return selection ? { version, detail: revisionOf(await getRevision(db, 'exercise', id, version), draft) }
        : resultOf(await getOwner(db, id));
    });
  }
}
