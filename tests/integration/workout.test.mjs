import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:https';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { startPostgres, freePort } from '../helpers/postgres.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { createTestTls } from '../../backend/services/identity/test/tls.cjs';
import { createApp as createIdentity } from '../../backend/services/identity/dist/app.js';
import { IdentityKeys } from '../../backend/services/identity/dist/modules/accounts/crypto.js';
import { connectDatabase } from '../../backend/services/catalog/dist/database.js';
import { migrate as migrateCatalog } from '../../backend/services/catalog/dist/migrate.js';
import { importSnapshot } from '../../backend/services/catalog/dist/import.js';
import { migrate } from '../../backend/services/workout/dist/migrate.js';
import { fingerprint } from '../../backend/services/workout/dist/modules/plans/plans.js';
import { Schedules } from '../../backend/services/workout/dist/modules/scheduling/schedules.js';
import { OutboxRelay } from '../../backend/services/workout/dist/outbox.js';
import { ConfirmPublisher } from '../../backend/services/workout/dist/broker.js';
import { startRabbit } from '../helpers/rabbitmq.mjs';
import { createRequire } from 'node:module';
import { scheduleChangeCases } from './workout-schedule-cases.mjs';

const { connect } = createRequire(new URL('../../backend/services/workout/package.json', import.meta.url))('amqplib');

test('Workout plans over independent PostgreSQL, mTLS and published Catalog refs', { timeout: 180000 }, async t => {
  const cleanup = [];
  t.after(async () => {
    const errors = [];
    for (const close of cleanup.reverse()) try { await close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Workout fixture cleanup failed');
  });
  const pg = await startPostgres(); cleanup.push(pg.stop); t.diagnostic(pg.version);
  const catalogDb = connectDatabase(pg.connectionString); cleanup.push(() => catalogDb.close());
  await migrateCatalog(catalogDb);
  await importSnapshot(catalogDb, JSON.parse(await readFile('backend/services/catalog/data/smartgym-m2.json', 'utf8')), true);
  const password = randomBytes(24).toString('hex');
  await catalogDb.query("CREATE ROLE workout_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + password + "'");
  await catalogDb.query('CREATE DATABASE workout_private OWNER workout_runtime');
  await catalogDb.query('REVOKE CONNECT ON DATABASE postgres FROM PUBLIC');
  await catalogDb.query('REVOKE CONNECT ON DATABASE workout_private FROM PUBLIC');
  const url = new URL(pg.connectionString); url.username = 'workout_runtime'; url.password = password; url.pathname = '/workout_private';
  const db = connectDatabase(url.href); cleanup.push(() => db.close());
  const legacyOwner = randomUUID(), legacyId = randomUUID(), legacyKey = randomUUID();
  const legacyBody = { name: 'Kế hoạch trước migration lịch', exercises: [{ exerciseId: 'bodyweight_squat', sets: 1, targetReps: 10 }] };
  const legacyReceipt = { ...legacyBody, id: legacyId, status: 'ACTIVE', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    exercises: [{ ...legacyBody.exercises[0], exerciseNameVi: 'Squat không tạ' }] };
  const oldMigration = await readFile('backend/services/workout/migrations/001_workout_plans.sql', 'utf8');
  await db.query(oldMigration);
  await db.query('INSERT INTO workout_migrations VALUES(1,$1)', [createHash('sha256').update(oldMigration).digest('hex')]);
  await db.query('INSERT INTO workout_plans(id,owner_user_id,title) VALUES($1,$2,$3)', [legacyId, legacyOwner, legacyBody.name]);
  await db.query('INSERT INTO workout_plan_items(id,plan_id,sort_order,exercise_id,title_snapshot,target_sets,target_reps) VALUES($1,$2,0,$3,$4,1,10)',
    [randomUUID(), legacyId, 'bodyweight_squat', 'Squat không tạ']);
  await db.query('INSERT INTO workout_idempotency(owner_user_id,key,fingerprint,response) VALUES($1,$2,$3,$4)',
    [legacyOwner, legacyKey, fingerprint(legacyBody), JSON.stringify(legacyReceipt)]);
  await migrate(db); await migrate(db);
  const tls = await createTestTls(); cleanup.push(tls.stop);
  const issuer = 'https://identity.test';
  const keys = new IdentityKeys(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
    'workout-test', issuer, randomBytes(32), randomBytes(32));
  const noIdentityQueries = { query: async () => { throw Error('JWKS must not read business data'); }, transaction: async () => { throw Error(); }, close: async () => {} };
  const { app: identity } = await createIdentity(noIdentityQueries, { keys, callers: tls.callers, webOrigin: 'https://gym.test', tls: { ...tls.clients.server, ca: tls.ca } });
  await identity.listen(0, '127.0.0.1'); cleanup.push(() => identity.close());
  const identityOrigin = 'https://127.0.0.1:' + identity.getHttpServer().address().port;
  const catalogPort = await freePort(), refsPort = await freePort();
  const catalog = startProcess(['dist/main.js'], 'backend/services/catalog', {
    DATABASE_URL: pg.connectionString, PORT: String(catalogPort), HOST: '127.0.0.1', CATALOG_ADMIN_ENABLED: 'true',
    CATALOG_ADMIN_PORT: String(refsPort), CATALOG_ADMIN_HOST: '127.0.0.1', CATALOG_MEDIA_ENABLED: 'false',
    CATALOG_ADMIN_BFF_FINGERPRINTS: JSON.stringify(tls.callers.bff),
    // Fixture alias only. The notification certificate acts as Workout for Catalog refs.
    CATALOG_REF_FINGERPRINTS: JSON.stringify(tls.callers.notification),
    CATALOG_ADMIN_TLS_KEY_FILE: join(tls.directory, 'server.key'), CATALOG_ADMIN_TLS_CERT_FILE: join(tls.directory, 'server.crt'), CATALOG_ADMIN_TLS_CA_FILE: join(tls.directory, 'ca.crt'),
    CATALOG_IDENTITY_ORIGIN: identityOrigin, CATALOG_IDENTITY_ISSUER: issuer,
    CATALOG_IDENTITY_TLS_KEY_FILE: join(tls.directory, 'catalog.key'), CATALOG_IDENTITY_TLS_CERT_FILE: join(tls.directory, 'catalog.crt'), CATALOG_IDENTITY_TLS_CA_FILE: join(tls.directory, 'ca.crt'),
  });
  cleanup.push(() => catalog.stop()); await catalog.waitFor('http://127.0.0.1:' + catalogPort + '/health/ready');
  const port = await freePort();
  const config = { DATABASE_URL: url.href, WORKOUT_PORT: String(port), WORKOUT_HOST: '127.0.0.1', WORKOUT_BFF_FINGERPRINTS: JSON.stringify(tls.callers.bff),
    WORKOUT_TLS_KEY_FILE: join(tls.directory, 'server.key'), WORKOUT_TLS_CERT_FILE: join(tls.directory, 'server.crt'), WORKOUT_TLS_CA_FILE: join(tls.directory, 'ca.crt'),
    WORKOUT_IDENTITY_ORIGIN: identityOrigin, WORKOUT_IDENTITY_ISSUER: issuer,
    WORKOUT_IDENTITY_TLS_KEY_FILE: join(tls.directory, 'catalog.key'), WORKOUT_IDENTITY_TLS_CERT_FILE: join(tls.directory, 'catalog.crt'), WORKOUT_IDENTITY_TLS_CA_FILE: join(tls.directory, 'ca.crt'),
    WORKOUT_CATALOG_ORIGIN: 'https://127.0.0.1:' + refsPort,
    WORKOUT_CATALOG_TLS_KEY_FILE: join(tls.directory, 'notification.key'), WORKOUT_CATALOG_TLS_CERT_FILE: join(tls.directory, 'notification.crt'), WORKOUT_CATALOG_TLS_CA_FILE: join(tls.directory, 'ca.crt') };
  let api = startProcess(['dist/main.js'], 'backend/services/workout', config); cleanup.push(() => api.stop());
  const owner = randomUUID(), other = randomUUID();
  const token = (user = owner, role = 'USER', expired = false) => keys.assertion(user, role, new Date(Date.now() - 10000), new Date(Date.now() + (expired ? -1000 : 290000))).accessToken;
  const schema = JSON.parse(await readFile('docs/api/openapi.yaml', 'utf8'));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv); ajv.addSchema({ $id: 'api', components: schema.components });
  function call(path, { method = 'GET', body, match, key, user = owner, role = 'USER', caller = 'bff', bearer = token(user, role), target = port } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: target, path, method, agent: false, ca: tls.ca,
        ...(caller ? tls.clients[caller] : {}), signal: AbortSignal.timeout(6000), headers: { 'content-type': 'application/json',
          ...(bearer ? { authorization: 'Bearer ' + bearer } : {}), ...(match ? { 'if-match': match } : {}), ...(key ? { 'idempotency-key': key } : {}) } }, res => {
        let text = ''; res.on('data', chunk => text += chunk); res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }));
      });
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function checked(path, options = {}, status = 200, name) {
    const result = await call(path, options);
    assert.equal(result.status, status, JSON.stringify(result.body));
    assert.equal(result.headers['cache-control'], 'no-store');
    if (name || status >= 400) {
      const validator = ajv.getSchema('api#/components/schemas/' + (name ?? 'Problem'));
      assert.ok(validator(result.body), JSON.stringify(validator.errors));
    }
    return result;
  }
  async function ready() {
    for (let index = 0; index < 100; index++) {
      try { if ((await call('/health/ready')).status === 200) return; } catch {}
      await delay(100);
    }
    throw Error('Workout did not start');
  }
  await ready();
  const root = '/api/v1/workout-plans';
  const input = { name: 'Buổi tập toàn thân', exercises: [
    { exerciseId: 'bodyweight_squat', sets: 3, targetReps: 12, restSeconds: 60 },
    { exerciseId: 'push_up', sets: 2, targetDurationSeconds: 45 },
  ] };
  const post = (body = input, key = randomUUID()) => ({ method: 'POST', body, key });
  let plan;

  await t.test('migration preserves existing plans, item order and original create receipts', async () => {
    assert.deepEqual((await checked(root, { ...post(legacyBody, legacyKey), user: legacyOwner }, 201, 'WorkoutPlan')).body, legacyReceipt);
    assert.equal((await checked(root + '/' + legacyId, { user: legacyOwner })).body.exercises[0].exerciseNameVi, 'Squat không tạ');
    assert.equal((await db.query('SELECT operation FROM workout_idempotency WHERE owner_user_id=$1', [legacyOwner])).rows[0].operation, 'plan:create');
  });

  await t.test('mutual TLS, service permissions, assertions and database ownership are enforced', async () => {
    await assert.rejects(call(root, { caller: null }));
    await checked(root, { caller: 'unknown' }, 403);
    await checked(root, { bearer: '' }, 401);
    await checked(root, { bearer: token(owner, 'USER', true) }, 401);
    await checked('/internal/v1/catalog/exercise-refs', { target: refsPort, ...post({ exerciseIds: ['bodyweight_squat'] }) }, 403);
    assert.equal((await fetch('http://127.0.0.1:' + catalogPort + '/internal/v1/catalog/exercise-refs', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exerciseIds: ['bodyweight_squat'] }) })).status, 404);
    await checked('/api/v1/admin/exercises', { target: refsPort, caller: 'notification', role: 'ADMIN' }, 403);
    const refs = await checked('/internal/v1/catalog/exercise-refs', { target: refsPort, caller: 'notification', ...post({ exerciseIds: ['bodyweight_squat', 'unknown'] }) }, 200, 'ExerciseRefList');
    assert.equal(refs.body.items[0].available, true); assert.deepEqual(refs.body.items[1], { exerciseId: 'unknown', available: false });
    await assert.rejects(db.query('SELECT * FROM exercises'), error => error.code === '42P01');
    const forbidden = new URL(url); forbidden.pathname = '/postgres';
    const forbiddenDatabase = connectDatabase(forbidden.href);
    try { await assert.rejects(forbiddenDatabase.query('SELECT 1'), error => error.code === '42501'); } finally { await forbiddenDatabase.close(); }
  });
  await t.test('strict target validation rejects client snapshots and unavailable new exercise IDs', async () => {
    await checked(root, post({ ...input, ownerUserId: other }), 422);
    await checked(root, post({ ...input, name: ' ' }), 422);
    await checked(root, post({ ...input, name: 'Tên' + String.fromCharCode(0) }), 422);
    await checked(root, post({ name: 'Bad', exercises: [{ ...input.exercises[0], targetDurationSeconds: 1 }] }), 422);
    await checked(root, post({ name: 'Bad', exercises: [{ exerciseId: 'bodyweight_squat', sets: 1 }] }), 422);
    await checked(root, post({ name: 'Bad', exercises: [{ ...input.exercises[0], exerciseNameVi: 'Client text' }] }), 422);
    await checked(root, post({ name: 'Bad', exercises: [{ exerciseId: 'missing', sets: 1, targetReps: 1 }] }), 422);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_plans WHERE owner_user_id=$1', [owner])).rows[0].n, 0);
    const literal = { ...input, description: 'Giữ ký hiệu \\u0000 trong ghi chú' };
    assert.equal((await checked(root, post(literal), 201)).body.description, literal.description);
  });
  await t.test('concurrent create replays one plan, stores order and rejects a changed fingerprint', async () => {
    const key = randomUUID();
    const results = await Promise.all([checked(root, post(input, key), 201, 'WorkoutPlan'), checked(root, post(input, key), 201, 'WorkoutPlan')]);
    assert.deepEqual(results[0].body, results[1].body); plan = results[0].body;
    assert.equal(results[0].headers.etag, '"v1"'); assert.equal(results[0].headers.location, root + '/' + plan.id);
    assert.deepEqual(plan.exercises.map(item => item.exerciseId), input.exercises.map(item => item.exerciseId));
    assert.equal(plan.exercises[0].exerciseNameVi, 'Squat không tạ');
    await checked(root, post({ ...input, name: 'Khác' }, key), 409);
    await checked(root + '/' + plan.id, { user: other, role: 'ADMIN' }, 404);
    assert.equal((await checked(root, { user: other }, 200, 'WorkoutPlanPage')).body.items.length, 0);
  });
  await t.test('replacement is atomic and only one writer wins the same version', async () => {
    const path = root + '/' + plan.id;
    await checked(path, { method: 'PUT', body: input }, 428);
    const update = { ...input, name: 'Buổi tập mới', exercises: [...input.exercises].reverse() };
    const results = await Promise.all([call(path, { method: 'PUT', match: '"v1"', body: update }), call(path, { method: 'PUT', match: '"v1"', body: input })]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 412]);
    const winner = results.find(result => result.status === 200);
    assert.equal(winner.headers.etag, '"v2"');
    assert.deepEqual((await checked(path)).body.exercises, winner.body.exercises);
    await db.query(`CREATE FUNCTION reject_workout_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.target_sets=29 THEN RAISE EXCEPTION 'injected fixture failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_item BEFORE INSERT ON workout_plan_items FOR EACH ROW EXECUTE FUNCTION reject_workout_item()`);
    const count = (await db.query('SELECT count(*)::int AS n FROM workout_idempotency')).rows[0].n;
    const broken = { ...input, exercises: [input.exercises[0], { ...input.exercises[1], sets: 29 }] };
    const key = randomUUID();
    await checked(root, post(broken, key), 503);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_idempotency')).rows[0].n, count);
    await checked(path, { method: 'PUT', match: '"v2"', body: broken }, 503);
    assert.deepEqual((await checked(path)).body, winner.body);
    await db.query('DROP TRIGGER reject_item ON workout_plan_items; DROP FUNCTION reject_workout_item()');
    await checked(root, post(broken, key), 201);
  });
  await t.test('pagination scopes cursors by owner and filter, and archive keeps snapshots', async () => {
    const page = await checked(root + '?limit=1', {}, 200, 'WorkoutPlanPage');
    assert.ok(page.body.nextCursor);
    const next = await checked(root + '?limit=1&cursor=' + page.body.nextCursor);
    assert.notEqual(page.body.items[0].id, next.body.items[0].id);
    await checked(root + '?limit=1&status=ARCHIVED&cursor=' + page.body.nextCursor, {}, 400);
    await checked(root + '?limit=1&cursor=' + page.body.nextCursor, { user: other }, 400);
    await checked(root + '?limit=1&limit=2', {}, 400);
    const path = root + '/' + plan.id;
    await checked(path, { method: 'DELETE', match: '"v1"' }, 412);
    await checked(path, { method: 'DELETE', match: '"v2"' }, 204);
    const archived = await checked(path, {}, 200, 'WorkoutPlan');
    assert.equal(archived.body.status, 'ARCHIVED'); assert.equal(archived.body.version, 3);
    await checked(path, { method: 'PUT', match: '"v3"', body: input }, 409);
    assert.equal((await checked(root + '?status=ARCHIVED')).body.items.length, 1);
  });
  const scheduleRoot = '/api/v1/workout-schedules', occurrenceRoot = '/api/v1/workout-occurrences';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let schedulePlan, winningSchedule, firstOccurrence;
  const scheduleInput = (extra = {}) => ({ planId: schedulePlan.id, timeZone: 'UTC', startDate: tomorrow,
    startLocalTime: '12:00', durationMinutes: 60, recurrence: 'ONCE', ...extra });
  const occurrenceQuery = (from = tomorrow + 'T00:00:00Z', to = tomorrow + 'T23:59:59Z', limit = 100) =>
    occurrenceRoot + '?' + new URLSearchParams({ from, to, limit: String(limit) });

  await t.test('schedule validation and owner checks happen before writes', async () => {
    schedulePlan = (await checked(root, post(), 201)).body;
    for (const extra of [{ timeZone: 'Invalid/Zone' }, { timeZone: '+07:00' }, { startDate: '2027-02-30' },
      { endDate: tomorrow }, { recurrence: 'WEEKLY' }, { weekdays: [1] }, { durationMinutes: 241 }, { status: 'ACTIVE' }]) {
      await checked(scheduleRoot, post(scheduleInput(extra)), 422);
    }
    await checked(scheduleRoot, { ...post(scheduleInput()), user: other }, 404);
    await checked(scheduleRoot, post(scheduleInput({ startDate: '2020-01-01' })), 422);
    await checked(scheduleRoot, post(scheduleInput({ planId: plan.id })), 409);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_schedules')).rows[0].n, 0);
  });

  await t.test('only one overlapping schedule commits, adjacent intervals succeed and create retries stay scoped', async () => {
    const body = scheduleInput(), key = randomUUID();
    const candidates = await Promise.all([call(scheduleRoot, post(body, key)), call(scheduleRoot, post(body))]);
    assert.deepEqual(candidates.map(result => result.status).sort(), [201, 409]);
    winningSchedule = candidates.find(result => result.status === 201).body;
    const failure = candidates.find(result => result.status === 409);
    assert.equal(failure.body.code, 'SCHEDULE_OVERLAP');
    const occurrencePage = await checked(occurrenceQuery(), {}, 200, 'WorkoutOccurrencePage');
    assert.equal(occurrencePage.body.items.length, 1);
    firstOccurrence = occurrencePage.body.items[0];
    assert.ok(failure.body.detail.includes(firstOccurrence.id));
    assert.equal(firstOccurrence.startAt, tomorrow + 'T12:00:00.000Z');
    assert.equal(firstOccurrence.plannedExercises[0].exerciseNameVi, 'Squat không tạ');
    const replayKey = randomUUID();
    const adjacent = scheduleInput({ startLocalTime: '13:00' });
    const [a, b] = await Promise.all([checked(scheduleRoot, post(adjacent, replayKey), 201, 'WorkoutSchedule'), checked(scheduleRoot, post(adjacent, replayKey), 201, 'WorkoutSchedule')]);
    assert.deepEqual(a.body, b.body);
    await checked(scheduleRoot, post({ ...adjacent, durationMinutes: 30 }, replayKey), 409);
    // Keys are scoped by operation. A plan and a schedule may use the same key.
    await checked(root, post(input, replayKey), 201);
    await checked(root + '/' + schedulePlan.id, { method: 'DELETE', match: '"v1"' }, 409);
    await checked(scheduleRoot + '/' + winningSchedule.id, { user: other, role: 'ADMIN' }, 404);
    await checked(occurrenceRoot + '/' + firstOccurrence.id, { user: other, role: 'ADMIN' }, 404);
    const otherPlan = (await checked(root, { ...post(), user: other }, 201)).body;
    await checked(scheduleRoot, { ...post(scheduleInput({ planId: otherPlan.id })), user: other }, 201);
    assert.equal((await checked(occurrenceQuery(), { user: other })).body.items.length, 1);
    const read = await checked(scheduleRoot + '/' + winningSchedule.id, {}, 200, 'WorkoutSchedule');
    assert.equal(read.headers.etag, '"v1"');
    assert.equal((await checked(occurrenceRoot + '/' + firstOccurrence.id, {}, 200, 'WorkoutOccurrence')).headers.etag, '"v1"');
  });

  await t.test('the GiST constraint rejects direct conflicting writes and keeps events atomic', async () => {
    const sql = `INSERT INTO workout_occurrences(id,owner_user_id,schedule_id,occurrence_key,local_date,starts_at,ends_at,time_zone,status,plan_snapshot)
      SELECT $1,owner_user_id,schedule_id,'constraint-probe',local_date,starts_at+interval '1 minute',ends_at,time_zone,status,plan_snapshot
      FROM workout_occurrences WHERE id=$2`;
    await assert.rejects(db.query(sql, [randomUUID(), firstOccurrence.id]), error => error.code === '23P01');
    const before = (await db.query('SELECT count(*)::int AS n FROM workout_schedules')).rows[0].n;
    const beforeEvents = (await db.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n;
    // A later recurrence overlaps the existing noon session. Earlier inserts must also roll back.
    await checked(scheduleRoot, post(scheduleInput({ recurrence: 'WEEKLY', weekdays: [1, 2, 3, 4, 5, 6, 7],
      startDate: new Date(Date.now()).toISOString().slice(0, 10) })), 409);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_schedules')).rows[0].n, before);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n, beforeEvents);
  });

  await t.test('overnight intervals conflict across dates and plan archive races schedule creation safely', async () => {
    await checked(scheduleRoot, post(scheduleInput({ startLocalTime: '23:30' })), 201);
    const nextDate = new Date(Date.parse(tomorrow + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    await checked(scheduleRoot, post(scheduleInput({ startDate: nextDate, startLocalTime: '00:00', durationMinutes: 20 })), 409);
    const subject = randomUUID();
    const currentPlan = (await checked(root, { ...post(), user: subject }, 201)).body;
    const results = await Promise.all([
      call(root + '/' + currentPlan.id, { method: 'DELETE', match: '"v1"', user: subject }),
      call(scheduleRoot, { ...post(scheduleInput({ planId: currentPlan.id })), user: subject }),
    ]);
    const statuses = results.map(result => result.status);
    assert.ok(JSON.stringify(statuses) === '[204,409]' || JSON.stringify(statuses) === '[409,201]', JSON.stringify(results));
    const current = (await checked(root + '/' + currentPlan.id, { user: subject })).body;
    const active = (await checked(scheduleRoot, { user: subject })).body.items;
    assert.equal(current.status === 'ARCHIVED' && active.length > 0, false);
  });

  await t.test('occurrence queries use scoped keyset pagination and a bounded UTC interval', async () => {
    const first = await checked(occurrenceQuery(undefined, undefined, 1), {}, 200, 'WorkoutOccurrencePage');
    assert.ok(first.body.nextCursor);
    const second = await checked(occurrenceQuery(undefined, undefined, 1) + '&cursor=' + first.body.nextCursor);
    assert.notEqual(first.body.items[0].id, second.body.items[0].id);
    await checked(occurrenceQuery(undefined, undefined, 1) + '&cursor=' + first.body.nextCursor, { user: other }, 400);
    await checked(occurrenceQuery(undefined, undefined, 2) + '&cursor=' + first.body.nextCursor, {}, 400);
    await checked(occurrenceRoot, {}, 400);
    await checked(occurrenceQuery('2027-01-01T00:00:00Z', '2027-02-06T00:00:00Z'), {}, 400);
    await checked(occurrenceQuery(tomorrow + 'T00:00:00Z', tomorrow + 'T00:00:00Z'), {}, 400);
    await checked(occurrenceQuery('not-a-date'), {}, 400);
    const schedules = await checked(scheduleRoot + '?limit=1', {}, 200, 'WorkoutSchedulePage');
    assert.ok(schedules.body.nextCursor);
    await checked(scheduleRoot + '?limit=1&status=CANCELED&cursor=' + schedules.body.nextCursor, {}, 400);
  });

  await t.test('35 local days preserve DST policy, original keys and plan snapshots', async () => {
    const subject = randomUUID();
    const currentPlan = (await checked(root, { ...post(), user: subject }, 201)).body;
    const clock = () => new Date('2027-03-01T05:00:00Z');
    const scheduled = new Schedules(db, clock);
    const body = { planId: currentPlan.id, timeZone: 'America/New_York', startDate: '2027-03-01',
      startLocalTime: '02:30', durationMinutes: 30, recurrence: 'WEEKLY', weekdays: [7] };
    const series = await scheduled.create(subject, randomUUID(), body);
    const gap = (await db.query('SELECT * FROM workout_occurrences WHERE schedule_id=$1 AND local_date=$2', [series.id, '2027-03-14'])).rows[0];
    assert.equal(gap.starts_at.toISOString(), '2027-03-14T07:00:00.000Z');
    assert.equal(gap.occurrence_key, '2027-03-14T02:30');
    const daily = await scheduled.create(subject, randomUUID(), { ...body, startLocalTime: '08:00', weekdays: [1, 2, 3, 4, 5, 6, 7] });
    assert.equal((await db.query('SELECT count(*)::int AS n FROM workout_occurrences WHERE schedule_id=$1', [daily.id])).rows[0].n, 35);
    await checked(root + '/' + currentPlan.id, { user: subject, method: 'PUT', match: '"v1"', body: { ...input,
      exercises: [{ ...input.exercises[0], targetReps: 99 }] } });
    assert.equal((await checked(occurrenceRoot + '/' + gap.id, { user: subject })).body.plannedExercises[0].targetReps, 12);
    const autumn = new Schedules(db, () => new Date('2027-11-01T04:00:00Z'));
    const fold = await autumn.create(subject, randomUUID(), { ...body, startDate: '2027-11-01', startLocalTime: '01:30', recurrence: 'ONCE', weekdays: undefined });
    const row = (await db.query('SELECT starts_at FROM workout_occurrences WHERE schedule_id=$1', [fold.id])).rows[0];
    assert.equal(row.starts_at.toISOString(), '2027-11-01T05:30:00.000Z');
    const foldDay = await autumn.create(subject, randomUUID(), { ...body, startDate: '2027-11-07', startLocalTime: '01:30', recurrence: 'ONCE', weekdays: undefined });
    assert.equal((await db.query('SELECT starts_at FROM workout_occurrences WHERE schedule_id=$1', [foldDay.id])).rows[0].starts_at.toISOString(), '2027-11-07T05:30:00.000Z');
    const outbox = (await db.query('SELECT * FROM outbox_events')).rows;
    const events = JSON.parse(await readFile('docs/api/events.yaml', 'utf8'));
    const validate = ajv.compile(events);
    for (const row of outbox) {
      assert.ok(validate(row.payload), JSON.stringify(validate.errors));
      assert.equal(row.payload.id, row.event_id);
      assert.equal(row.payload.aggregateVersion, row.aggregate_version);
      assert.equal(row.status, 'PENDING');
    }
    assert.equal(outbox.length, (await db.query('SELECT count(*)::int AS n FROM workout_occurrences')).rows[0].n);
  });

  await t.test('outbox failure rolls back the schedule, occurrences and idempotency receipt', async () => {
    const subject = randomUUID();
    const ownPlan = (await checked(root, { ...post(), user: subject }, 201)).body;
    await db.query(`CREATE FUNCTION fail_workout_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.payload->'data'->>'userId'='${subject}' THEN RAISE EXCEPTION 'event fixture failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_event BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_workout_event()`);
    const key = randomUUID(), body = scheduleInput({ planId: ownPlan.id });
    await checked(scheduleRoot, { ...post(body, key), user: subject }, 503);
    for (const table of ['workout_schedules', 'workout_occurrences', 'workout_idempotency']) {
      const filter = table === 'workout_idempotency' ? " AND operation='schedule:create'" : '';
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE owner_user_id=$1` + filter, [subject])).rows[0].n, 0);
    }
    await db.query('DROP TRIGGER fail_event ON outbox_events; DROP FUNCTION fail_workout_event()');
    await checked(scheduleRoot, { ...post(body, key), user: subject }, 201);
  });

  await scheduleChangeCases({ t, db, checked, call, input, config, cleanup });

  await t.test('RabbitMQ confirms and replay preserve event IDs; the relay runs independently with scoped ACLs', async () => {
    const broker = await startRabbit({ publisher: 'workout' }); cleanup.push(broker.stop); t.diagnostic(broker.version);
    const admin = await connect(broker.url); admin.on('error', () => {}); cleanup.push(() => admin.close());
    const channel = await admin.createChannel(); channel.on('error', () => {});
    const publisher = await ConfirmPublisher.open(broker.publisherUrl, undefined, true); cleanup.push(() => publisher.close());
    const event = (await db.query('SELECT event_id,payload FROM outbox_events ORDER BY event_id LIMIT 1')).rows[0];
    await db.query("UPDATE outbox_events SET available_at=now()+interval '1 day'");
    await db.query("UPDATE outbox_events SET available_at=now()-interval '1 second' WHERE event_id=$1", [event.event_id]);
    const relay = new OutboxRelay(db, publisher);
    await assert.rejects(relay.tick(), /unconfirmed/);
    assert.equal((await db.query('SELECT status FROM outbox_events WHERE event_id=$1', [event.event_id])).rows[0].status, 'PENDING');
    const queue = 'smartgym.workout-test.v1';
    await channel.assertQueue(queue, { durable: true, arguments: { 'x-queue-type': 'quorum' } });
    await channel.bindQueue(queue, 'smartgym.events.v1', 'workout.occurrence.changed.v1');
    const lost = new OutboxRelay(db, { publish: async value => { await publisher.publish(value); throw new Error('Confirm fixture lost'); } });
    await db.query("UPDATE outbox_events SET available_at=now()-interval '1 second' WHERE event_id=$1", [event.event_id]);
    await assert.rejects(lost.tick(), /unconfirmed/);
    await db.query("UPDATE outbox_events SET available_at=now()-interval '1 second' WHERE event_id=$1", [event.event_id]);
    assert.equal(await relay.tick(), true);
    const first = await channel.get(queue), second = await channel.get(queue);
    assert.ok(first && second);
    for (const message of [first, second]) {
      assert.equal(message.properties.messageId, event.event_id);
      assert.equal(JSON.parse(message.content).id, event.event_id);
      assert.equal(message.properties.deliveryMode, 2);
      channel.ack(message);
    }
    const denied = await ConfirmPublisher.open(broker.publisherUrl, undefined, true);
    try { await assert.rejects(denied.publish({ ...event.payload, type: 'identity.email-action.requested.v1' })); }
    finally { await denied.close(); }
    await db.query("UPDATE outbox_events SET available_at=now() WHERE status='PENDING'");
    const relayProcess = startProcess(['dist/relay-main.js'], 'backend/services/workout', { ...config, WORKOUT_AMQP_URL: broker.publisherUrl,
      BROKER_ALLOW_LOOPBACK_PLAINTEXT: 'true', NODE_ENV: 'development' });
    cleanup.push(() => relayProcess.stop());
    let pending;
    for (let attempt = 0; attempt < 100; attempt++) {
      pending = (await db.query("SELECT count(*)::int AS n FROM outbox_events WHERE status='PENDING'")).rows[0].n;
      if (!pending) break;
      await delay(100);
    }
    assert.equal(pending, 0);
    const delivered = [];
    for (;;) {
      const message = await channel.get(queue);
      if (!message) break;
      delivered.push(JSON.parse(message.content).id); channel.ack(message);
    }
    const total = (await db.query('SELECT count(*)::int AS n FROM outbox_events')).rows[0].n;
    assert.equal(new Set(delivered).size, total - 1);
    await relayProcess.stop();
  });

  await t.test('withdrawn Catalog items retain historical names and cannot enter a new plan', async () => {
    const created = (await checked(root, post(), 201)).body;
    await catalogDb.query("UPDATE exercises SET lifecycle='ARCHIVED' WHERE id='bodyweight_squat'");
    assert.equal((await checked(root + '/' + created.id)).body.exercises[0].exerciseNameVi, 'Squat không tạ');
    await checked(root, post(), 422);
    const updated = await checked(root + '/' + created.id, { method: 'PUT', match: '"v1"', body: { ...input, name: 'Giữ lịch sử' } });
    assert.equal(updated.body.exercises[0].exerciseNameVi, 'Squat không tạ');
  });
  await t.test('Catalog failure preserves reads and replay after a Workout restart', async () => {
    const key = randomUUID(), body = { name: 'Lặp lại', exercises: [input.exercises[1]] };
    const created = await checked(root, post(body, key), 201);
    await catalog.stop(); await api.stop();
    api = startProcess(['dist/main.js'], 'backend/services/workout', config); await ready();
    assert.deepEqual((await checked(root, post(body, key), 201)).body, created.body);
    await checked(root + '/' + created.body.id, {}, 200, 'WorkoutPlan');
    await checked(root, post(body), 503);
    await checked('/health/ready');
  });
});
