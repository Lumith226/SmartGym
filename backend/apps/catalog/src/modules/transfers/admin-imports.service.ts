import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { reject, valid } from '../admin/admin-contract.js';
import { audit, command, fingerprint, iso } from '../admin/admin-store.js';
import { AdminCatalog, type Draft } from '../exercises/admin-catalog.service.js';
import { AdminSupport, type SupportCreate } from '../content/admin-support.service.js';
import type { Database, SqlClient } from '../../database.js';

export type ImportRequest = { sourceKey: 'SMARTGYM_KB'; sourceRevision: string; manifestSha256: string };
type RecordInput = { contentType: 'exercise'; data: Draft } | SupportCreate;
type Package = { sourceKey: 'SMARTGYM_KB'; sourceRevision: string;
  provenance: { sourceRef: string; sha256: string; rights: string }; records: RecordInput[] };
type Base = { type: string; id: string; version: number };
type Report = { sourceRef: string; code: string; message: string };
type Job = Record<string, unknown> & { id: string; source_revision: string; manifest_sha256: string;
  status: string; package: Package; base_versions: Base[]; base_digest: string;
  accepted_count: number; error_count: number; report: Report[]; edit_version: number; updated_at: Date };
const tables = { exercise: 'exercises', 'muscle-group': 'muscle_groups', equipment: 'equipment',
  'exercise-variant': 'exercise_variants', media: 'media_assets' } as const;
const idOf = (row: RecordInput) => row.contentType === 'exercise' ? row.data.id : row.id;
const keyOf = (row: RecordInput) => row.contentType + ':' + idOf(row);
const sourceId = (id: string) => 'ex_' + createHash('sha256').update(id).digest('hex');
const rank = { 'muscle-group': 0, equipment: 1, media: 2, exercise: 3, 'exercise-variant': 4 };
const sorted = (rows: RecordInput[]) => [...rows].sort((a, b) => rank[a.contentType] - rank[b.contentType] || keyOf(a).localeCompare(keyOf(b), 'en'));
function resultOf(row: Job) {
  return { version: row.edit_version, detail: { id: row.id, status: row.status, sourceRevision: row.source_revision,
    manifestSha256: row.manifest_sha256, baseEditVersionsDigest: row.base_digest,
    acceptedCount: row.accepted_count, errorCount: row.error_count, report: row.report, updatedAt: iso(row.updated_at) } };
}
function packageValid(value: unknown): value is Package {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Package;
  return Object.keys(p).every(k => ['sourceKey', 'sourceRevision', 'provenance', 'records'].includes(k)) &&
    p.sourceKey === 'SMARTGYM_KB' && typeof p.sourceRevision === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(p.sourceRevision) &&
    !!p.provenance && typeof p.provenance === 'object' && Object.keys(p.provenance).every(k => ['sourceRef', 'sha256', 'rights'].includes(k)) &&
    typeof p.provenance.sha256 === 'string' && /^[a-f0-9]{64}$/.test(p.provenance.sha256) &&
    [p.provenance.sourceRef, p.provenance.rights].every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 500 && !s.includes('\u0000')) &&
    Array.isArray(p.records) && p.records.length >= 1 && p.records.length <= 200 &&
    p.records.every(r => r && typeof r === 'object' &&
      (r.contentType === 'exercise'
        ? Object.keys(r).every(k => ['contentType', 'data'].includes(k)) && valid('ExerciseDraftCreate', r.data)
        : valid('CmsContentCreate', r))) && new Set(p.records.map(keyOf)).size === p.records.length;
}

// Only operator-registered local files are read. No request path or URL is resolved.
async function loadPackage(request: ImportRequest, registryFile?: string): Promise<unknown> {
  if (!registryFile) reject(503, 'CATALOG_IMPORT_NOT_CONFIGURED');
  try {
    const registry = JSON.parse(await readFile(registryFile, 'utf8')) as (ImportRequest & { file: string })[];
    if (!Array.isArray(registry) || registry.length > 1000) throw new Error();
    const matches = registry.filter(r => r.sourceKey === request.sourceKey && r.sourceRevision === request.sourceRevision && r.manifestSha256 === request.manifestSha256);
    if (matches.length !== 1) reject(404, 'IMPORT_PACKAGE_NOT_REGISTERED');
    const entry = matches[0];
    if (typeof entry.file !== 'string' || isAbsolute(entry.file) || /^[a-z]+:/i.test(entry.file)) throw new Error();
    const root = await realpath(dirname(resolve(registryFile)));
    const file = await realpath(resolve(root, entry.file));
    const rel = relative(root, file);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error();
    const bytes = await readFile(file);
    if (bytes.length > 2 * 1024 * 1024) reject(422, 'IMPORT_PACKAGE_TOO_LARGE');
    const value = JSON.parse(bytes.toString('utf8'));
    if (fingerprint(value) !== request.manifestSha256) reject(422, 'IMPORT_MANIFEST_MISMATCH');
    return value;
  } catch (error) {
    if (error instanceof HttpException) throw error;
    reject(503, 'CATALOG_IMPORT_PACKAGE_UNAVAILABLE');
  }
}
function boundDatabase(db: SqlClient): Database {
  return { query: (sql, values) => db.query(sql, values), transaction: action => action(db), close: async () => {} };
}
async function baseVersions(db: SqlClient, records: RecordInput[]) {
  const base: Base[] = [];
  for (const row of [...records].sort((a, b) => keyOf(a).localeCompare(keyOf(b), 'en'))) {
    const found = (await db.query<{ edit_version: number }>(`SELECT edit_version FROM ${tables[row.contentType]} WHERE id=$1 FOR UPDATE`, [idOf(row)])).rows[0];
    base.push({ type: row.contentType, id: idOf(row), version: found?.edit_version ?? 0 });
  }
  return base;
}
async function writeDrafts(db: SqlClient, pkg: Package, base: Base[], actor: string, jobId: string) {
  const database = boundDatabase(db), catalog = new AdminCatalog(database), support = new AdminSupport(database);
  for (const row of sorted(pkg.records)) {
    const version = base.find(v => v.type === row.contentType && v.id === idOf(row))!.version;
    const key = jobId + '_' + fingerprint(keyOf(row)).slice(0, 16);
    if (row.contentType === 'exercise') {
      if (version) await catalog.update(row.data.id, row.data, actor, version);
      else await catalog.create(row.data, actor, key);
    } else {
      if (version) await support.update(row.contentType, row.id, row, actor, version);
      else await support.create(row.contentType, row, actor, key);
    }
  }
}

export class AdminImports {
  constructor(private readonly database: Database, private readonly registryFile?: string) {}

  async get(id: string) {
    const row = (await this.database.query<Job>('SELECT * FROM catalog_import_jobs WHERE id=$1', [id])).rows[0];
    if (!row) reject(404, 'NOT_FOUND');
    return resultOf(row);
  }

  create(request: ImportRequest, actor: string, key: string) {
    return command(this.database, actor, 'cms-import:validate', key, request, async db => {
      await db.query('SELECT pg_advisory_xact_lock(73002)');
      const prior = (await db.query<Job>(`SELECT * FROM catalog_import_jobs WHERE source_key=$1 AND source_revision=$2 AND manifest_sha256=$3`,
        [request.sourceKey, request.sourceRevision, request.manifestSha256])).rows[0];
      if (prior) return resultOf(prior);
      const value = await loadPackage(request, this.registryFile);
      const id = 'imp_' + randomUUID().replaceAll('-', '');
      let pkg: Package | undefined, base: Base[] = [], report: Report[] = [];
      if (!packageValid(value) || value.sourceRevision !== request.sourceRevision) {
        report = [{ sourceRef: request.sourceRevision, code: 'INVALID_PACKAGE', message: 'Gói KB sai schema, provenance hoặc có ID trùng.' }];
      } else {
        pkg = value;
        base = await baseVersions(db, pkg.records);
        // Reuse aggregate validation without committing preview revisions, audit or receipts.
        await db.query('SAVEPOINT cms_import_preview');
        try { await writeDrafts(db, pkg, base, actor, id); }
        catch (error) {
          if (!(error instanceof HttpException) && !['23505', '23503', '23514'].includes(String((error as { code?: string }).code))) throw error;
          report = [{ sourceRef: pkg.provenance.sourceRef, code: 'INVALID_CONTENT', message: 'Nội dung, tham chiếu, trạng thái hoặc quyền media không hợp lệ.' }];
        } finally { await db.query('ROLLBACK TO SAVEPOINT cms_import_preview'); await db.query('RELEASE SAVEPOINT cms_import_preview'); }
      }
      const accepted = report.length ? 0 : pkg!.records.length;
      const row = (await db.query<Job>(`INSERT INTO catalog_import_jobs(id,source_key,source_revision,manifest_sha256,status,package,
        base_versions,base_digest,accepted_count,error_count,report,actor_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [id, request.sourceKey, request.sourceRevision, request.manifestSha256, report.length ? 'REJECTED' : 'READY', JSON.stringify(value),
          JSON.stringify(base), fingerprint(base), accepted, report.length, JSON.stringify(report), actor])).rows[0];
      await audit(db, actor, 'import', id, 'VALIDATE_IMPORT', null, 1, randomUUID());
      return resultOf(row);
    });
  }

  apply(id: string, actor: string, expected: number, key: string) {
    return command(this.database, actor, 'cms-import:apply:' + id, key, { expected, mode: 'DRAFT_ONLY' }, async db => {
      await db.query('SELECT pg_advisory_xact_lock(73002)');
      const job = (await db.query<Job>('SELECT * FROM catalog_import_jobs WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!job) reject(404, 'NOT_FOUND');
      if (job.status === 'APPLIED') return resultOf(job);
      if (job.edit_version !== expected) reject(412, 'VERSION_MISMATCH');
      if (job.status !== 'READY') reject(409, 'IMPORT_NOT_READY');
      const current = await baseVersions(db, job.package.records);
      if (fingerprint(current) !== job.base_digest) reject(409, 'IMPORT_BASE_CHANGED');
      await writeDrafts(db, job.package, current, actor, id);
      const row = (await db.query<Job>(`UPDATE catalog_import_jobs SET status='APPLIED',edit_version=edit_version+1,
        applied_at=now(),updated_at=now() WHERE id=$1 RETURNING *`, [id])).rows[0];
      await audit(db, actor, 'import', id, 'APPLY_IMPORT', expected, row.edit_version, randomUUID());
      return resultOf(row);
    });
  }

  async export(revision: string) {
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(revision)) reject(400, 'BAD_REQUEST');
    return this.database.transaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(73002)');
      const head = (await db.query<{ revision: string; aggregate_version: string; created_at: Date }>('SELECT * FROM publication_revisions ORDER BY aggregate_version DESC LIMIT 1')).rows[0];
      const cached = (await db.query<{ publication: { exercises: (Draft & { publishedRevision: string })[] }; sha256: string; generated_at: Date; expired: boolean }>(
        'SELECT *,expires_at<=now() AS expired FROM catalog_exports WHERE revision=$1', [revision])).rows[0];
      if (cached) {
        if (cached.expired) reject(410, 'EXPORT_EXPIRED');
        for (const exercise of cached.publication.exercises) {
          const live = (await db.query<{ revision: string }>(`SELECT r.document->>'publishedRevision' AS revision FROM exercises e
            JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
            WHERE e.id=$1 AND e.lifecycle='PUBLISHED'`, [exercise.id])).rows[0];
          if (live?.revision !== exercise.publishedRevision) reject(410, 'EXPORT_WITHDRAWN');
        }
        await assertMediaVisible(db, cached.publication.exercises.map(e => e.id));
        return { publication: cached.publication, sha256: cached.sha256, generatedAt: iso(cached.generated_at) };
      }
      if (!head || head.revision !== revision) {
        const known = (await db.query('SELECT 1 FROM publication_revisions WHERE revision=$1', [revision])).rows.length;
        reject(known ? 410 : 404, known ? 'EXPORT_NOT_RETAINED' : 'NOT_FOUND');
      }
      const exercises = (await db.query<{ document: Draft & { publishedRevision: string } }>(`SELECT r.document FROM exercises e
        JOIN exercise_revisions r ON r.exercise_id=e.id AND r.version=e.current_published_version
        WHERE e.lifecycle='PUBLISHED' ORDER BY e.id`)).rows.map(r => r.document);
      await assertMediaVisible(db, exercises.map(e => e.id));
      const sources = exercises.map(e => {
        const body = [e.summary, ...e.instructions, ...(e.commonMistakes ?? [])].join('\n\n');
        return { sourceId: sourceId(e.id), exerciseId: e.id, title: e.nameVi, bodyMarkdown: body,
          sourceRef: 'catalog:' + e.id + ':' + e.publishedRevision, digestSha256: createHash('sha256').update(body).digest('hex'), publicationStatus: 'PUBLISHED' };
      });
      const tombstones = (await db.query<{ id: string }>("SELECT id FROM exercises WHERE lifecycle='ARCHIVED' ORDER BY id")).rows
        .map(e => ({ exerciseId: e.id, sourceIds: [sourceId(e.id)], reason: 'ARCHIVED' }));
      const publication = { revision, aggregateVersion: Number(head.aggregate_version), publishedAt: iso(head.created_at), exercises, sources, tombstones };
      const sha256 = fingerprint(publication);
      const inserted = (await db.query<{ generated_at: Date }>('INSERT INTO catalog_exports(revision,publication,sha256) VALUES($1,$2,$3) RETURNING generated_at',
        [revision, JSON.stringify(publication), sha256])).rows[0];
      return { publication, sha256, generatedAt: iso(inserted.generated_at) };
    });
  }
}

async function assertMediaVisible(db: SqlClient, ids: string[]) {
  const invalid = await db.query(`SELECT 1 FROM revision_media p JOIN exercises e ON e.id=p.exercise_id AND e.current_published_version=p.version
    JOIN support_revisions r ON r.media_id=p.media_id AND r.version=p.support_version
    JOIN media_uploads u ON u.id=r.upload_id LEFT JOIN media_assets m ON m.id=r.media_id
    WHERE e.id=ANY($1::text[]) AND (u.revoked_at IS NOT NULL OR u.status<>'READY' OR u.verified_at IS NULL
      OR u.object_version<>r.object_version OR r.document->>'rightsStatus'<>'APPROVED' OR m.lifecycle<>'PUBLISHED') LIMIT 1`, [ids]);
  if (invalid.rows.length) reject(410, 'EXPORT_WITHDRAWN');
}
