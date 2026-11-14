import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Schedules } from '../../backend/apps/workout/dist/modules/scheduling/schedules.service.js';
import { ScheduleChanges } from '../../backend/apps/workout/dist/modules/scheduling/schedule-changes.service.js';
import { ScheduleMaterializer } from '../../backend/apps/workout/dist/modules/scheduling/materializer.js';
import { startProcess } from '../helpers/processes.mjs';

export async function scheduleChangeCases({ t, db, checked, call, input, config, cleanup }) {
  const plans = '/api/v1/workout-plans', schedules = '/api/v1/workout-schedules', occurrences = '/api/v1/workout-occurrences';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const post = body => ({ method: 'POST', key: randomUUID(), body });
  async function fixture(overrides = {}, fixedNow) {
    const user = randomUUID();
    const plan = (await checked(plans, { ...post(input), user }, 201)).body;
    const now = fixedNow ?? (() => new Date());
    const api = new Schedules(db, now), changes = new ScheduleChanges(db, now);
    const body = { planId: plan.id, recurrence: 'ONCE', timeZone: 'UTC', startDate: tomorrow, startLocalTime: '09:00', durationMinutes: 60, ...overrides };
    const schedule = await api.create(user, randomUUID(), body);
    const rows = async () => (await db.query('SELECT o.*,o.local_date::text AS local_date FROM workout_occurrences o WHERE o.schedule_id=$1 ORDER BY o.local_date,o.id', [schedule.id])).rows;
    return { user, plan, body, schedule, api, changes, rows, now };
  }
  const code = expected => error => error?.getResponse?.().code === expected;

  await t.test('T15 HTTP validates ownership, preconditions and occurrence intervals', async () => {
    const f = await fixture(), row = (await f.rows())[0];
    const body = { startAt: tomorrow + 'T11:00:00Z', endAt: tomorrow + 'T12:00:00Z', timeZone: 'Asia/Bangkok' };
    const path = occurrences + '/' + row.id;
    await checked(path, { user: f.user, method: 'PATCH', body }, 428);
    await checked(path, { user: f.user, method: 'PATCH', body, match: 'W/"v1"' }, 400);
    await checked(path, { user: f.user, method: 'PATCH', body, match: '"v2"' }, 412);
    await checked(path, { user: randomUUID(), role: 'ADMIN', method: 'PATCH', body, match: '"v1"' }, 404);
    await checked(schedules + '/' + f.schedule.id, { user: randomUUID(), role: 'ADMIN', method: 'DELETE', match: '"v1"' }, 404);
    for (const invalid of [ { ...body, timeZone: '+07:00' }, { ...body, timeZone: 'Invalid/Zone' },
      { ...body, endAt: body.startAt }, { ...body, endAt: tomorrow + 'T11:04:00Z' },
      { ...body, endAt: tomorrow + 'T15:01:00Z' }, { ...body, startAt: '2000-01-01T00:00:00Z' }, { ...body, status: 'CANCELED' } ])
      await checked(path, { user: f.user, method: 'PATCH', body: invalid, match: '"v1"' }, 422);
    const moved = await checked(path, { user: f.user, method: 'PATCH', body, match: '"v1"' }, 200, 'WorkoutOccurrence');
    assert.equal(moved.headers.etag, '"v2"');
    assert.equal(moved.body.startAt, tomorrow + 'T11:00:00.000Z');
    const after = (await f.rows())[0]; assert.equal(after.occurrence_key, row.occurrence_key); assert.equal(after.id, row.id);
    const repeated = await checked(path, { user: f.user, method: 'PATCH', body, match: '"v2"' });
    assert.equal(repeated.body.version, 2);
    await checked(path + '/cancel', { user: f.user, method: 'POST', match: '"v1"' }, 412);
    await checked(path + '/cancel', { user: f.user, method: 'POST', match: '"v2"' }, 204);
    await checked(path + '/cancel', { user: f.user, method: 'POST', match: '"v3"' }, 204);
    await checked(path, { user: f.user, method: 'PATCH', body, match: '"v3"' }, 409);
    assert.equal((await f.rows())[0].version, 3);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1', [row.id])).rows[0].n, 3);
  });

  await t.test('T15 racing moves cannot overlap; same ETag admits one change', async () => {
    const f = await fixture({ recurrence: 'WEEKLY', weekdays: [1, 2, 3, 4, 5, 6, 7] });
    const [a, b] = await f.rows();
    const destination = { startAt: tomorrow + 'T14:00:00Z', endAt: tomorrow + 'T15:00:00Z', timeZone: 'UTC' };
    const moves = await Promise.all([a, b].map(row => call(occurrences + '/' + row.id, { user: f.user, method: 'PATCH', body: destination, match: '"v1"' })));
    assert.deepEqual(moves.map(x => x.status).sort(), [200, 409]);
    const winner = moves.find(x => x.status === 200).body;
    const writes = await Promise.all([16, 17].map(hour => call(occurrences + '/' + winner.id, { user: f.user, method: 'PATCH', match: '"v2"',
      body: { ...destination, startAt: tomorrow + 'T' + hour + ':00:00Z', endAt: tomorrow + 'T' + (hour + 1) + ':00:00Z' } })));
    assert.deepEqual(writes.map(x => x.status).sort(), [200, 412]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1', [winner.id])).rows[0].n, 3);
  });

  await t.test('T15 rule edits preserve IDs, original keys, snapshots and individual exceptions', async () => {
    let time = new Date('2030-01-01T00:00:00Z');
    const f = await fixture({ startDate: '2030-01-01', recurrence: 'WEEKLY', weekdays: [1, 2, 3, 4, 5, 6, 7] }, () => time);
    const original = await f.rows(), [past, manual, canceled, regular] = original;
    await f.changes.changeOccurrence(f.user, manual.id, 1, { startAt: '2030-01-02T11:00:00Z', endAt: '2030-01-02T12:00:00Z', timeZone: 'UTC' });
    await f.changes.changeOccurrence(f.user, canceled.id, 1);
    time = new Date('2030-01-01T10:00:00Z');
    await checked(plans + '/' + f.plan.id, { user: f.user, method: 'PUT', body: { ...input, name: 'Đã sửa plan', exercises: [{ ...input.exercises[0], targetReps: 99 }] }, match: '"v1"' });
    const rule = { ...f.body, startLocalTime: '10:00' };
    const updated = await f.changes.update(f.user, f.schedule.id, 1, rule);
    assert.equal(updated.version, 2);
    const rows = await f.rows(), byId = id => rows.find(x => x.id === id);
    assert.deepEqual(byId(past.id), past);
    assert.equal(byId(manual.id).starts_at.toISOString(), '2030-01-02T11:00:00.000Z');
    assert.equal(byId(canceled.id).status, 'CANCELED'); assert.equal(byId(canceled.id).version, 2);
    assert.equal(byId(regular.id).occurrence_key, regular.occurrence_key);
    assert.equal(byId(regular.id).starts_at.toISOString(), '2030-01-04T10:00:00.000Z');
    assert.equal(byId(regular.id).version, 2);
    assert.equal(byId(regular.id).plan_snapshot.exercises[0].targetReps, 12);
    await assert.rejects(f.changes.update(f.user, f.schedule.id, 1, rule), code('VERSION_MISMATCH'));
    await assert.rejects(f.changes.changeOccurrence(f.user, past.id, 1), code('OCCURRENCE_STARTED'));
    await f.changes.cancel(f.user, f.schedule.id, 2);
    const final = await f.rows();
    assert.deepEqual(final.find(x => x.id === past.id), past);
    assert.ok(final.filter(x => x.id !== past.id).every(x => x.status === 'CANCELED'));
    assert.equal(final.find(x => x.id === manual.id).version, 3);
    await f.changes.cancel(f.user, f.schedule.id, 3);
    await assert.rejects(f.changes.update(f.user, f.schedule.id, 3, rule), code('SCHEDULE_CANCELED'));
    assert.equal((await f.api.get(f.user, f.schedule.id)).version, 3);
    await checked(plans + '/' + f.plan.id, { user: f.user, method: 'DELETE', match: '"v2"' }, 204);
  });

  await t.test('T15 rule overlap and outbox failure roll back every changed occurrence', async () => {
    const f = await fixture();
    await f.api.create(f.user, randomUUID(), { ...f.body, startLocalTime: '11:00' });
    const before = await f.rows();
    await checked(schedules + '/' + f.schedule.id, { user: f.user, method: 'PUT', body: f.body }, 428);
    await checked(schedules + '/' + f.schedule.id, { user: f.user, method: 'PUT', body: { ...f.body, startLocalTime: '11:30' }, match: '"v1"' }, 409);
    assert.deepEqual(await f.rows(), before);
    assert.equal((await f.api.get(f.user, f.schedule.id)).version, 1);
    await db.query(`CREATE FUNCTION fail_change_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.aggregate_id='${before[0].id}' AND NEW.aggregate_version>1 THEN RAISE EXCEPTION 'T15 fixture'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_change BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_change_event()`);
    try {
      await checked(occurrences + '/' + before[0].id + '/cancel', { user: f.user, method: 'POST', match: '"v1"' }, 503);
      await checked(schedules + '/' + f.schedule.id, { user: f.user, method: 'DELETE', match: '"v1"' }, 503);
      assert.deepEqual(await f.rows(), before);
      assert.equal((await f.api.get(f.user, f.schedule.id)).status, 'ACTIVE');
    } finally { await db.query('DROP TRIGGER fail_change ON outbox_events; DROP FUNCTION fail_change_event()'); }
    const [a, b] = await Promise.all([10, 14].map(hour => call(schedules + '/' + f.schedule.id, { user: f.user, method: 'PUT',
      body: { ...f.body, startLocalTime: hour + ':00' }, match: '"v1"' })));
    assert.deepEqual([a.status, b.status].sort(), [200, 412]);
  });

  await t.test('T15 removing and restoring rule dates keeps identity and changing plan pins a new snapshot', async () => {
    const time = new Date('2030-06-01T00:00:00Z');
    const f = await fixture({ startDate: '2030-06-01', recurrence: 'WEEKLY', weekdays: [1, 2, 3, 4, 5, 6, 7] }, () => time);
    const old = await f.rows();
    const shortened = { ...f.body, endDate: '2030-06-02' };
    await f.changes.update(f.user, f.schedule.id, 1, shortened);
    assert.equal((await f.rows()).filter(x => x.status === 'SCHEDULED').length, 2);
    const newPlan = (await checked(plans, { ...post({ ...input, exercises: [{ ...input.exercises[0], targetReps: 30 }] }), user: f.user }, 201)).body;
    await f.changes.update(f.user, f.schedule.id, 2, { ...f.body, planId: newPlan.id });
    const restored = await f.rows();
    assert.equal(restored.length, old.length);
    assert.ok(restored.every((x, i) => x.id === old[i].id && x.occurrence_key === old[i].occurrence_key && x.status === 'SCHEDULED'));
    assert.ok(restored.every(x => x.plan_snapshot.planId === newPlan.id && x.plan_snapshot.exercises[0].targetReps === 30));
    assert.equal(restored[2].version, 3);
  });

  await t.test('T15 materializer and cancellation race leaves no active future session', async () => {
    let time = new Date('2030-08-01T00:00:00Z');
    const f = await fixture({ startDate: '2030-09-05' }, () => time);
    time = new Date('2030-08-02T00:00:00Z');
    await db.query('UPDATE workout_schedules SET next_projection_at=$1 WHERE id<>$2', ['2030-10-01T00:00:00Z', f.schedule.id]);
    const worker = new ScheduleMaterializer(db, () => time);
    await Promise.all([worker.tick(), f.changes.cancel(f.user, f.schedule.id, 1)]);
    assert.equal((await f.api.get(f.user, f.schedule.id)).status, 'CANCELED');
    assert.ok((await f.rows()).every(x => x.status === 'CANCELED'));
    await worker.tick();
    assert.ok((await f.rows()).every(x => x.status === 'CANCELED'));
  });

  await t.test('T15 materializer extends 35 local days, retries conflicts and survives two replicas', async () => {
    let time = new Date('2031-01-01T00:00:00Z');
    const f = await fixture({ startDate: '2031-01-01', recurrence: 'WEEKLY', weekdays: [1, 2, 3, 4, 5, 6, 7] }, () => time);
    // Reserve the next date outside the initial horizon, then enter that horizon.
    const blocker = await f.api.create(f.user, randomUUID(), { ...f.body, recurrence: 'ONCE', weekdays: undefined, startDate: '2031-02-05' });
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_occurrences WHERE schedule_id=$1', [blocker.id])).rows[0].n, 0);
    time = new Date('2031-01-02T00:00:00Z');
    const worker = new ScheduleMaterializer(db, () => time);
    // Deterministically project the pre-existing reservation before the recurrence.
    await db.query("UPDATE workout_schedules SET next_projection_at=$2 WHERE id<>$1", [blocker.id, '2031-02-01T00:00:00Z']);
    assert.equal((await worker.tick()).processed, 1);
    await db.query('UPDATE workout_schedules SET next_projection_at=$2 WHERE id=$1', [f.schedule.id, time]);
    const results = await Promise.all([worker.tick(), worker.tick()]);
    assert.equal(results.reduce((n, x) => n + x.processed, 0), 1);
    let rule = await f.api.get(f.user, f.schedule.id);
    assert.equal(rule.projectionConflicts.length, 1); assert.equal(rule.version, 2);
    assert.equal(rule.projectionConflicts[0].localDate, '2031-02-05');
    assert.equal((await f.rows()).length, 35);
    const blockedOccurrence = (await db.query('SELECT * FROM workout_occurrences WHERE schedule_id=$1', [blocker.id])).rows[0];
    await f.changes.changeOccurrence(f.user, blockedOccurrence.id, 1);
    time = new Date('2031-01-02T00:02:00Z');
    const retry = await worker.tick(); assert.equal(retry.failed, 0);
    rule = await f.api.get(f.user, f.schedule.id);
    assert.equal(rule.projectionConflicts.length, 0); assert.equal(rule.version, 3);
    assert.equal((await f.rows()).length, 36);
    time = new Date('2031-01-06T00:00:00Z');
    await worker.tick();
    const recovered = await f.rows(); assert.equal(recovered.length, 40);
    assert.equal(recovered.at(-1).local_date, '2031-02-09');
    const eventCount = (await db.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n;
    await worker.tick();
    assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n, eventCount);
    assert.equal((await db.query('SELECT status FROM workout_occurrences WHERE id=$1', [blockedOccurrence.id])).rows[0].status, 'CANCELED');
  });

  await t.test('T15 projection failure is durable, does not advance success and recovers atomically', async () => {
    let time = new Date('2032-01-01T00:00:00Z');
    const f = await fixture({ startDate: '2032-02-05' }, () => time);
    await db.query('UPDATE workout_schedules SET next_projection_at=$1 WHERE id<>$2', ['2032-03-01T00:00:00Z', f.schedule.id]);
    time = new Date('2032-01-02T00:00:00Z');
    await db.query(`CREATE FUNCTION fail_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.payload->'data'->>'userId'='${f.user}' THEN RAISE EXCEPTION 'projection fixture'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_projection_event BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_projection()`);
    const worker = new ScheduleMaterializer(db, () => time);
    try {
      assert.deepEqual(await worker.tick(), { processed: 0, failed: 1 });
      assert.equal((await f.rows()).length, 0);
      const row = (await db.query('SELECT * FROM workout_schedules WHERE id=$1', [f.schedule.id])).rows[0];
      assert.equal(row.last_projected_at, null); assert.equal(row.projection_error, 'PROJECTION_FAILED');
      assert.deepEqual(await worker.tick(), { processed: 0, failed: 0 });
    } finally { await db.query('DROP TRIGGER fail_projection_event ON outbox_events; DROP FUNCTION fail_projection()'); }
    time = new Date('2032-01-02T00:02:00Z');
    assert.deepEqual(await worker.tick(), { processed: 1, failed: 0 });
    assert.equal((await f.rows()).length, 1);
    assert.equal((await db.query('SELECT projection_error FROM workout_schedules WHERE id=$1', [f.schedule.id])).rows[0].projection_error, null);
  });

  await t.test('T15 materializer starts independently and resumes a rule without occurrences', async () => {
    const f = await fixture();
    // Fixture represents an existing rule restored without its initial projection.
    await db.transaction(async tx => {
      await tx.query('DELETE FROM outbox_events WHERE aggregate_id IN (SELECT id FROM workout_occurrences WHERE schedule_id=$1)', [f.schedule.id]);
      await tx.query('DELETE FROM workout_occurrences WHERE schedule_id=$1', [f.schedule.id]);
    });
    await db.query("UPDATE workout_schedules SET next_projection_at=now()+interval '1 day' WHERE id<>$1", [f.schedule.id]);
    const worker = startProcess(['dist/materializer-main.js'], 'backend/apps/workout', { DATABASE_URL: config.DATABASE_URL });
    cleanup.push(() => worker.stop());
    try {
      let rows;
      for (let i = 0; i < 100; i++) { rows = await f.rows(); if (rows.length) break; await delay(100); }
      assert.equal(rows.length, 1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1', [rows[0].id])).rows[0].n, 1);
    } finally { await worker.stop(); }
  });
}
