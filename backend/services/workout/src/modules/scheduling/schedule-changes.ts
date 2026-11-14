import { HttpException } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import type { Database, SqlClient } from '../../database.js';
import { reject } from '../../contract.js';
import { fingerprint, getOwnedPlan } from '../plans/plans.js';
import { project, resolveLocal, type ScheduleInput } from './schedule-time.js';
import { Schedules, insertOccurrence, lockOwner, occurrenceEvent, scheduleInput, scheduleSelect,
  type OccurrenceRow, type ScheduleRow } from './schedules.js';

export type OccurrenceChange = { startAt: string; endAt: string; timeZone: string };
export function validateOccurrenceChange(input: OccurrenceChange, now: Date) {
  try {
    if (/^[+-]/.test(input.timeZone)) throw Error();
    new Intl.DateTimeFormat('en', { timeZone: input.timeZone });
    const start = Temporal.Instant.from(input.startAt), end = Temporal.Instant.from(input.endAt);
    const duration = end.epochMilliseconds - start.epochMilliseconds;
    if (start.epochMilliseconds <= now.getTime() || duration < 300000 || duration > 14400000) throw Error();
    if (start.toZonedDateTimeISO(input.timeZone).year < 1 || end.toZonedDateTimeISO(input.timeZone).year > 9999) throw Error();
  } catch { reject(422, 'INVALID_OCCURRENCE'); }
}

export async function ownedSchedule(db: SqlClient, owner: string, id: string) {
  const row = (await db.query<ScheduleRow>(scheduleSelect + ' WHERE s.owner_user_id=$1 AND s.id=$2 FOR UPDATE OF s', [owner, id])).rows[0];
  if (!row) reject(404, 'NOT_FOUND');
  return row;
}

// Reconcile by original local date so rule time changes retain occurrence ID/key.
// User overrides and any session which has already started remain immutable here.
export async function reconcile(db: SqlClient, row: ScheduleRow, now: Date, replace: boolean) {
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(row.time_zone).toPlainDate();
  const old = (await db.query<OccurrenceRow>(`SELECT o.*,o.local_date::text AS local_date FROM workout_occurrences o
    WHERE o.schedule_id=$1 AND (o.starts_at>$2 OR o.local_date BETWEEN $3::date AND $4::date)
    ORDER BY o.local_date,o.id FOR UPDATE`, [row.id, now, today.toString(), today.add({ days: 34 }).toString()])).rows;
  const candidates = project(scheduleInput(row), now);
  await db.query('DELETE FROM schedule_conflicts WHERE schedule_id=$1', [row.id]);
  const eligible = old.filter(item => !item.overridden && item.starts_at.getTime() > now.getTime());
  if (replace) await db.query(`UPDATE workout_occurrences SET status='CANCELED'
    WHERE schedule_id=$1 AND NOT overridden AND starts_at>$2 AND status='SCHEDULED'`, [row.id, now]);
  const used = new Set<string>();
  for (const candidate of candidates) {
    const prior = old.find(item => item.local_date === candidate.localDate);
    if (prior && (!replace || prior.overridden || prior.starts_at.getTime() <= now.getTime())) continue;
    try {
      // A failed statement must not abort the whole automatic projection batch.
      if (!replace) await db.query('SAVEPOINT projection_candidate');
      if (!prior) await insertOccurrence(db, row.owner_user_id, row.id, row.time_zone, row.plan_snapshot, candidate);
      else {
        await db.query(`UPDATE workout_occurrences SET starts_at=$2,ends_at=$3,time_zone=$4,status='SCHEDULED',plan_snapshot=$5 WHERE id=$1`,
          [prior.id, candidate.start, candidate.end, row.time_zone, JSON.stringify(row.plan_snapshot)]);
        const changed = prior.status !== 'SCHEDULED' || prior.starts_at.getTime() !== Date.parse(candidate.start) ||
          prior.ends_at.getTime() !== Date.parse(candidate.end) || prior.time_zone !== row.time_zone ||
          fingerprint(prior.plan_snapshot) !== fingerprint(row.plan_snapshot);
        if (changed) {
          await db.query('UPDATE workout_occurrences SET version=version+1,updated_at=now() WHERE id=$1', [prior.id]);
          await occurrenceEvent(db, prior.id);
        }
        used.add(prior.id);
      }
      if (!replace) await db.query('RELEASE SAVEPOINT projection_candidate');
    } catch (error) {
      if (replace) throw error;
      await db.query('ROLLBACK TO SAVEPOINT projection_candidate');
      await db.query('RELEASE SAVEPOINT projection_candidate');
      if (!(error instanceof HttpException && error.getStatus() === 409) && (error as { code?: string }).code !== '23P01') throw error;
      await db.query(`INSERT INTO schedule_conflicts(schedule_id,occurrence_key,local_date,starts_at,ends_at,code)
        VALUES($1,$2,$3,$4,$5,'SCHEDULE_OVERLAP')`, [row.id, candidate.key, candidate.localDate, candidate.start, candidate.end]);
    }
  }
  if (replace) for (const prior of eligible) if (!used.has(prior.id) && prior.status === 'SCHEDULED') {
    await db.query('UPDATE workout_occurrences SET version=version+1,updated_at=now() WHERE id=$1', [prior.id]);
    await occurrenceEvent(db, prior.id);
  }
}

export class ScheduleChanges {
  private readonly schedules: Schedules;
  constructor(private readonly db: Database, private readonly now = () => new Date()) { this.schedules = new Schedules(db, now); }

  async update(owner: string, id: string, expected: number, input: ScheduleInput) {
    try {
      return await this.db.transaction(async db => {
        await lockOwner(db, owner);
        const row = await ownedSchedule(db, owner, id);
        if (row.version !== expected) reject(412, 'VERSION_MISMATCH');
        if (row.status !== 'ACTIVE') reject(409, 'SCHEDULE_CANCELED');
        const now = this.now(), instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
        if (input.endDate && input.endDate < instant.toZonedDateTimeISO(input.timeZone).toPlainDate().toString() ||
          input.recurrence === 'ONCE' && Temporal.Instant.compare(resolveLocal(input.startDate, input.startLocalTime, input.timeZone), instant) <= 0) reject(422, 'SCHEDULE_IN_PAST');
        const plan = await getOwnedPlan(db, owner, input.planId, true);
        if (plan.status !== 'ACTIVE') reject(409, 'PLAN_ARCHIVED');
        const snapshot = row.plan_id === plan.id ? row.plan_snapshot : { planId: plan.id, exercises: plan.exercises };
        await db.query(`UPDATE workout_schedules SET plan_id=$2,mode=$3,time_zone=$4,start_date=$5,end_date=$6,local_start=$7,
          duration_minutes=$8,weekdays=$9,plan_snapshot=$10,version=version+1,updated_at=now() WHERE id=$1`,
        [id, input.planId, input.recurrence, input.timeZone, input.startDate, input.endDate ?? null, input.startLocalTime,
          input.durationMinutes, input.weekdays ?? null, JSON.stringify(snapshot)]);
        await reconcile(db, await ownedSchedule(db, owner, id), now, true);
        return this.schedules.get(owner, id, db);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23P01') reject(409, 'SCHEDULE_OVERLAP');
      throw error;
    }
  }

  cancel(owner: string, id: string, expected: number) {
    return this.db.transaction(async db => {
      await lockOwner(db, owner);
      const row = await ownedSchedule(db, owner, id);
      if (row.version !== expected) reject(412, 'VERSION_MISMATCH');
      if (row.status === 'CANCELED') return;
      await db.query("UPDATE workout_schedules SET status='CANCELED',version=version+1,updated_at=now() WHERE id=$1", [id]);
      const canceled = (await db.query<{ id: string }>(`UPDATE workout_occurrences SET status='CANCELED',version=version+1,updated_at=now()
        WHERE schedule_id=$1 AND status='SCHEDULED' AND starts_at>$2 RETURNING id`, [id, this.now()])).rows;
      for (const item of canceled) await occurrenceEvent(db, item.id);
      await db.query('DELETE FROM schedule_conflicts WHERE schedule_id=$1', [id]);
    });
  }

  async changeOccurrence(owner: string, id: string, expected: number, input?: OccurrenceChange) {
    try {
      return await this.db.transaction(async db => {
        await lockOwner(db, owner);
        const row = (await db.query<OccurrenceRow>('SELECT * FROM workout_occurrences WHERE owner_user_id=$1 AND id=$2 FOR UPDATE', [owner, id])).rows[0];
        if (!row) reject(404, 'NOT_FOUND');
        if (row.version !== expected) reject(412, 'VERSION_MISMATCH');
        if (!input && row.status === 'CANCELED') return;
        if (row.status === 'CANCELED') reject(409, 'OCCURRENCE_CANCELED');
        const now = this.now();
        if (row.starts_at.getTime() <= now.getTime()) reject(409, 'OCCURRENCE_STARTED');
        if (input) {
          validateOccurrenceChange(input, now);
          if (row.overridden && row.starts_at.getTime() === Date.parse(input.startAt) && row.ends_at.getTime() === Date.parse(input.endAt) && row.time_zone === input.timeZone)
            return this.schedules.occurrence(owner, id, db);
          await db.query(`UPDATE workout_occurrences SET starts_at=$2,ends_at=$3,time_zone=$4,overridden=true,
            version=version+1,updated_at=now() WHERE id=$1`, [id, input.startAt, input.endAt, input.timeZone]);
        } else await db.query("UPDATE workout_occurrences SET status='CANCELED',overridden=true,version=version+1,updated_at=now() WHERE id=$1", [id]);
        await occurrenceEvent(db, id);
        if (input) return this.schedules.occurrence(owner, id, db);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23P01') reject(409, 'SCHEDULE_OVERLAP');
      throw error;
    }
  }
}
