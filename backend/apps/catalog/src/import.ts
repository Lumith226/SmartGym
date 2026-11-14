import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase, Database, type SqlClient } from './database.js';
import { Ajv2020 } from 'ajv/dist/2020.js';

export interface Exercise {
  id: string; slug: string; nameVi: string; nameEn?: string; summary: string;
  primaryMuscleIds: string[]; secondaryMuscleIds: string[]; equipmentIds: string[];
  instructions: string[]; commonMistakes: string[];
  workoutType?: 'STRENGTH' | 'CARDIO' | 'HIIT' | 'CORE' | 'STRETCHING';
  focusArea?: 'FULL_BODY' | 'UPPER_BODY' | 'LOWER_BODY' | 'ABS';
  difficulty?: 1 | 2 | 3 | 4 | 5;
  levelSets?: [number, number, number];
  restSeconds?: number;
  poseStyle?: 'squat' | 'pushup' | 'plank' | 'jump' | 'pull' | 'lunge' | 'core' | 'barbell';
  media: unknown[]; variants: unknown[]; publishedRevision: string;
}

export interface Snapshot {
  revision: string;
  approval: 'development-only' | 'approved';
  source: {
    path: string; sha256: string; rights: string;
    files?: { path: string; sha256: string; exerciseId?: string; needsClipCheck?: boolean }[];
  };
  muscleGroups: { id: string; labelVi: string; slug: string; svgRegions: string[] }[];
  equipment: { id: string; labelVi: string; slug: string }[];
  exercises: Exercise[];
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateShape = ajv.compile<Snapshot>(
  JSON.parse(readFileSync(new URL('../data/snapshot.schema.json', import.meta.url), 'utf8')),
);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function validateSnapshot(snapshot: unknown): asserts snapshot is Snapshot {
  if (!validateShape(snapshot)) {
    throw new Error('Invalid snapshot: ' + ajv.errorsText(validateShape.errors));
  }
  for (const rows of [snapshot.muscleGroups, snapshot.equipment, snapshot.exercises]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate ID');
    if (new Set(rows.map(row => row.slug)).size !== rows.length) throw new Error('Duplicate slug');
  }
  const groups = new Set(snapshot.muscleGroups.map(row => row.id));
  const equipment = new Set(snapshot.equipment.map(row => row.id));
  for (const row of snapshot.exercises) {
    if (row.publishedRevision !== snapshot.revision ||
      row.primaryMuscleIds.some(id => row.secondaryMuscleIds.includes(id))) {
      throw new Error('Invalid exercise revision or overlapping muscle groups');
    }
    if ([...row.primaryMuscleIds, ...row.secondaryMuscleIds].some(id => !groups.has(id)) ||
      row.equipmentIds.some(id => !equipment.has(id))) throw new Error('Invalid reference');
  }
}

async function importTaxonomy(client: SqlClient, item: Snapshot['equipment'][number], regions?: string[]) {
  const muscle = regions !== undefined;
  const table = muscle ? 'muscle_groups' : 'equipment';
  const type = muscle ? 'muscle-group' : 'equipment';
  const existing = (await client.query(`SELECT label_vi,slug,lifecycle${muscle ? ',svg_regions' : ''} FROM ${table} WHERE id=$1`, [item.id])).rows[0];
  if (existing) {
    if (existing.lifecycle !== 'PUBLISHED' || existing.label_vi !== item.labelVi || existing.slug !== item.slug ||
        (muscle && canonical(existing.svg_regions) !== canonical(regions))) throw new Error('Existing ' + type + ' differs: ' + item.id);
    return;
  }
  if (muscle && (await client.query("SELECT 1 FROM muscle_groups WHERE lifecycle='PUBLISHED' AND svg_regions ?| $1::text[] LIMIT 1", [regions])).rows.length) {
    throw new Error('Existing muscle group uses an SVG region: ' + item.id);
  }
  await client.query(`INSERT INTO ${table}(id,label_vi,slug,lifecycle${muscle ? ',svg_regions' : ''}) VALUES($1,$2,$3,'PUBLISHED'${muscle ? ',$4' : ''})`,
    [item.id, item.labelVi, item.slug, ...(muscle ? [JSON.stringify(regions)] : [])]);
  const document = { nameVi: item.labelVi, slug: item.slug, ...(muscle ? { sortOrder: 0 } : {}),
    ...(regions?.length === 1 ? { regionKey: regions[0] } : {}) };
  await client.query(`INSERT INTO support_revisions(content_type,content_id,version,document,svg_regions,action)
    VALUES($1,$2,1,$3,$4,'BOOTSTRAP')`, [type, item.id, JSON.stringify(document), JSON.stringify(regions ?? [])]);
  await client.query(`UPDATE ${table} SET current_draft_version=1,current_published_version=1 WHERE id=$1`, [item.id]);
}

export async function importSnapshot(database: Database, snapshot: unknown, allowDevelopment = false): Promise<void> {
  validateSnapshot(snapshot);
  if (snapshot.approval === 'development-only' && (!allowDevelopment || process.env.NODE_ENV === 'production')) {
    throw new Error('Development content cannot be published in this environment');
  }
  const checksum = createHash('sha256').update(canonical(snapshot)).digest('hex');
  const legacyChecksum = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  await database.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(73002)');
    const previous = await client.query('SELECT checksum FROM catalog_imports WHERE source_revision=$1', [snapshot.revision]);
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== checksum && previous.rows[0].checksum !== legacyChecksum) {
        throw new Error('Revision already exists with different content');
      }
      await client.query('UPDATE catalog_imports SET checksum=$2 WHERE source_revision=$1', [snapshot.revision, checksum]);
      return;
    }
    // Bootstrap can append identical shared taxonomy and new exercises, never replace existing content.
    for (const group of snapshot.muscleGroups) await importTaxonomy(client, group, group.svgRegions);
    for (const item of snapshot.equipment) await importTaxonomy(client, item);
    for (const row of snapshot.exercises) {
      const existing = (await client.query<{ lifecycle: string; document: Exercise | null }>(
        `SELECT e.lifecycle,r.document FROM exercises e LEFT JOIN exercise_revisions r
         ON r.exercise_id=e.id AND r.version=e.current_published_version WHERE e.id=$1`, [row.id],
      )).rows[0];
      if (existing) {
        const { publishedRevision: oldRevision, ...oldData } = existing.document ?? {} as Exercise;
        const { publishedRevision: newRevision, ...newData } = row;
        if (existing.lifecycle !== 'PUBLISHED' || canonical(oldData) !== canonical(newData)) {
          throw new Error('Existing exercise differs: ' + row.id);
        }
        continue;
      }
      await client.query("INSERT INTO exercises(id,lifecycle,current_published_version) VALUES($1,'PUBLISHED',1)", [row.id]);
      await client.query('INSERT INTO exercise_revisions(exercise_id,version,document) VALUES($1,1,$2)', [row.id, JSON.stringify(row)]);
      await client.query("INSERT INTO slug_history(slug,exercise_id,state) VALUES($1,$2,'CANONICAL')", [row.slug, row.id]);
      for (const [rank, ids] of [['PRIMARY', row.primaryMuscleIds], ['SECONDARY', row.secondaryMuscleIds]] as const) {
        for (const id of ids) await client.query(`INSERT INTO revision_muscle_groups(exercise_id,version,group_id,rank,support_version)
          SELECT $1,1,id,$3,current_published_version FROM muscle_groups WHERE id=$2`, [row.id, id, rank]);
      }
      for (const id of row.equipmentIds) await client.query(`INSERT INTO revision_equipment(exercise_id,version,equipment_id,support_version)
        SELECT $1,1,id,current_published_version FROM equipment WHERE id=$2`, [row.id, id]);
    }
    await client.query('INSERT INTO publication_revisions(revision) VALUES($1)', [snapshot.revision]);
    await client.query('INSERT INTO catalog_imports(source_revision,checksum,source_manifest) VALUES($1,$2,$3)',
      [snapshot.revision, checksum, JSON.stringify(snapshot.source)]);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = connectDatabase();
  const file = process.argv[2];
  (async () => {
    if (!file) throw new Error('Usage: import <snapshot.json>');
    await importSnapshot(database, JSON.parse(await readFile(file, 'utf8')), process.env.ALLOW_DEVELOPMENT_CONTENT === 'true');
  })().finally(() => database.close()).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
