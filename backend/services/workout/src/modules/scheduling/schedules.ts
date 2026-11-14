import { HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { reject, uuid, validEvent } from '../../contract.js';
import type { Database, SqlClient } from '../../database.js';
import { fingerprint, getOwnedPlan, type Item } from '../plans/plans.js';
import { project, resolveLocal, type Candidate, type ScheduleInput } from './schedule-time.js';

export type Snapshot = { planId: string; exercises: Item[] };
export type ScheduleRow = Record<string, unknown> & { id: string; owner_user_id: string; plan_id: string; mode: 'ONCE' | 'WEEKLY';
  time_zone: string; starts_on: string; ends_on: string | null; local_time: string; duration_minutes: number; weekdays: number[] | null;
  status: 'ACTIVE' | 'CANCELED'; version: number; plan_snapshot: Snapshot; conflicts: unknown[] };
export type OccurrenceRow = Record<string, unknown> & { id: string; owner_user_id: string; schedule_id: string; starts_at: Date; ends_at: Date;
  time_zone: string; status: 'SCHEDULED' | 'CANCELED'; version: number; plan_snapshot: Snapshot; local_date: string; occurrence_key: string; overridden: boolean };
export const scheduleSelect = `SELECT s.*,s.start_date::text AS starts_on,s.end_date::text AS ends_on,to_char(s.local_start,'HH24:MI') AS local_time,
  coalesce((SELECT jsonb_agg(jsonb_build_object('status','CONFLICT','localDate',c.local_date::text,
    'startAt',c.starts_at,'endAt',c.ends_at,'code',c.code) ORDER BY c.local_date) FROM schedule_conflicts c WHERE c.schedule_id=s.id),'[]'::jsonb) AS conflicts
  FROM workout_schedules s`;
export const scheduleInput = (row: ScheduleRow): ScheduleInput => ({ planId: row.plan_id, timeZone: row.time_zone, startDate: row.starts_on,
  ...(row.ends_on ? { endDate: row.ends_on } : {}), startLocalTime: row.local_time, durationMinutes: row.duration_minutes,
  recurrence: row.mode, ...(row.weekdays ? { weekdays: row.weekdays } : {}) });
const document = (row: ScheduleRow) => ({ id: row.id, ...scheduleInput(row), status: row.status, version: row.version, projectionConflicts: row.conflicts });
export const occurrenceDocument = (row: OccurrenceRow) => ({ id: row.id, scheduleId: row.schedule_id, planId: row.plan_snapshot.planId,
  plannedExercises: row.plan_snapshot.exercises, startAt: row.starts_at.toISOString(), endAt: row.ends_at.toISOString(),
  timeZone: row.time_zone, status: row.status, version: row.version });

export async function lockOwner(db: SqlClient, owner: string) { await db.query('SELECT pg_advisory_xact_lock(73021,hashtext($1))', [owner]); }

export async function insertOccurrence(db: SqlClient, owner: string, scheduleId: string, timeZone: string, snapshot: Snapshot, candidate: Candidate) {
  const exists = (await db.query('SELECT 1 FROM workout_occurrences WHERE schedule_id=$1 AND occurrence_key=$2', [scheduleId, candidate.key])).rows.length;
  if (exists) return;
  const overlap = (await db.query<{ id: string; starts_at: Date; ends_at: Date }>(`SELECT id,starts_at,ends_at FROM workout_occurrences
    WHERE owner_user_id=$1 AND status='SCHEDULED' AND tstzrange(starts_at,ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')
    ORDER BY starts_at,id LIMIT 1`, [owner, candidate.start, candidate.end])).rows[0];
  if (overlap) throw new HttpException({ code: 'SCHEDULE_OVERLAP',
    detail: `Buổi ${overlap.id} từ ${overlap.starts_at.toISOString()} đến ${overlap.ends_at.toISOString()} đang chiếm khoảng giờ này.` }, 409);
  const id = randomUUID();
  await db.query(`INSERT INTO workout_occurrences(id,owner_user_id,schedule_id,occurrence_key,local_date,starts_at,ends_at,time_zone,status,plan_snapshot)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SCHEDULED',$9)`, [id, owner, scheduleId, candidate.key, candidate.localDate,
    candidate.start, candidate.end, timeZone, JSON.stringify(snapshot)]);
  await occurrenceEvent(db, id);
}

export async function occurrenceEvent(db: SqlClient, id: string) {
  const row = (await db.query<OccurrenceRow>('SELECT * FROM workout_occurrences WHERE id=$1', [id])).rows[0];
  const event = { id: randomUUID(), type: 'workout.occurrence.changed.v1', producer: 'workout', schemaVersion: 1,
    occurredAt: new Date().toISOString(), aggregateId: row.id, aggregateVersion: row.version, correlationId: randomUUID(),
    data: { occurrenceId: row.id, userId: row.owner_user_id, status: row.status, startAt: row.starts_at.toISOString(),
      endAt: row.ends_at.toISOString(), timeZone: row.time_zone } };
  if (!validEvent(event)) throw new Error('Invalid Workout event');
  await db.query(`INSERT INTO outbox_events(event_id,type,schema_version,aggregate_id,aggregate_version,occurred_at,correlation_id,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [event.id, event.type, event.schemaVersion, event.aggregateId, event.aggregateVersion,
    event.occurredAt, event.correlationId, JSON.stringify(event)]);
}

function pagination(query: Record<string, unknown>, fields: string[]) {
  if (Object.keys(query).some(key => !fields.includes(key)) || Object.values(query).some(value => typeof value !== 'string')) reject(400, 'BAD_REQUEST');
  if (!/^[1-9][0-9]{0,2}$/.test(String(query.limit ?? '20')) || Number(query.limit ?? 20) > 100) reject(400, 'BAD_REQUEST');
  return Number(query.limit ?? 20);
}
function cursorOf(raw: unknown, scope: string): { id: string; start?: string } | undefined {
  if (raw === undefined) return;
  try {
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(raw)) throw Error();
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (value.scope !== scope || typeof value.id !== 'string' || !uuid.test(value.id)) throw Error();
    return value;
  } catch { reject(400, 'INVALID_CURSOR'); }
}
const encodeCursor = (scope: string, id: string, start?: string) => Buffer.from(JSON.stringify({ scope, id, start })).toString('base64url');
const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
function instant(value: unknown) {
  if (typeof value !== 'string' || !dateTime.test(value)) reject(400, 'BAD_REQUEST');
  try { return Temporal.Instant.from(value); } catch { reject(400, 'BAD_REQUEST'); }
}

export class Schedules {
  constructor(private readonly db: Database, private readonly now = () => new Date()) {}

  async get(owner: string, id: string, db: SqlClient = this.db) {
    const row = (await db.query<ScheduleRow>(scheduleSelect + ' WHERE s.owner_user_id=$1 AND s.id=$2', [owner, id])).rows[0];
    if (!row) reject(404, 'NOT_FOUND');
    return document(row);
  }

  async list(owner: string, query: Record<string, unknown>) {
    const limit = pagination(query, ['status', 'limit', 'cursor']);
    const status = query.status ?? 'ACTIVE';
    if (!['ACTIVE', 'CANCELED'].includes(String(status))) reject(400, 'BAD_REQUEST');
    const scope = fingerprint([owner, status, limit]);
    const cursor = cursorOf(query.cursor, scope);
    const rows = (await this.db.query<ScheduleRow>(scheduleSelect + ' WHERE s.owner_user_id=$1 AND s.status=$2 AND ($3::uuid IS NULL OR s.id>$3) ORDER BY s.id LIMIT $4',
      [owner, status, cursor?.id ?? null, limit + 1])).rows;
    return { items: rows.slice(0, limit).map(document), nextCursor: rows.length > limit ? encodeCursor(scope, rows[limit - 1].id) : null };
  }

  private async replay(db: SqlClient, owner: string, key: string, digest: string) {
    const row = (await db.query<{ fingerprint: string; response: ReturnType<typeof document> }>(`SELECT fingerprint,response FROM workout_idempotency
      WHERE owner_user_id=$1 AND operation='schedule:create' AND key=$2 AND expires_at>now()`, [owner, key])).rows[0];
    if (!row) return;
    if (row.fingerprint !== digest) reject(409, 'IDEMPOTENCY_CONFLICT');
    return row.response;
  }

  async create(owner: string, key: string, input: ScheduleInput) {
    const digest = fingerprint(input);
    const prior = await this.replay(this.db, owner, key, digest);
    if (prior) return prior;
    try {
      return await this.db.transaction(async db => {
        await lockOwner(db, owner);
        const prior = await this.replay(db, owner, key, digest);
        if (prior) return prior;
        const now = this.now();
        if (input.endDate && input.endDate < Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(input.timeZone).toPlainDate().toString()) reject(422, 'SCHEDULE_IN_PAST');
        if (input.recurrence === 'ONCE' && Temporal.Instant.compare(resolveLocal(input.startDate, input.startLocalTime, input.timeZone),
          Temporal.Instant.fromEpochMilliseconds(now.getTime())) <= 0) reject(422, 'SCHEDULE_IN_PAST');
        const plan = await getOwnedPlan(db, owner, input.planId, true);
        if (plan.status !== 'ACTIVE') reject(409, 'PLAN_ARCHIVED');
        const id = randomUUID(), snapshot = { planId: plan.id, exercises: plan.exercises };
        await db.query(`INSERT INTO workout_schedules(id,owner_user_id,plan_id,mode,time_zone,start_date,end_date,local_start,duration_minutes,weekdays,plan_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, owner, plan.id, input.recurrence, input.timeZone, input.startDate,
          input.endDate ?? null, input.startLocalTime, input.durationMinutes, input.weekdays ?? null, JSON.stringify(snapshot)]);
        for (const candidate of project(input, now)) await insertOccurrence(db, owner, id, input.timeZone, snapshot, candidate);
        const result = await this.get(owner, id, db);
        await db.query("DELETE FROM workout_idempotency WHERE owner_user_id=$1 AND operation='schedule:create' AND key=$2 AND expires_at<=now()", [owner, key]);
        await db.query(`INSERT INTO workout_idempotency(owner_user_id,operation,key,fingerprint,response) VALUES($1,'schedule:create',$2,$3,$4)`,
          [owner, key, digest, JSON.stringify(result)]);
        return result;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23P01') reject(409, 'SCHEDULE_OVERLAP');
      throw error;
    }
  }

  async occurrence(owner: string, id: string, db: SqlClient = this.db) {
    const row = (await db.query<OccurrenceRow>('SELECT * FROM workout_occurrences WHERE owner_user_id=$1 AND id=$2', [owner, id])).rows[0];
    if (!row) reject(404, 'NOT_FOUND');
    return occurrenceDocument(row);
  }

  async occurrences(owner: string, query: Record<string, unknown>) {
    const limit = pagination(query, ['from', 'to', 'limit', 'cursor']);
    const from = instant(query.from), to = instant(query.to);
    const duration = to.epochMilliseconds - from.epochMilliseconds;
    if (duration <= 0 || duration > 35 * 86400000) reject(400, 'BAD_REQUEST');
    const scope = fingerprint([owner, from.toString(), to.toString(), limit]);
    const cursor = cursorOf(query.cursor, scope);
    if (cursor && (typeof cursor.start !== 'string' || !dateTime.test(cursor.start) || !Number.isFinite(Date.parse(cursor.start)))) reject(400, 'INVALID_CURSOR');
    const rows = (await this.db.query<OccurrenceRow>(`SELECT * FROM workout_occurrences WHERE owner_user_id=$1 AND starts_at>=$2 AND starts_at<$3
      AND ($4::timestamptz IS NULL OR (starts_at,id)>($4::timestamptz,$5::uuid)) ORDER BY starts_at,id LIMIT $6`,
      [owner, from.toString(), to.toString(), cursor?.start ?? null, cursor?.id ?? null, limit + 1])).rows;
    return { items: rows.slice(0, limit).map(occurrenceDocument), nextCursor: rows.length > limit ? encodeCursor(scope, rows[limit - 1].id, rows[limit - 1].starts_at.toISOString()) : null };
  }
}
