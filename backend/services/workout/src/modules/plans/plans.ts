import { createHash, randomUUID } from 'node:crypto';
import { reject, uuid } from '../../contract.js';
import type { Database, SqlClient } from '../../database.js';
import type { CatalogClient } from './catalog-client.js';

export type ItemInput = { exerciseId: string; sets: number; targetReps?: number; targetDurationSeconds?: number; restSeconds?: number };
export type PlanInput = { name: string; description?: string; exercises: ItemInput[] };
export type Item = ItemInput & { exerciseNameVi: string };
export type Plan = PlanInput & { id: string; status: 'ACTIVE' | 'ARCHIVED'; version: number; createdAt: string; updatedAt: string; exercises: Item[] };
type Row = Record<string, unknown> & { id: string; title: string; description: string | null; status: Plan['status']; version: number; created_at: Date; updated_at: Date; items: Item[] };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const select = `SELECT p.*,coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'exerciseId',i.exercise_id,'exerciseNameVi',i.title_snapshot,'sets',i.target_sets,'targetReps',i.target_reps,
  'targetDurationSeconds',i.target_duration_seconds,'restSeconds',i.rest_seconds)) ORDER BY i.sort_order)
  FROM workout_plan_items i WHERE i.plan_id=p.id),'[]'::jsonb) AS items FROM workout_plans p`;
const document = (row: Row): Plan => ({ id: row.id, name: row.title, ...(row.description === null ? {} : { description: row.description }),
  status: row.status, version: row.version, exercises: row.items, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });

export async function getOwnedPlan(db: SqlClient, owner: string, id: string, lock = false) {
  const row = (await db.query<Row>(select + ' WHERE p.owner_user_id=$1 AND p.id=$2' + (lock ? ' FOR UPDATE OF p' : ''), [owner, id])).rows[0];
  if (!row) reject(404, 'NOT_FOUND');
  return document(row);
}

async function saveItems(db: SqlClient, id: string, items: Item[]) {
  for (const [index, item] of items.entries()) await db.query(`INSERT INTO workout_plan_items
    (id,plan_id,sort_order,exercise_id,title_snapshot,target_sets,target_reps,target_duration_seconds,rest_seconds)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), id, index, item.exerciseId, item.exerciseNameVi, item.sets,
    item.targetReps ?? null, item.targetDurationSeconds ?? null, item.restSeconds ?? null]);
}

export class Plans {
  constructor(private readonly db: Database, private readonly catalog: CatalogClient) {}
  get(owner: string, id: string) { return getOwnedPlan(this.db, owner, id); }

  async list(owner: string, query: Record<string, unknown>) {
    if (Object.keys(query).some(key => !['status', 'limit', 'cursor'].includes(key)) ||
        Object.values(query).some(value => typeof value !== 'string')) reject(400, 'BAD_REQUEST');
    const status = query.status ?? 'ACTIVE';
    const limit = Number(query.limit ?? 20);
    if (!['ACTIVE', 'ARCHIVED'].includes(String(status)) || !/^[1-9][0-9]{0,2}$/.test(String(query.limit ?? '20')) || limit > 100) reject(400, 'BAD_REQUEST');
    let after: string | null = null;
    const scope = fingerprint([owner, status, limit]);
    if (query.cursor) {
      try {
        const value = String(query.cursor);
        if (!/^[A-Za-z0-9_-]{1,1024}$/.test(value)) throw Error();
        const cursor = JSON.parse(Buffer.from(value, 'base64url').toString());
        if (cursor.scope !== scope || typeof cursor.after !== 'string' || !uuid.test(cursor.after)) throw Error();
        after = cursor.after;
      } catch { reject(400, 'INVALID_CURSOR'); }
    }
    const rows = (await this.db.query<Row>(select + ' WHERE p.owner_user_id=$1 AND p.status=$2 AND ($3::uuid IS NULL OR p.id>$3) ORDER BY p.id LIMIT $4',
      [owner, status, after, limit + 1])).rows;
    const items = rows.slice(0, limit).map(document);
    return { items, nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ scope, after: items.at(-1)!.id })).toString('base64url') : null };
  }

  private async snapshots(input: PlanInput, old: Item[] = []) {
    const refs = await this.catalog(input.exercises.map(item => item.exerciseId));
    return input.exercises.map(item => {
      const current = refs.find(ref => ref.exerciseId === item.exerciseId);
      const exerciseNameVi = current?.available ? current.nameVi : old.find(previous => previous.exerciseId === item.exerciseId)?.exerciseNameVi;
      if (!exerciseNameVi) reject(422, 'EXERCISE_UNAVAILABLE');
      return { ...item, exerciseNameVi };
    });
  }

  private async replay(db: SqlClient, owner: string, key: string, fingerprint: string) {
    const row = (await db.query<{ fingerprint: string; response: Plan }>(
      "SELECT fingerprint,response FROM workout_idempotency WHERE owner_user_id=$1 AND key=$2 AND operation='plan:create' AND expires_at>now()", [owner, key])).rows[0];
    if (!row) return;
    if (row.fingerprint !== fingerprint) reject(409, 'IDEMPOTENCY_CONFLICT');
    if (!row.response) reject(409, 'REQUEST_IN_PROGRESS');
    return row.response;
  }

  async create(owner: string, key: string, input: PlanInput) {
    const digest = fingerprint(input);
    const prior = await this.replay(this.db, owner, key, digest);
    if (prior) return prior;
    const items = await this.snapshots(input);
    return this.db.transaction(async db => {
      await db.query("DELETE FROM workout_idempotency WHERE owner_user_id=$1 AND key=$2 AND operation='plan:create' AND expires_at<=now()", [owner, key]);
      const claim = await db.query(`INSERT INTO workout_idempotency(owner_user_id,key,fingerprint) VALUES($1,$2,$3)
        ON CONFLICT DO NOTHING RETURNING key`, [owner, key, digest]);
      if (!claim.rows.length) return (await this.replay(db, owner, key, digest))!;
      const id = randomUUID();
      await db.query('INSERT INTO workout_plans(id,owner_user_id,title,description) VALUES($1,$2,$3,$4)', [id, owner, input.name, input.description ?? null]);
      await saveItems(db, id, items);
      const result = await getOwnedPlan(db, owner, id);
      await db.query("UPDATE workout_idempotency SET response=$3 WHERE owner_user_id=$1 AND key=$2 AND operation='plan:create'", [owner, key, JSON.stringify(result)]);
      return result;
    });
  }

  async update(owner: string, id: string, expected: number, input: PlanInput) {
    const previous = await this.get(owner, id);
    if (previous.version !== expected) reject(412, 'VERSION_MISMATCH');
    if (previous.status === 'ARCHIVED') reject(409, 'PLAN_ARCHIVED');
    const items = await this.snapshots(input, previous.exercises);
    return this.db.transaction(async db => {
      const current = await getOwnedPlan(db, owner, id, true);
      if (current.version !== expected) reject(412, 'VERSION_MISMATCH');
      if (current.status === 'ARCHIVED') reject(409, 'PLAN_ARCHIVED');
      await db.query('UPDATE workout_plans SET title=$3,description=$4,version=version+1,updated_at=now() WHERE owner_user_id=$1 AND id=$2',
        [owner, id, input.name, input.description ?? null]);
      await db.query('DELETE FROM workout_plan_items WHERE plan_id=$1', [id]);
      await saveItems(db, id, items);
      return getOwnedPlan(db, owner, id);
    });
  }

  archive(owner: string, id: string, expected: number) {
    return this.db.transaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(73021,hashtext($1))', [owner]);
      const current = await getOwnedPlan(db, owner, id, true);
      if (current.version !== expected) reject(412, 'VERSION_MISMATCH');
      if ((await db.query("SELECT 1 FROM workout_schedules WHERE plan_id=$1 AND status='ACTIVE' LIMIT 1", [id])).rows.length) reject(409, 'ACTIVE_SCHEDULE_EXISTS');
      if (current.status !== 'ARCHIVED') await db.query("UPDATE workout_plans SET status='ARCHIVED',version=version+1,updated_at=now() WHERE id=$1", [id]);
    });
  }
}
