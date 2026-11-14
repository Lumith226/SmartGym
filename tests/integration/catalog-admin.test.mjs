import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { randomUUID, randomBytes, generateKeyPairSync, sign } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { startPostgres, freePort } from '../helpers/postgres.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { createTestTls } from '../../backend/services/identity/test/tls.cjs';
import { createApp as createIdentity } from '../../backend/services/identity/dist/app.js';
import { IdentityKeys } from '../../backend/services/identity/dist/modules/accounts/crypto.js';
import { connectDatabase } from '../../backend/services/catalog/dist/database.js';
import { migrate } from '../../backend/services/catalog/dist/migrate.js';
import { importSnapshot } from '../../backend/services/catalog/dist/import.js';
import { fingerprint } from '../../backend/services/catalog/dist/modules/admin/admin-store.js';

test('Catalog CMS over PostgreSQL and real mTLS/JWKS', { timeout: 120000 }, async t => {
  const cleanup = [];
  t.after(async () => {
    const failures = [];
    for (const close of cleanup.reverse()) {
      try { await close(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Catalog fixture cleanup failed');
  });
  const pg = await startPostgres(); cleanup.push(pg.stop);
  t.diagnostic(pg.version);
  const database = connectDatabase(pg.connectionString); cleanup.push(() => database.close());
  await migrate(database);
  const snapshot = JSON.parse(await readFile('backend/services/catalog/data/smartgym-m2.json', 'utf8'));
  await importSnapshot(database, snapshot, true);
  const fixtureBase = resolve('.local'); await mkdir(fixtureBase, { recursive: true });
  const importDir = await mkdtemp(join(fixtureBase, 'cms-import-'));
  cleanup.push(async () => { assert.ok(importDir.startsWith(fixtureBase + sep)); await rm(importDir, { recursive: true, force: true }); });
  const registryFile = join(importDir, 'registry.json'), registry = [];
  await writeFile(registryFile, '[]');
  async function registerPackage(records, revision = 'fixture-' + randomUUID()) {
    const pkg = { sourceKey: 'SMARTGYM_KB', sourceRevision: revision,
      provenance: { sourceRef: snapshot.source.path, sha256: snapshot.source.sha256, rights: snapshot.source.rights }, records };
    const request = { sourceKey: pkg.sourceKey, sourceRevision: revision, manifestSha256: fingerprint(pkg) };
    const file = revision + '.json'; await writeFile(join(importDir, file), JSON.stringify(pkg));
    registry.push({ ...request, file }); await writeFile(registryFile, JSON.stringify(registry));
    return { request, pkg, file: join(importDir, file) };
  }
  const tls = await createTestTls(); cleanup.push(tls.stop);
  const issuer = 'https://identity.test';
  const signingKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const identityKeys = new IdentityKeys(signingKey.export({ type: 'pkcs8', format: 'pem' }), 'cms-fixture', issuer, randomBytes(32), randomBytes(32));
  // Only Identity's key endpoint is exercised. No Identity data is stored in the Catalog test database.
  const unavailableDb = {
    query: async () => { throw new Error('JWKS should not query a database'); },
    transaction: async () => { throw new Error('JWKS should not query a database'); },
    close: async () => {},
  };
  const { app: identity } = await createIdentity(unavailableDb, { keys: identityKeys, webOrigin: 'https://web.test', callers: tls.callers, tls: { ...tls.clients.server, ca: tls.ca } });
  await identity.listen(0, '127.0.0.1');
  let closed = false;
  const closeIdentity = async () => { if (!closed) { closed = true; await identity.close(); } };
  cleanup.push(closeIdentity);
  const publicPort = await freePort(), adminPort = await freePort();
  const config = {
    DATABASE_URL: pg.connectionString, HOST: '127.0.0.1', PORT: String(publicPort),
    CATALOG_ADMIN_ENABLED: 'true', CATALOG_ADMIN_PORT: String(adminPort),
    CATALOG_ADMIN_BFF_FINGERPRINTS: JSON.stringify(tls.callers.bff),
    CATALOG_ADMIN_TLS_KEY_FILE: join(tls.directory, 'server.key'), CATALOG_ADMIN_TLS_CERT_FILE: join(tls.directory, 'server.crt'),
    CATALOG_ADMIN_TLS_CA_FILE: join(tls.directory, 'ca.crt'), CATALOG_IDENTITY_TLS_CA_FILE: join(tls.directory, 'ca.crt'),
    CATALOG_IDENTITY_TLS_KEY_FILE: join(tls.directory, 'catalog.key'), CATALOG_IDENTITY_TLS_CERT_FILE: join(tls.directory, 'catalog.crt'),
    CATALOG_IDENTITY_ORIGIN: 'https://127.0.0.1:' + identity.getHttpServer().address().port, CATALOG_IDENTITY_ISSUER: issuer,
    CATALOG_IMPORT_REGISTRY_FILE: registryFile,
  };
  const process = startProcess(['dist/main.js'], 'backend/services/catalog', config); cleanup.push(() => process.stop());
  const publicOrigin = 'http://127.0.0.1:' + publicPort;
  await process.waitFor(publicOrigin + '/health/ready');
  const actor = randomUUID(), secondActor = randomUUID(), user = randomUUID();
  const assertion = (id, role, now = new Date()) => identityKeys.assertion(id, role, now, new Date(now.getTime() + 300000)).accessToken;
  const token = () => assertion(actor, 'ADMIN');
  function call(path, { method = 'GET', body, auth = token(), caller = 'bff', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: adminPort, path: '/api/v1/admin' + path,
        method, ...(caller ? tls.clients[caller] : {}), ca: tls.ca, agent: false, signal: AbortSignal.timeout(7000),
        headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}), ...headers } }, res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }));
      });
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  const api = JSON.parse(await readFile('docs/api/openapi.yaml', 'utf8'));
  const events = JSON.parse(await readFile('docs/api/events.yaml', 'utf8'));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  ajv.addSchema({ $id: 'catalog-admin-contract', components: api.components });
  const validEvent = ajv.compile(events);
  function contract(name, value) {
    const validate = ajv.getSchema('catalog-admin-contract#/components/schemas/' + name);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
  const apiCall = async (path, opts, status, schema) => {
    const response = await call(path, opts);
    assert.equal(response.status, status, JSON.stringify(response.body));
    assert.equal(response.headers['cache-control'], 'no-store');
    if (schema || status >= 400) contract(schema ?? 'Problem', response.body);
    return response;
  };
  let adminReady = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await call('/exercises?limit=1')).status === 200) { adminReady = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(adminReady, 'Catalog mTLS listener did not become ready');
  const base = '/exercises', item = '/exercises/cms_trial', firstSlug = 'cms-thu-nghiem', newSlug = 'cms-da-doi-ten';
  const draft = { id: 'cms_trial', slug: firstSlug, nameVi: 'Động tác thử nghiệm', summary: 'Hướng dẫn thử nghiệm cho SmartGym.',
    primaryMuscleIds: [snapshot.muscleGroups[0].id], equipmentIds: [], instructions: ['Đứng vững.'], sourceRef: 'CASE-cms-fixture',
    workoutType: 'STRENGTH', focusArea: 'LOWER_BODY', difficulty: 2 };
  const command = (match, key = randomUUID(), body) => ({ method: 'POST', headers: { ...(match ? { 'if-match': match } : {}), 'idempotency-key': key }, body });
  const update = (match, body, auth = token()) => ({ method: 'PATCH', headers: match ? { 'if-match': match } : {}, body, auth });
  const pub = slug => fetch(publicOrigin + '/api/v1/exercises/' + slug, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  const importHead = async () => (await database.query('SELECT revision,aggregate_version FROM publication_revisions ORDER BY aggregate_version DESC LIMIT 1')).rows[0];

  await t.test('Pose links are admin-managed and only published exercises are exposed', async () => {
    const linkPath = '/pose-exercise-links';
    const published = await (await fetch(publicOrigin + '/api/v1/exercises?limit=1')).json();
    const exerciseId = published.items[0].id;
    const put = (poseId, exerciseId) => ({ method: 'PUT', body: { poseId, exerciseId } });
    const links = () => fetch(publicOrigin + '/api/v1/pose-exercise-links').then(response => response.json());
    await apiCall(linkPath, { ...put('fixture_pose', exerciseId), auth: assertion(actor, 'USER') }, 403);
    await apiCall(linkPath, put('fixture_pose', 'does_not_exist'), 409);
    const saved = await apiCall(linkPath, put('fixture_pose', exerciseId), 200, 'PoseExerciseLinkList');
    assert.ok(saved.body.items.some(row => row.poseId === 'fixture_pose' && row.exerciseId === exerciseId));
    assert.ok((await links()).items.some(row => row.poseId === 'fixture_pose' && row.published));
    await apiCall(linkPath, put('fixture_other', exerciseId), 409);
    await apiCall(linkPath, put('fixture_pose', null), 200, 'PoseExerciseLinkList');
    assert.ok(!(await links()).items.some(row => row.poseId === 'fixture_pose'));
  });

  await t.test('Catalog verifies mTLS and JWT claims before accessing admin data', async () => {
    await assert.rejects(call(base, { caller: null }));
    await apiCall(base, { caller: 'notification' }, 403);
    await apiCall(base, { auth: null, headers: { 'x-user-role': 'ADMIN' } }, 401);
    await apiCall(base, { auth: assertion(user, 'USER') }, 403);
    await apiCall(base, { auth: assertion(actor, 'ADMIN', new Date(Date.now() - 360000)) }, 401);
    const [header, payload, signature] = token().split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), sub: secondActor })).toString('base64url');
    await apiCall(base, { auth: [header, forged, signature].join('.') }, 401);
    const wrongAudience = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), aud: 'other-service' })).toString('base64url');
    const input = header + '.' + wrongAudience;
    await apiCall(base, { auth: input + '.' + sign('RSA-SHA256', Buffer.from(input), signingKey).toString('base64url') }, 401);
    assert.equal((await fetch(publicOrigin + '/api/v1/admin/exercises')).status, 404);
  });

  await t.test('legacy data projects into admin and draft creation is idempotent and private', async () => {
    await apiCall('/exercises/bodyweight_squat', {}, 200, 'ExerciseAdminDetail');
    const opts = command(null, randomUUID(), draft);
    const responses = await Promise.all([call(base, opts), call(base, opts)]);
    for (const response of responses) {
      assert.equal(response.status, 201, JSON.stringify(response.body));
      contract('ExerciseAdminDetail', response.body);
      assert.equal(response.headers.etag, '"v1"');
      assert.equal(response.headers.location, '/api/v1/admin/exercises/cms_trial');
    }
    assert.deepEqual(responses[0].body, responses[1].body);
    await apiCall(base, { ...opts, body: { ...draft, summary: 'different' } }, 409);
    await apiCall(base, command(null, randomUUID(), { ...draft, id: 'invalid_ref', primaryMuscleIds: ['does_not_exist'] }), 422);
    assert.equal((await pub(firstSlug)).status, 404);
    const list = await apiCall(base + '?q=dong%20tac&status=DRAFT&sort=name_asc', {}, 200, 'ExerciseAdminDetailPage');
    assert.equal(list.body.items[0].id, draft.id);
    const head = await apiCall(base + '?limit=1&sort=name_asc', {}, 200, 'ExerciseAdminDetailPage');
    const tail = await apiCall(base + '?limit=1&sort=name_asc&cursor=' + head.body.nextCursor, {}, 200, 'ExerciseAdminDetailPage');
    assert.notEqual(tail.body.items[0].id, head.body.items[0].id);
    await apiCall(base + '?limit=2&sort=name_asc&cursor=' + head.body.nextCursor, {}, 400);
    const numbered = await apiCall(base + '?page=2&limit=1&sort=name_asc', {}, 200, 'ExerciseAdminDetailPage');
    assert.equal(numbered.body.items[0].id, tail.body.items[0].id);
    assert.equal(numbered.body.pagination.page, 2);
    const filtered = await apiCall(base + '?q=dong%20tac&status=DRAFT&page=9', {}, 200, 'ExerciseAdminDetailPage');
    assert.deepEqual(filtered.body.pagination, { page: 1, pageSize: 20, total: 1 });
    assert.equal(filtered.body.items[0].id, draft.id);
    const empty = await apiCall(base + '?q=no_such_exercise&page=9', {}, 200, 'ExerciseAdminDetailPage');
    assert.deepEqual(empty.body, { items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0 } });
    await apiCall(base + '?page=0', {}, 400);
    await apiCall(base + '?page=1&cursor=' + head.body.nextCursor, {}, 400);
  });

  await t.test('two admins editing one version cannot overwrite each other', async () => {
    await apiCall(item, update(null, { summary: 'Thiếu phiên bản' }), 428);
    await apiCall(item, update('W/"v1"', { summary: 'Weak ETag' }), 400);
    const race = await Promise.all([
      call(item, update('"v1"', { nameVi: 'Động tác A' })),
      call(item, update('"v1"', { nameVi: 'Động tác B' }, assertion(secondActor, 'ADMIN'))),
    ]);
    assert.deepEqual(race.map(response => response.status).sort(), [200, 412]);
    const latest = await apiCall(item, {}, 200, 'ExerciseAdminDetail');
    assert.equal(latest.headers.etag, '"v2"');
  });

  await t.test('incomplete classification can be saved but cannot be published', async () => {
    const { difficulty, ...incomplete } = draft;
    const id = 'cms_incomplete_classification', slug = 'cms-incomplete-classification';
    const created = await apiCall(base, command(null, randomUUID(), { ...incomplete, id, slug }), 201);
    const blocked = await apiCall(base + '/' + id + '/publish', command(created.headers.etag), 422);
    assert.equal(blocked.body.code, 'EXERCISE_CLASSIFICATION_REQUIRED');
    assert.equal((await pub(slug)).status, 404);
  });

  await t.test('publish rejects USER, unchecked media and unpublished taxonomy', async () => {
    await apiCall(item + '/publish', { ...command('"v2"'), auth: assertion(user, 'USER') }, 403);
    await apiCall(item, update('"v2"', { mediaIds: ['unchecked'] }), 200);
    const blocked = await apiCall(item + '/publish', command('"v3"'), 422);
    assert.equal(blocked.body.code, 'MEDIA_NOT_APPROVED');
    await apiCall(item, update('"v3"', { mediaIds: [] }), 200);
    await database.query("UPDATE muscle_groups SET lifecycle='DRAFT' WHERE id=$1", draft.primaryMuscleIds);
    try {
      const response = await apiCall(item + '/publish', command('"v4"'), 422);
      assert.equal(response.body.code, 'INVALID_TAXONOMY_REFERENCE');
    } finally {
      await database.query("UPDATE muscle_groups SET lifecycle='PUBLISHED' WHERE id=$1", draft.primaryMuscleIds);
    }
    assert.equal((await pub(firstSlug)).status, 404);
  });

  await t.test('publish replays the original response and preserves the public revision during edits', async () => {
    const opts = command('"v4"');
    const response = await apiCall(item + '/publish', opts, 200, 'ExerciseAdminDetail');
    assert.equal(response.headers.etag, '"v5"');
    const first = await pub(firstSlug);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const detail = await first.json(); contract('ExerciseDetail', detail);
    assert.equal(detail.sourceRef, undefined);
    await apiCall(item, update('"v5"', { slug: newSlug, summary: 'Nội dung mới' }), 200);
    const replay = await apiCall(item + '/publish', opts, 200, 'ExerciseAdminDetail');
    assert.deepEqual(replay.body, response.body);
    assert.equal(replay.headers.etag, '"v5"');
    assert.deepEqual(await (await pub(firstSlug)).json(), detail);
    assert.equal((await pub(newSlug)).status, 404);
    await apiCall(item + '/publish', { ...opts, headers: { ...opts.headers, 'if-match': '"v6"' } }, 409);
  });

  await t.test('outbox failure rolls back publication, alias and idempotency', async () => {
    await database.query(`CREATE FUNCTION fail_cms_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test-only fault'; END; $$;
      CREATE TRIGGER fail_cms_outbox BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION fail_cms_outbox()`);
    const opts = command('"v6"');
    try { await apiCall(item + '/publish', opts, 503); }
    finally { await database.query('DROP TRIGGER fail_cms_outbox ON outbox_events; DROP FUNCTION fail_cms_outbox()'); }
    assert.equal((await pub(firstSlug)).status, 200);
    assert.equal((await pub(newSlug)).status, 404);
    assert.equal((await apiCall(item, {}, 200)).headers.etag, '"v6"');
    const published = await apiCall(item + '/publish', opts, 200);
    assert.equal(published.headers.etag, '"v7"');
    const alias = await pub(firstSlug);
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get('cache-control'), 'no-store');
    assert.equal(alias.headers.get('location'), '/api/v1/exercises/' + newSlug);
    assert.equal((await (await pub(newSlug)).json()).summary, 'Nội dung mới');
  });

  await t.test('unpublish hides both slugs, retains ownership and writes contract-valid events and append-only audit', async () => {
    const opts = command('"v7"', randomUUID(), { reason: 'Rút nội dung để rà soát' });
    const archived = await apiCall(item + '/unpublish', opts, 200, 'ExerciseAdminDetail');
    assert.equal(archived.body.status, 'ARCHIVED');
    assert.equal(archived.body.publishedVersion, undefined);
    assert.deepEqual((await apiCall(item + '/unpublish', opts, 200)).body, archived.body);
    assert.equal((await pub(firstSlug)).status, 404);
    assert.equal((await pub(newSlug)).status, 404);
    await apiCall(item, update('"v8"', { summary: 'archived' }), 409);
    await apiCall(base, command(null, randomUUID(), { ...draft, id: 'cms_collision' }), 201);
    const collision = await apiCall('/exercises/cms_collision/publish', command('"v1"'), 409);
    assert.equal(collision.body.code, 'SLUG_UNAVAILABLE');
    const { rows } = await database.query('SELECT payload,status FROM outbox_events ORDER BY aggregate_version');
    assert.deepEqual(rows.map(row => row.payload.type), ['catalog.exercise.published.v1', 'catalog.exercise.updated.v1', 'catalog.exercise.unpublished.v1']);
    for (const row of rows) {
      assert.equal(row.status, 'PENDING');
      assert.equal(validEvent(row.payload), true, JSON.stringify(validEvent.errors));
    }
    const audit = await apiCall('/catalog-audit?contentId=cms_trial&limit=2', {}, 200, 'CatalogAuditEntryPage');
    assert.equal(audit.body.items[0].actorUserId, actor);
    assert.equal(audit.body.items[0].correlationId, rows[2].payload.correlationId);
    assert.equal(audit.body.items[0].reason, opts.body.reason);
    assert.ok(audit.body.nextCursor);
    const next = await apiCall('/catalog-audit?contentId=cms_trial&limit=2&cursor=' + audit.body.nextCursor, {}, 200, 'CatalogAuditEntryPage');
    assert.ok(next.body.items.every(entry => !audit.body.items.some(first => first.id === entry.id)));
    await apiCall('/exercise-audit?exerciseId=cms_trial', {}, 200, 'CatalogAuditEntryPage');
    await assert.rejects(database.query("UPDATE catalog_audit SET reason='changed'"), /append-only/);
  });

  await t.test('delete is limited to archived exercises and retains history and idempotency', async () => {
    const id = 'cms_delete_trial', path = base + '/' + id;
    const created = await apiCall(base, command(null, randomUUID(), { ...draft, id, slug: 'cms-delete-trial' }), 201);
    const remove = (tag, key = randomUUID()) => ({ ...command(tag, key), method: 'DELETE' });
    assert.equal((await apiCall(path, remove(created.headers.etag), 409)).body.code, 'EXERCISE_NOT_ARCHIVED');
    const archived = await apiCall(path + '/unpublish', command(created.headers.etag, randomUUID(), { reason: 'Kiểm thử xóa' }), 200);
    await apiCall(path, { ...remove(archived.headers.etag), auth: assertion(user, 'USER') }, 403);
    await apiCall(path, remove(null), 428);
    await apiCall(path, remove(created.headers.etag), 412);
    const statsBefore = (await apiCall('/stats', {}, 200)).body;
    const request = remove(archived.headers.etag);
    const deleted = await apiCall(path, request, 200, 'ExerciseDeletionReceipt');
    assert.deepEqual(deleted.body, { id, deleted: true });
    assert.deepEqual((await apiCall(path, request, 200)).body, deleted.body);
    await apiCall(path, remove(archived.headers.etag), 404);
    await apiCall(path, {}, 404);
    await apiCall(path + '/restore', command(archived.headers.etag), 404);
    assert.deepEqual((await apiCall(base + '?q=' + id + '&status=ARCHIVED', {}, 200)).body.items, []);
    const statsAfter = (await apiCall('/stats', {}, 200)).body;
    assert.equal(statsAfter.archived, statsBefore.archived - 1);
    assert.equal(statsAfter.total, statsBefore.total - 1);
    const entries = (await apiCall('/catalog-audit?contentId=' + id, {}, 200, 'CatalogAuditEntryPage')).body.items;
    assert.equal(entries.filter(entry => entry.action === 'DELETE').length, 1);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM exercise_revisions WHERE exercise_id=$1', [id])).rows[0].n, 1);
  });

  const support = (type, id = '') => '/content/' + type + (id ? '/' + id : '');
  const createSupport = (type, id, data, opts = command(null)) =>
    apiCall(support(type), { ...opts, body: { id, contentType: type, data } }, 201, 'CmsContentView');
  const publicTaxonomy = async name => (await (await fetch(publicOrigin + '/api/v1/' + name)).json()).items;
  await t.test('typed support CRUD checks identity, discriminator, optimistic locks and cursors', async () => {
    const type = 'muscle-group', id = 'cms_test_group', path = support(type, id);
    const data = { nameVi: 'Nhóm cơ thử nghiệm', slug: 'nhom-co-thu-nghiem', sortOrder: 1, regionKey: 'test_front', side: 'FRONT' };
    await apiCall(support(type), { auth: assertion(user, 'USER') }, 403);
    await apiCall(support('invalid-type'), {}, 404);
    await apiCall(path, update('"v1"', { contentType: type, data: { sortOrder: 2 } }), 404);
    await apiCall(support(type), command(null, randomUUID(), { id, contentType: 'equipment', data: { nameVi: 'Khác', slug: 'khac' } }), 422);
    await apiCall(support(type), command(null, randomUUID(), { id, contentType: type, data: { ...data, regionKey: 'bad region' } }), 422);
    await apiCall(support(type), command(null, randomUUID(), { id, contentType: type, data: { ...data, sortOrder: 2147483648 } }), 422);
    const opts = command(null), created = await createSupport(type, id, data, opts);
    assert.equal(created.headers.etag, '"v1"');
    assert.deepEqual((await createSupport(type, id, data, opts)).body, created.body);
    assert.equal((await apiCall(support(type), { ...opts, body: { id, contentType: type, data: { ...data, sortOrder: 2 } } }, 409)).body.code, 'IDEMPOTENCY_CONFLICT');
    const listed = await apiCall(support(type) + '?q=nhom%20co%20thu&status=DRAFT', {}, 200, 'CmsContentPage');
    assert.deepEqual(listed.body.items.map(row => row.id), [id]);
    const head = await apiCall(support(type) + '?limit=1&sort=name_asc', {}, 200, 'CmsContentPage');
    assert.ok(head.body.nextCursor);
    const next = await apiCall(support(type) + '?limit=1&sort=name_asc&cursor=' + head.body.nextCursor, {}, 200, 'CmsContentPage');
    assert.notEqual(head.body.items[0].id, next.body.items[0].id);
    await apiCall(support(type) + '?limit=1&cursor=' + head.body.nextCursor, {}, 400);
    await apiCall(support(type) + '?exerciseId=bodyweight_squat', {}, 422);
    assert.equal((await publicTaxonomy('muscle-groups')).some(row => row.id === id), false);
    await apiCall(path, update(null, { contentType: type, data: { sortOrder: 2 } }), 428);
    const racing = await Promise.all([2, 3].map(sortOrder => call(path, update('"v1"', { contentType: type, data: { sortOrder } }))));
    assert.deepEqual(racing.map(response => response.status).sort(), [200, 412]);
    await apiCall(path + '/publish', command('"v2"'), 200, 'CmsContentView');
    assert.deepEqual((await publicTaxonomy('muscle-groups')).find(row => row.id === id).svgRegions, ['test_front']);
    await createSupport(type, 'cms_duplicate_region', { ...data, slug: 'khac-test' });
    const conflict = await apiCall(support(type, 'cms_duplicate_region') + '/publish', command('"v1"'), 409);
    assert.equal(conflict.body.code, 'REGION_KEY_UNAVAILABLE');
    await apiCall(path, update('"v3"', { contentType: type, data: { nameVi: 'Tên nháp mới' } }), 200, 'CmsContentView');
    assert.equal((await publicTaxonomy('muscle-groups')).find(row => row.id === id).labelVi, data.nameVi);
    await assert.rejects(database.query("UPDATE support_revisions SET action='changed'"), /append-only/);
    assert.equal((await apiCall(support('muscle-group', draft.primaryMuscleIds[0]) + '/archive', command('"v1"', randomUUID(), { reason: 'Đang dùng' }), 409)).body.code, 'CONTENT_IN_PUBLIC_USE');
  });

  await t.test('variants pin their own published revision and cannot move between exercises', async () => {
    const type = 'exercise-variant', id = 'cms_variant', exerciseId = 'cms_variant_parent', path = support(type, id);
    await apiCall(base, command(null, randomUUID(), { ...draft, id: exerciseId, slug: 'variant-parent', variantIds: [id] }), 201);
    const exercise = base + '/' + exerciseId;
    assert.equal((await apiCall(exercise + '/publish', command('"v1"'), 422)).body.code, 'VARIANT_NOT_PUBLISHED');
    await createSupport(type, id, { exerciseId, nameVi: 'Biến thể đầu' });
    await apiCall(path, update('"v1"', { contentType: type, data: { exerciseId: 'bodyweight_squat' } }), 422);
    const list = await apiCall(support(type) + '?exerciseId=' + exerciseId, {}, 200, 'CmsContentPage');
    assert.deepEqual(list.body.items.map(row => row.id), [id]);
    await apiCall(path + '/publish', command('"v1"'), 200, 'CmsContentView');
    await apiCall(exercise + '/publish', command('"v1"'), 200, 'ExerciseAdminDetail');
    const read = async () => (await (await pub('variant-parent')).json());
    const original = await read(); contract('ExerciseDetail', original);
    assert.deepEqual(original.variants, [{ id, nameVi: 'Biến thể đầu' }]);
    await apiCall(path, update('"v2"', { contentType: type, data: { nameVi: 'Biến thể sau' } }), 200, 'CmsContentView');
    await apiCall(path + '/publish', command('"v3"'), 200, 'CmsContentView');
    assert.deepEqual((await read()).variants, original.variants);
    assert.equal((await database.query('SELECT support_version FROM revision_variants WHERE exercise_id=$1', [exerciseId])).rows[0].support_version, 1);
    await apiCall(path + '/archive', command('"v4"', randomUUID(), { reason: 'Còn liên kết' }), 409);
    await apiCall(exercise, update('"v2"', { summary: 'Gắn lại bản mới.' }), 200);
    await apiCall(exercise + '/publish', command('"v3"'), 200);
    assert.equal((await read()).variants[0].nameVi, 'Biến thể sau');
  });

  await t.test('media metadata requires a READY upload of the correct owner and approved rights to publish', async () => {
    const id = 'cms_media', type = 'media', path = support(type, id);
    const data = { kind: 'IMAGE', uploadId: 'fixture_upload', sourceUri: 'https://example.test/licensed', credit: 'SmartGym fixture',
      licenseRef: 'TEST-LICENSE', altText: 'Ảnh thử nghiệm', rightsStatus: 'PENDING' };
    const body = { id, contentType: type, data };
    await apiCall(support(type), command(null, randomUUID(), { ...body, data: { ...data, sourceUri: 'not an absolute uri' } }), 422);
    assert.equal((await apiCall(support(type), command(null, randomUUID(), body), 422)).body.code, 'MEDIA_UPLOAD_NOT_READY');
    // T33 will create READY uploads through the verifier. Use local metadata only, without an actual object or media URL.
    await database.query(`INSERT INTO media_uploads(id,actor_id,object_key,object_version,expected_mime,expected_bytes,expected_sha256,detected_mime,status,expires_at,verified_at)
      VALUES($1,$2,'fixtures/private','fixture-v1','image/png',1024,$3,'image/png','READY',now(),now())`, [data.uploadId, actor, 'f'.repeat(64)]);
    await apiCall(support(type), { ...command(null, randomUUID(), body), auth: assertion(secondActor, 'ADMIN') }, 422);
    await apiCall(support(type), command(null, randomUUID(), { ...body, data: { ...data, kind: 'VIDEO' } }), 422);
    const saved = await createSupport(type, id, data);
    assert.equal(saved.body.data.objectKey, undefined);
    assert.equal((await apiCall(path + '/publish', command('"v1"'), 422)).body.code, 'MEDIA_NOT_APPROVED');
    await apiCall(path, update('"v1"', { contentType: type, data: { rightsStatus: 'APPROVED' } }), 200, 'CmsContentView');
    await apiCall(path + '/publish', command('"v2"'), 200, 'CmsContentView');
    const archive = command('"v3"', randomUUID(), { reason: 'Rà soát giấy phép' });
    const archived = await apiCall(path + '/archive', archive, 200, 'CmsContentView');
    assert.equal(archived.body.status, 'ARCHIVED');
    assert.deepEqual((await apiCall(path + '/archive', archive, 200)).body, archived.body);
    await apiCall(path, update('"v4"', { contentType: type, data: { altText: 'Đã gỡ' } }), 409);
    const restored = await apiCall(path + '/restore', command('"v4"'), 200, 'CmsContentView');
    assert.equal(restored.body.status, 'DRAFT');
    assert.equal(restored.body.publishedVersion, undefined);
    const audit = await apiCall('/catalog-audit?contentType=media&contentId=' + id, {}, 200, 'CatalogAuditEntryPage');
    assert.deepEqual(audit.body.items.map(row => row.action), ['RESTORE', 'ARCHIVE', 'PUBLISH', 'UPDATE_DRAFT', 'CREATE_DRAFT']);
    assert.equal(audit.body.items[1].reason, archive.body.reason);
  });

  await t.test('exercise publication and support archive serialize in both transaction orders', async () => {
    const waitForQueue = async count => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const { rows } = await database.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND objid=73002 AND NOT granted");
        if (rows[0].n >= count) return;
        await delay(25);
      }
      assert.fail('CMS command did not queue behind the transaction lock');
    };
    for (const publishFirst of [true, false]) {
      const id = publishFirst ? 'race_publish' : 'race_archive', type = 'equipment', slug = id.replace('_', '-');
      const path = support(type, id);
      await createSupport(type, id, { nameVi: 'Dụng cụ thử tranh chấp', slug });
      await apiCall(path + '/publish', command('"v1"'), 200);
      await apiCall(base, command(null, randomUUID(), { ...draft, id, slug, equipmentIds: [id] }), 201);
      const publish = () => call(base + '/' + id + '/publish', command('"v1"'));
      const archive = () => call(path + '/archive', command('"v2"', randomUUID(), { reason: 'Thử tranh chấp' }));
      const order = publishFirst ? [publish, archive] : [archive, publish];
      const pending = [];
      try {
        await database.transaction(async db => {
          await db.query('SELECT pg_advisory_xact_lock(73002)');
          for (const operation of order) {
            pending.push(operation().then(result => result, error => error));
            await waitForQueue(pending.length);
          }
        });
        const results = await Promise.all(pending);
        assert.deepEqual(results.map(row => row.status), publishFirst ? [200, 409] : [200, 422]);
        const response = await pub(slug);
        assert.equal(response.status, publishFirst ? 200 : 404);
        const latest = await apiCall(path, {}, 200, 'CmsContentView');
        assert.equal(latest.body.status, publishFirst ? 'PUBLISHED' : 'ARCHIVED');
        if (publishFirst) {
          const pin = await database.query('SELECT support_version FROM revision_equipment WHERE exercise_id=$1 AND support_version IS NOT NULL', [id]);
          assert.deepEqual(pin.rows, [{ support_version: 1 }]);
        }
      } finally { await Promise.all(pending); }
    }
  });

  const revisions = (type, id) => '/revisions/' + type + '/' + id;
  await t.test('revision history is private, bounded, immutable and includes bootstrap without a fabricated actor', async () => {
    const path = revisions('exercise', 'bodyweight_squat');
    await apiCall(path, { auth: assertion(user, 'USER') }, 403);
    assert.equal((await fetch(publicOrigin + '/api/v1/admin' + path)).status, 404);
    const detail = await apiCall(path + '/1', {}, 200, 'CmsRevision');
    assert.equal(detail.body.actorUserId, null);
    assert.equal(detail.body.action, 'CREATE');
    assert.equal(detail.body.data.id, 'bodyweight_squat');
    assert.equal(detail.body.data.publishedRevision, undefined);
    await apiCall(path + '/2147483648', {}, 400);
    await apiCall(path + '/10', {}, 404);
    await apiCall(revisions('exercise', 'does_not_exist'), {}, 404);
    await apiCall(path + '?limit=101', {}, 400);
    const archived = revisions('exercise', 'cms_trial');
    const head = await apiCall(archived + '?limit=1', {}, 200, 'CmsRevisionPage');
    assert.equal(head.body.items[0].version, 7);
    assert.equal(head.body.items[0].action, 'PUBLISH');
    assert.equal(head.body.items[0].data.sourceRef, draft.sourceRef);
    const cursor = head.body.nextCursor;
    assert.ok(cursor);
    const next = await apiCall(archived + '?limit=1&cursor=' + cursor, {}, 200, 'CmsRevisionPage');
    assert.equal(next.body.items[0].version, 6);
    await apiCall(path + '?limit=1&cursor=' + cursor, {}, 400);
    await assert.rejects(database.query("UPDATE exercise_revisions SET author=NULL WHERE exercise_id='cms_trial'"), /append-only/);
    await assert.rejects(database.query("DELETE FROM exercise_revisions WHERE exercise_id='cms_trial' AND version=1"), /append-only/);
  });

  await t.test('restoring an older exercise revision leaves the public slug and outbox unchanged until publish', async () => {
    const id = 'cms_history', oldSlug = 'history-first', newSlug = 'history-latest';
    const resource = base + '/' + id, path = revisions('exercise', id), restore = path + '/restore';
    const old = { ...draft, id, slug: oldSlug, summary: 'Nội dung gốc', sourceRef: 'Nguồn gốc có audit' };
    await apiCall(base, command(null, randomUUID(), old), 201);
    await apiCall(resource + '/publish', command('"v1"'), 200);
    await apiCall(resource, update('"v2"', { slug: newSlug, summary: 'Bản đang công bố', sourceRef: 'Nguồn mới' }), 200);
    await apiCall(resource + '/publish', command('"v3"'), 200);
    const head = async () => (await database.query('SELECT max(aggregate_version) AS head,(SELECT count(*)::int FROM outbox_events) AS events FROM publication_revisions')).rows[0];
    const before = await head();
    await apiCall(restore, command(null, randomUUID(), { version: 2, reason: 'Chọn bản cũ' }), 428);
    await apiCall(restore, command('"v4"', randomUUID(), { version: 2, reason: '  ' }), 422);
    await apiCall(restore, command('"v4"', randomUUID(), { version: 1000, reason: 'Không tồn tại' }), 404);
    const selection = { version: 2, reason: 'Khôi phục hướng dẫn đã kiểm tra' };
    const options = command('"v4"', randomUUID(), selection);
    const competing = command('"v4"', randomUUID(), selection);
    const results = await Promise.all([call(restore, options), call(restore, competing)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 412]);
    const successful = results.findIndex(result => result.status === 200);
    const restored = results[successful], replay = [options, competing][successful];
    contract('CmsRevision', restored.body);
    assert.equal(restored.headers.etag, '"v5"');
    assert.equal(restored.body.action, 'RESTORE_REVISION');
    assert.equal(restored.body.sourceVersion, 2);
    assert.equal(restored.body.reason, selection.reason);
    assert.equal(restored.body.data.sourceRef, old.sourceRef);
    assert.equal(restored.body.data.id, id);
    assert.deepEqual((await apiCall(restore, replay, 200, 'CmsRevision')).body, restored.body);
    await apiCall(restore, { ...replay, body: { ...selection, version: 1 } }, 409);
    assert.deepEqual(await head(), before);
    const editable = await apiCall(resource, {}, 200, 'ExerciseAdminDetail');
    assert.equal(editable.body.status, 'PUBLISHED');
    assert.equal(editable.body.publishedVersion, 4);
    assert.equal(editable.body.draftVersion, 5);
    assert.equal((await (await pub(newSlug)).json()).summary, 'Bản đang công bố');
    assert.equal((await pub(oldSlug)).status, 308);
    const audit = await apiCall('/catalog-audit?contentType=exercise&contentId=' + id, {}, 200, 'CatalogAuditEntryPage');
    assert.equal(audit.body.items[0].sourceVersion, 2);
    assert.equal(audit.body.items[0].reason, selection.reason);
    assert.equal(audit.body.items.filter(row => row.action === 'RESTORE_REVISION').length, 1);
    await apiCall(resource + '/publish', command('"v5"'), 200);
    assert.equal((await (await pub(oldSlug)).json()).summary, old.summary);
    await apiCall(resource + '/unpublish', command('"v6"', randomUUID(), { reason: 'Tạm ẩn' }), 200);
    const archivedHead = await head();
    const resurrect = command('"v7"');
    const activeDraft = await apiCall(resource + '/restore', resurrect, 200, 'ExerciseAdminDetail');
    assert.equal(activeDraft.body.status, 'DRAFT');
    assert.equal(activeDraft.body.id, id);
    assert.equal(activeDraft.body.draftVersion, 8);
    assert.equal(activeDraft.body.publishedVersion, undefined);
    assert.deepEqual((await apiCall(resource + '/restore', resurrect, 200)).body, activeDraft.body);
    assert.equal((await pub(oldSlug)).status, 404);
    assert.equal((await pub(newSlug)).status, 404);
    assert.deepEqual(await head(), archivedHead);
    await apiCall(resource + '/publish', command('"v8"'), 200);
    assert.equal((await pub(oldSlug)).status, 200);
    assert.equal((await pub(newSlug)).status, 308);
  });

  await t.test('archiving and restoring a draft exercise never creates a publication or reserves its slug', async () => {
    const id = 'cms_never_public', slug = 'never-public', resource = base + '/' + id;
    await apiCall(base, command(null, randomUUID(), { ...draft, id, slug }), 201);
    await apiCall(resource + '/restore', command('"v1"'), 409);
    await apiCall(resource + '/unpublish', command('"v1"', randomUUID(), { reason: 'Ẩn bản chưa công bố' }), 200, 'ExerciseAdminDetail');
    await apiCall(resource + '/restore', command('"v2"'), 200, 'ExerciseAdminDetail');
    assert.equal((await pub(slug)).status, 404);
    const related = await database.query('SELECT revision FROM publication_revisions WHERE exercise_id=$1', [id]);
    assert.equal(related.rows.length, 0);
    assert.equal((await database.query('SELECT slug FROM slug_history WHERE exercise_id=$1', [id])).rows.length, 0);
  });

  await t.test('support history uses typed snapshots and restores privately with fresh media approval', async () => {
    for (const [type, id] of [['equipment', 'bodyweight'], ['muscle-group', 'cms_test_group'], ['exercise-variant', 'cms_variant'], ['media', 'cms_media']]) {
      const path = revisions(type, id);
      const history = await apiCall(path, {}, 200, 'CmsRevisionPage');
      assert.ok(history.body.items.length > 0);
      assert.ok(history.body.items.every(item => item.data.id === id && item.data.contentType === type));
      const detail = await apiCall(path + '/1', {}, 200, 'CmsRevision');
      assert.equal(detail.body.data.contentType, type);
      if (type === 'equipment') assert.equal(detail.body.actorUserId, null);
    }
    const variant = revisions('exercise-variant', 'cms_variant');
    const selected = await apiCall(variant + '/restore', command('"v4"', randomUUID(), { version: 1, reason: 'Chỉnh lại biến thể' }), 200, 'CmsRevision');
    assert.equal(selected.headers.etag, '"v5"');
    assert.equal(selected.body.data.data.nameVi, 'Biến thể đầu');
    assert.equal((await (await pub('variant-parent')).json()).variants[0].nameVi, 'Biến thể sau');
    const exerciseVersion = await apiCall(revisions('exercise', 'cms_variant_parent') + '/2', {}, 200, 'CmsRevision');
    assert.deepEqual(exerciseVersion.body.data.variantIds, ['cms_variant']);
    const media = revisions('media', 'cms_media');
    const selectedMedia = await apiCall(media + '/restore', command('"v5"', randomUUID(), { version: 2, reason: 'Soát lại quyền sử dụng' }), 200, 'CmsRevision');
    assert.equal(selectedMedia.body.data.data.rightsStatus, 'PENDING');
    assert.equal((await apiCall(media + '/2', {}, 200, 'CmsRevision')).body.data.data.rightsStatus, 'APPROVED');
    assert.equal(JSON.stringify(selectedMedia.body).includes('fixtures/private'), false);
    assert.equal((await apiCall(support('media', 'cms_media') + '/publish', command('"v6"'), 422)).body.code, 'MEDIA_NOT_APPROVED');
  });

  await t.test('CMS import validates real KB text, persists a report and applies once to drafts only', async () => {
    const beforeHead = await importHead(), before = (await database.query('SELECT count(*)::int AS n FROM exercise_revisions')).rows[0].n;
    const records = snapshot.exercises.map(({ media, variants, publishedRevision, ...data }) => ({ contentType: 'exercise', data }));
    const registered = await registerPackage(records);
    await apiCall('/catalog-imports', { ...command(null, randomUUID(), registered.request), auth: assertion(user, 'USER') }, 403);
    await apiCall('/catalog-imports', command(null, randomUUID(), { ...registered.request, path: '/private' }), 422);
    const created = await apiCall('/catalog-imports', command(null, randomUUID(), registered.request), 202, 'CmsImportJob');
    assert.equal(created.body.status, 'READY'); assert.equal(created.body.acceptedCount, 35);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM exercise_revisions')).rows[0].n, before);
    assert.deepEqual(await importHead(), beforeHead);
    const jobPath = '/catalog-imports/' + created.body.id;
    const job = await apiCall(jobPath, {}, 200, 'CmsImportJob');
    assert.equal(job.headers.etag, '"v1"');
    await apiCall(jobPath + '/apply', command(null, randomUUID(), { mode: 'DRAFT_ONLY' }), 428);
    await apiCall(jobPath + '/apply', command('"v2"', randomUUID(), { mode: 'DRAFT_ONLY' }), 412);
    await apiCall(jobPath + '/apply', command('"v1"', randomUUID(), { mode: 'PUBLISH' }), 422);
    // Package bytes may disappear/change after validation: apply uses the stored verified payload.
    await writeFile(registered.file, '{"tampered":true}');
    const opts = command(job.headers.etag, randomUUID(), { mode: 'DRAFT_ONLY' });
    const responses = await Promise.all([call(jobPath + '/apply', opts), call(jobPath + '/apply', opts)]);
    for (const response of responses) { assert.equal(response.status, 202, JSON.stringify(response.body)); assert.equal(response.body.status, 'APPLIED'); }
    assert.deepEqual(responses[0].body, responses[1].body);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM exercise_revisions')).rows[0].n, before + 35);
    assert.deepEqual(await importHead(), beforeHead);
    const replay = await apiCall('/catalog-imports', command(null, randomUUID(), registered.request), 202);
    assert.equal(replay.body.id, created.body.id); assert.equal(replay.body.status, 'APPLIED');
    await apiCall(jobPath + '/apply', command('"v1"', randomUUID(), { mode: 'DRAFT_ONLY' }), 202);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM exercise_revisions')).rows[0].n, before + 35);
  });

  await t.test('a five-type import is ordered by dependencies and apply failure rolls back every draft and receipt', async () => {
    const media = (await apiCall('/content/media/cms_media', {}, 200)).body;
    const exercise = { ...draft, id: 'import_bundle_ex', slug: 'import-bundle-ex', primaryMuscleIds: ['import_bundle_group'],
      equipmentIds: ['import_bundle_eq'], variantIds: ['import_bundle_variant'], mediaIds: ['cms_media'] };
    const records = [
      { id: 'import_bundle_variant', contentType: 'exercise-variant', data: { exerciseId: exercise.id, nameVi: 'Biến thể nhập' } },
      { contentType: 'exercise', data: exercise },
      { id: 'cms_media', contentType: 'media', data: media.data },
      { id: 'import_bundle_eq', contentType: 'equipment', data: { nameVi: 'Dụng cụ nhập', slug: 'import-bundle-eq' } },
      { id: 'import_bundle_group', contentType: 'muscle-group', data: { nameVi: 'Nhóm cơ nhập', slug: 'import-bundle-group', sortOrder: 1 } },
    ];
    const pkg = await registerPackage(records);
    const job = await apiCall('/catalog-imports', command(null, randomUUID(), pkg.request), 202);
    assert.equal(job.body.status, 'READY', JSON.stringify(job.body));
    const path = '/catalog-imports/' + job.body.id + '/apply', opts = command('"v1"', randomUUID(), { mode: 'DRAFT_ONLY' });
    await database.query(`CREATE FUNCTION import_apply_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.exercise_id='import_bundle_ex' THEN RAISE EXCEPTION 'Injected apply outage'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER import_apply_fault BEFORE INSERT ON exercise_revisions FOR EACH ROW EXECUTE FUNCTION import_apply_fault()`);
    try { await apiCall(path, opts, 503); }
    finally { await database.query('DROP TRIGGER import_apply_fault ON exercise_revisions; DROP FUNCTION import_apply_fault()'); }
    assert.equal((await database.query("SELECT id FROM muscle_groups WHERE id='import_bundle_group'")).rows.length, 0);
    assert.equal((await database.query("SELECT id FROM equipment WHERE id='import_bundle_eq'")).rows.length, 0);
    assert.equal((await apiCall('/content/media/cms_media', {}, 200)).headers.etag, '"v' + media.editVersion + '"');
    assert.equal((await apiCall('/catalog-imports/' + job.body.id, {}, 200)).body.status, 'READY');
    await apiCall(path, opts, 202, 'CmsImportJob');
    assert.equal((await apiCall('/exercises/' + exercise.id, {}, 200)).body.status, 'DRAFT');
    assert.equal((await pub(exercise.slug)).status, 404);
    const history = await apiCall('/catalog-audit?contentType=import&contentId=' + job.body.id, {}, 200, 'CatalogAuditEntryPage');
    assert.deepEqual(history.body.items.map(e => e.action).sort(), ['APPLY_IMPORT', 'VALIDATE_IMPORT']);
  });

  await t.test('invalid imports, hashes, path traversal and stale base versions never overwrite edits', async () => {
    const first = { ...draft, id: 'import_new_one', slug: 'import-new-one' };
    const bad = await registerPackage([{ contentType: 'exercise', data: first },
      { contentType: 'exercise', data: { ...draft, id: 'import_bad_one', primaryMuscleIds: ['missing_group'] } }]);
    const report = await apiCall('/catalog-imports', command(null, randomUUID(), bad.request), 202, 'CmsImportJob');
    assert.equal(report.body.status, 'REJECTED'); assert.equal(report.body.errorCount, 1);
    assert.equal((await database.query('SELECT id FROM exercises WHERE id=$1', [first.id])).rows.length, 0);
    await apiCall('/catalog-imports/' + report.body.id + '/apply', command('"v1"', randomUUID(), { mode: 'DRAFT_ONLY' }), 409);
    const changed = await registerPackage([{ contentType: 'exercise', data: first }]);
    await writeFile(changed.file, '{}');
    await apiCall('/catalog-imports', command(null, randomUUID(), changed.request), 422);
    const unknown = { ...changed.request, sourceRevision: 'not-registered' };
    await apiCall('/catalog-imports', command(null, randomUUID(), unknown), 404);
    const escaped = await registerPackage([{ contentType: 'exercise', data: first }]);
    registry.at(-1).file = '../outside.json'; await writeFile(registryFile, JSON.stringify(registry));
    await apiCall('/catalog-imports', command(null, randomUUID(), escaped.request), 503);
    const original = await apiCall('/exercises/bodyweight_squat', {}, 200);
    // Use only fields accepted by ExerciseDraftCreate.
    const { media, variants, publishedRevision, ...data } = snapshot.exercises.find(e => e.id === 'bodyweight_squat');
    const pkg = await registerPackage([{ contentType: 'exercise', data: { ...data, summary: 'Nhập từ KB' } }, { contentType: 'exercise', data: first }]);
    const job = await apiCall('/catalog-imports', command(null, randomUUID(), pkg.request), 202);
    assert.equal(job.body.status, 'READY');
    await apiCall('/exercises/bodyweight_squat', update(original.headers.etag, { summary: 'Người biên tập đã sửa' }), 200);
    await apiCall('/catalog-imports/' + job.body.id + '/apply', command('"v1"', randomUUID(), { mode: 'DRAFT_ONLY' }), 409);
    assert.equal((await apiCall('/exercises/bodyweight_squat', {}, 200)).body.summary, 'Người biên tập đã sửa');
    assert.equal((await database.query('SELECT id FROM exercises WHERE id=$1', [first.id])).rows.length, 0);
  });

  await t.test('CMS export is deterministic, private, checksummed and rejects withdrawn or unretained revisions', async () => {
    const current = await importHead();
    const revision = typeof current === 'string' ? current : current.revision;
    const exported = await apiCall('/catalog-exports/' + revision, {}, 200, 'CmsExport');
    assert.equal(exported.body.sha256, fingerprint(exported.body.publication));
    assert.deepEqual((await apiCall('/catalog-exports/' + revision, {}, 200)).body, exported.body);
    assert.equal(exported.body.publication.sources.length, exported.body.publication.exercises.length);
    assert.ok(exported.body.publication.sources.every(s => s.publicationStatus === 'PUBLISHED'));
    assert.equal(JSON.stringify(exported.body).includes('Người biên tập đã sửa'), false);
    await apiCall('/catalog-exports/unknown', {}, 404);
    const old = (await database.query('SELECT revision FROM publication_revisions ORDER BY aggregate_version LIMIT 1')).rows[0].revision;
    if (old !== revision) await apiCall('/catalog-exports/' + old, {}, 410);
    await assert.rejects(database.query('UPDATE catalog_exports SET sha256=$2 WHERE revision=$1', [revision, '0'.repeat(64)]), /append-only/);
    if (old !== revision) {
      const expired = { ...exported.body.publication, revision: old };
      await database.query(`INSERT INTO catalog_exports(revision,publication,sha256,expires_at) VALUES($1,$2,$3,now()-interval '1 second')`,
        [old, JSON.stringify(expired), fingerprint(expired)]);
      assert.equal((await apiCall('/catalog-exports/' + old, {}, 410)).body.code, 'EXPORT_EXPIRED');
    }
    const active = await apiCall('/exercises/bodyweight_squat', {}, 200);
    await apiCall('/exercises/bodyweight_squat/unpublish', command(active.headers.etag, randomUUID(), { reason: 'Thu hồi nguồn export test' }), 200);
    await apiCall('/catalog-exports/' + revision, {}, 410);
    const archived = await apiCall('/exercises/bodyweight_squat', {}, 200);
    const restored = await apiCall('/exercises/bodyweight_squat/restore', command(archived.headers.etag), 200);
    await apiCall('/exercises/bodyweight_squat/publish', command(restored.headers.etag), 200);
  });

  await t.test('every CMS family rejects USER before reads or writes, and combined audit filters stay scoped', async () => {
    const types = ['muscle-group', 'equipment', 'exercise-variant', 'media'];
    const routes = [
      ['GET', '/exercises/bodyweight_squat'], ['PATCH', '/exercises/bodyweight_squat'],
      ...types.flatMap(type => [['GET', '/content/' + type], ['POST', '/content/' + type], ['POST', '/content/' + type + '/test/archive']]),
      ['GET', '/revisions/exercise/bodyweight_squat'], ['POST', '/revisions/exercise/bodyweight_squat/restore'],
      ['POST', '/media-uploads'], ['GET', '/media-uploads/test/preview'], ['POST', '/media-uploads/test/complete'],
      ['POST', '/catalog-imports'], ['POST', '/catalog-imports/test/apply'], ['GET', '/catalog-exports/test'], ['GET', '/catalog-audit'],
    ];
    const effects = async () => (await database.query(`SELECT (SELECT count(*) FROM catalog_audit) AS audit,
      (SELECT count(*) FROM exercise_revisions) AS exercises, (SELECT count(*) FROM support_revisions) AS support,
      (SELECT count(*) FROM catalog_import_jobs) AS imports, (SELECT count(*) FROM outbox_events) AS outbox`)).rows[0];
    const before = await effects();
    for (const [method, path] of routes) {
      const denied = await apiCall(path, { method, auth: assertion(user, 'USER'), headers: { 'x-user-role': 'ADMIN' } }, 403);
      assert.equal(denied.body.code, 'ADMIN_REQUIRED', path);
    }
    assert.deepEqual(await effects(), before);
    for (const type of ['exercise', ...types, 'import']) {
      const sample = (await database.query(`SELECT actor_id,content_id FROM catalog_audit WHERE content_type=$1 ORDER BY sequence DESC LIMIT 1`, [type])).rows[0];
      assert.ok(sample, type);
      const filter = new URLSearchParams({ contentType: type, contentId: sample.content_id, actorUserId: sample.actor_id, limit: '1' });
      const page = (await apiCall('/catalog-audit?' + filter, {}, 200, 'CatalogAuditEntryPage')).body;
      assert.equal(page.items.length, 1);
      const [entry] = page.items;
      assert.equal(entry.contentId, sample.content_id);
      assert.equal(entry.contentType, type);
      assert.equal(entry.actorUserId, sample.actor_id);
      assert.equal(entry.sequence, undefined);
      assert.equal(entry.document, undefined);
      if (page.nextCursor) {
        filter.set('cursor', page.nextCursor);
        filter.set('actorUserId', randomUUID());
        assert.equal((await apiCall('/catalog-audit?' + filter, {}, 400)).body.code, 'INVALID_CURSOR');
      }
    }
    await assert.rejects(database.query('DELETE FROM catalog_audit WHERE false'), /append-only/);
    await assert.rejects(database.query('TRUNCATE catalog_audit'), /append-only/);
    assert.deepEqual(await effects(), before);
  });

  await t.test('Identity outage denies admin requests while public Catalog remains readable', async () => {
    await closeIdentity();
    await apiCall(base, {}, 503);
    assert.equal((await pub('squat-khong-ta')).status, 200);
    assert.equal((await fetch(publicOrigin + '/health/ready')).status, 200);
  });
});
