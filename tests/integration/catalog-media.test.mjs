import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createRequire } from 'node:module';
import { startPostgres, freePort } from '../helpers/postgres.mjs';
import { startMediaTools } from '../helpers/media-stack.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { createTestTls } from '../../backend/apps/identity/test/tls.cjs';
import { createApp as createIdentity } from '../../backend/apps/identity/dist/app.js';
import { IdentityKeys } from '../../backend/apps/identity/dist/modules/accounts/crypto.js';
import { connectDatabase } from '../../backend/apps/catalog/dist/database.js';
import { migrate } from '../../backend/apps/catalog/dist/migrate.js';
import { importSnapshot } from '../../backend/apps/catalog/dist/import.js';
import { createApp } from '../../backend/apps/catalog/dist/app.js';
import { createAdminApp } from '../../backend/apps/catalog/dist/admin-app.js';
import { S3MediaStorage } from '../../backend/apps/catalog/dist/modules/media/media-storage.js';
import { createMediaInspector } from '../../backend/apps/catalog/dist/modules/media/media-inspector.js';
import { MediaJobs } from '../../backend/apps/catalog/dist/modules/media/media-jobs.js';

const require = createRequire(new URL('../../backend/apps/catalog/package.json', import.meta.url));
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const hash = body => createHash('sha256').update(body).digest('hex');
const uploadPath = id => '/media-uploads/' + id;

test('Catalog private S3 media, real decoder and ClamAV', { timeout: 180000 }, async t => {
  const cleanup = [];
  t.after(async () => {
    const errors = [];
    for (const close of cleanup.reverse()) try { await close(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Catalog media cleanup failed');
  });
  const tools = await startMediaTools(); cleanup.push(tools.stop);
  const pg = await startPostgres(); cleanup.push(pg.stop); t.diagnostic(pg.version);
  const db = connectDatabase(pg.connectionString); cleanup.push(() => db.close());
  await migrate(db);
  await importSnapshot(db, JSON.parse(await readFile('backend/apps/catalog/data/smartgym-m2.json', 'utf8')), true);
  const tls = await createTestTls(); cleanup.push(tls.stop);
  const actor = randomUUID(), other = randomUUID();
  const keys = new IdentityKeys(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
    'media-test', 'https://identity.test', randomBytes(32), randomBytes(32));
  const unused = { query: async () => { throw new Error('JWKS must not query Catalog'); }, transaction: async () => { throw new Error(); }, close: async () => {} };
  const { app: identity } = await createIdentity(unused, { keys, webOrigin: 'https://web.test', callers: tls.callers, tls: { ...tls.clients.server, ca: tls.ca } });
  cleanup.push(() => identity.close()); await identity.listen(0, '127.0.0.1');
  const storage = new S3MediaStorage(tools.client, tools.bucket);
  const publicPort = await freePort(), origin = 'http://127.0.0.1:' + publicPort;
  const app = await createApp(db, storage); cleanup.push(() => app.close()); await app.listen(publicPort, '127.0.0.1');
  const admin = await createAdminApp(db, { tls: { ...tls.clients.server, ca: tls.ca }, bffFingerprints: tls.callers.bff,
    identity: { ...tls.clients.catalog, ca: tls.ca, origin: 'https://127.0.0.1:' + identity.getHttpServer().address().port, issuer: 'https://identity.test' } },
  { storage, prefix: 'tests/media', publicOrigin: origin, close() {} });
  cleanup.push(() => admin.close()); await admin.listen(0, '127.0.0.1');
  const port = admin.getHttpServer().address().port;
  const spec = JSON.parse(await readFile('docs/api/openapi.yaml', 'utf8'));
  const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
  ajv.addSchema({ $id: 'media-contract', components: spec.components });
  const check = (schema, value) => {
    const validate = ajv.getSchema('media-contract#/components/schemas/' + schema);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  };
  async function api(path, { method = 'GET', body, match, key, user = actor, role = 'ADMIN' } = {}, expected = 200, schema) {
    const token = keys.assertion(user, role, new Date(), new Date(Date.now() + 300000)).accessToken;
    const response = await new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: '/api/v1/admin' + path, ...tls.clients.bff, ca: tls.ca,
        method, agent: false, signal: AbortSignal.timeout(7000), headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json',
          ...(match ? { 'if-match': match } : {}), ...(key ? { 'idempotency-key': key } : {}) } }, res => {
        let data = ''; res.setEncoding('utf8'); res.on('data', chunk => { data += chunk; });
        res.on('error', reject); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null }));
      }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
    assert.equal(response.status, expected, JSON.stringify(response.body));
    assert.equal(response.headers['cache-control'], 'no-store');
    if (schema || expected >= 400) check(schema ?? 'Problem', response.body);
    return response;
  }
  const post = (body, match) => ({ method: 'POST', body, match, key: randomUUID() });
  const inspector = createMediaInspector(tools.ffprobe, tools.ffmpeg, tools.scanner);
  const jobs = new MediaJobs(db, storage, inspector), signal = new AbortController().signal;
  const reserve = async (body = tools.png, mime = 'image/png', extra = {}) =>
    (await api('/media-uploads', { ...post({ mime, sizeBytes: body.length, sha256: hash(body) }), ...extra }, 201, 'CmsMediaGrant')).body;
  async function put(grant, bytes, expected = 200) {
    const response = await fetch(grant.putUrl, { method: 'PUT', headers: grant.requiredHeaders, body: bytes, signal: AbortSignal.timeout(10000) });
    const result = await response.text();
    assert.equal(response.status, expected, result);
  }
  const state = async id => (await api(uploadPath(id), {}, 200, 'CmsMediaUploadState')).body;
  async function verified(bytes = tools.png, mime = 'image/png') {
    const grant = await reserve(bytes, mime);
    await put(grant, bytes);
    await api(uploadPath(grant.uploadId) + '/complete', post(), 202, 'CmsMediaUploadState');
    await jobs.verifyNext(signal);
    assert.equal((await state(grant.uploadId)).status, 'READY');
    return grant;
  }

  let image, video;
  await t.test('private PUT signs MIME, checksum, bytes and conditional create, with owner and idempotency checks', async () => {
    await api('/media-uploads', { ...post({ mime: 'text/html', sizeBytes: 10, sha256: 'a'.repeat(64) }) }, 415);
    await api('/media-uploads', post({ mime: 'image/png', sizeBytes: 10 * 1024 * 1024 + 1, sha256: 'a'.repeat(64) }), 413);
    await api('/media-uploads', { ...post({ mime: 'image/png', sizeBytes: 132, sha256: hash(tools.png) }), role: 'USER' }, 403);
    const options = post({ mime: 'image/png', sizeBytes: tools.png.length, sha256: hash(tools.png) });
    const grant = (await api('/media-uploads', options, 201, 'CmsMediaGrant')).body;
    assert.equal((await api('/media-uploads', options, 201)).body.uploadId, grant.uploadId);
    const receipt = await db.query("SELECT response FROM idempotency_keys WHERE operation='media:reserve' AND key=$1", [options.key]);
    assert.equal(JSON.stringify(receipt.rows).includes('X-Amz-'), false);
    const invalid = { ...grant, requiredHeaders: { ...grant.requiredHeaders, 'content-type': 'video/mp4' } };
    await put(invalid, tools.png, 403);
    await put(grant, tools.png);
    await put(grant, tools.png, 412);
    const key = new URL(grant.putUrl).pathname;
    assert.equal((await fetch(tools.endpoint + key)).status, 403);
    await api(uploadPath(grant.uploadId), { user: other }, 404);
    await api(uploadPath(grant.uploadId) + '/preview', {}, 422);
    const command = post();
    const pending = await api(uploadPath(grant.uploadId) + '/complete', command, 202, 'CmsMediaUploadState');
    assert.equal(pending.body.status, 'VERIFYING');
    assert.deepEqual((await api(uploadPath(grant.uploadId) + '/complete', command, 202)).body, pending.body);
    await jobs.verifyNext(signal);
    assert.equal((await state(grant.uploadId)).status, 'READY');
    const preview = (await api(uploadPath(grant.uploadId) + '/preview', {}, 200, 'CmsMediaPreview')).body;
    assert.ok(new URL(preview.url).searchParams.has('versionId'));
    const file = await fetch(preview.url);
    assert.equal(file.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), tools.png);
    image = grant;
  });

  await t.test('real ClamAV and full FFmpeg decode reject forged media, hash mismatch and a test malware signature', async () => {
    const scenarios = [
      { bytes: Buffer.from('not a PNG file'), code: 'MEDIA_SIGNATURE_MISMATCH' },
      { bytes: Buffer.concat([tools.png, Buffer.from(tools.virus)]), code: 'MEDIA_MALWARE_DETECTED' },
      { bytes: tools.png.subarray(0, 30), code: 'MEDIA_DIMENSIONS_OR_DURATION' },
    ];
    for (const scenario of scenarios) {
      const grant = await reserve(scenario.bytes);
      await put(grant, scenario.bytes);
      await api(uploadPath(grant.uploadId) + '/complete', post(), 202);
      await jobs.verifyNext(signal);
      const result = await state(grant.uploadId);
      assert.equal(result.status, 'REJECTED'); assert.equal(result.errorCode, scenario.code);
    }
    const grant = await reserve();
    const upload = (await db.query('SELECT object_key FROM media_uploads WHERE id=$1', [grant.uploadId])).rows[0];
    const changed = Buffer.concat([tools.png.subarray(0, -1), Buffer.from([0])]);
    await tools.client.send(new PutObjectCommand({ Bucket: tools.bucket, Key: upload.object_key, Body: changed, ContentType: 'image/png' }));
    await api(uploadPath(grant.uploadId) + '/complete', post(), 202);
    await jobs.verifyNext(signal);
    assert.equal((await state(grant.uploadId)).errorCode, 'MEDIA_CHECKSUM_MISMATCH');
    video = await verified(tools.video, 'video/mp4');
  });

  await t.test('JPEG, WebP and WebM decode successfully while video beyond 120 seconds is rejected', async () => {
    for (const fixture of tools.extra.slice(0, 3)) await verified(fixture.bytes, fixture.mime);
    const long = tools.extra[3], grant = await reserve(long.bytes, long.mime);
    await put(grant, long.bytes);
    await api(uploadPath(grant.uploadId) + '/complete', post(), 202);
    await jobs.verifyNext(signal);
    assert.equal((await state(grant.uploadId)).errorCode, 'MEDIA_DIMENSIONS_OR_DURATION');
  });

  await t.test('scanner outage keeps a job private, two workers claim once and stale worker cannot finalize', async () => {
    const grant = await reserve(); await put(grant, tools.png);
    await api(uploadPath(grant.uploadId) + '/complete', post(), 202);
    const unavailable = new MediaJobs(db, storage, async () => { throw new Error('Test-only scanner outage'); });
    await unavailable.verifyNext(signal);
    assert.equal((await state(grant.uploadId)).status, 'VERIFYING');
    await db.query('UPDATE media_uploads SET verify_after=now() WHERE id=$1', [grant.uploadId]);
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    const slow = new MediaJobs(db, storage, async () => { entered.resolve(); await release.promise; return { width: 999, height: 999, durationMs: null }; });
    const oldWorker = slow.verifyNext(signal);
    try {
      await entered.promise;
      assert.equal(await jobs.verifyNext(signal), false);
      await db.query("UPDATE media_uploads SET lease_until=now()-interval '1 second' WHERE id=$1", [grant.uploadId]);
      assert.equal(await jobs.verifyNext(signal), true);
    } finally { release.resolve(); await oldWorker; }
    const row = (await db.query('SELECT width,height,status FROM media_uploads WHERE id=$1', [grant.uploadId])).rows[0];
    assert.deepEqual(row, { width: 32, height: 32, status: 'READY' });
  });

  await t.test('published exercises pin verified media, support byte ranges and stop delivery after rights rejection', async () => {
    const id = 'media_fixture', path = '/content/media/' + id;
    const data = { kind: 'IMAGE', uploadId: image.uploadId, sourceUri: 'https://smartgym.test/original',
      credit: 'Generated test image', licenseRef: 'SmartGym test', altText: 'Ảnh tập thử', rightsStatus: 'PENDING' };
    await api('/content/media', post({ id, contentType: 'media', data }), 201, 'CmsContentView');
    await api(uploadPath(image.uploadId) + '/preview', { user: other }, 404);
    await api(path + '/publish', post(undefined, '"v1"'), 422);
    const patch = (match, data) => ({ method: 'PATCH', match, body: { contentType: 'media', data } });
    await api(path, patch('"v1"', { rightsStatus: 'APPROVED' }), 200);
    await api(path + '/publish', post(undefined, '"v2"'), 200);
    await api(uploadPath(image.uploadId) + '/preview', { user: other }, 200, 'CmsMediaPreview');
    await api(uploadPath(image.uploadId) + '/preview', { user: other, role: 'USER' }, 403);
    const exercise = { id: 'media_exercise', slug: 'media-exercise', nameVi: 'Bài có media', summary: 'Thử tích hợp',
      primaryMuscleIds: ['quadriceps'], equipmentIds: [], instructions: ['Đứng vững.'], mediaIds: [id],
      workoutType: 'STRENGTH', focusArea: 'LOWER_BODY', difficulty: 2, imageRoles: { main: id },
      profile: { mechanic: 'compound', isBodyweight: true, met: 4.5, tips: ['Giữ lưng thẳng.'],
        translations: { de: { name: 'Kniebeuge', instructions: ['Aufrecht stehen.'] } } } };
    await api('/exercises', post({ ...exercise, imageRoles: { peak: id } }), 422);
    await api('/exercises', post(exercise), 201);
    await api('/exercises/' + exercise.id + '/publish', post(undefined, '"v1"'), 200);
    const read = async () => (await (await fetch(origin + '/api/v1/exercises/media-exercise')).json());
    const original = await read(); check('ExerciseDetail', original);
    assert.deepEqual(original.profile, exercise.profile);
    assert.equal(original.media[0].role, 'main');
    assert.equal(original.imageRoles, undefined);
    const publicUrl = original.media[0].url;
    const file = await fetch(publicUrl);
    assert.equal(file.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), tools.png);
    const range = await fetch(publicUrl, { headers: { Range: 'bytes=0-7' } });
    assert.equal(range.status, 206); assert.equal(range.headers.get('content-range'), 'bytes 0-7/' + tools.png.length);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), tools.png.subarray(0, 8));
    assert.equal((await fetch(publicUrl, { headers: { Range: 'bytes=999999-' } })).status, 416);
    await api(path + '/archive', post({ reason: 'Đang có bài dùng' }, '"v3"'), 409);
    await api(path, patch('"v3"', { kind: 'VIDEO', uploadId: video.uploadId, altText: 'Video thử', rightsStatus: 'PENDING' }), 200);
    await api(path, patch('"v4"', { rightsStatus: 'APPROVED' }), 200);
    await api(path + '/publish', post(undefined, '"v5"'), 200);
    assert.equal((await read()).media[0].url, publicUrl);
    assert.equal((await fetch(publicUrl)).status, 200);
    await api('/exercises/' + exercise.id, { method: 'PATCH', match: '"v2"', body: { summary: 'Gắn video mới' } });
    await api('/exercises/' + exercise.id + '/publish', post(undefined, '"v3"'), 422);
    await api('/exercises/' + exercise.id, { method: 'PATCH', match: '"v3"', body: { imageRoles: {} } });
    await api('/exercises/' + exercise.id + '/publish', post(undefined, '"v4"'), 200);
    const current = await read(); check('ExerciseDetail', current);
    assert.notEqual(current.media[0].url, publicUrl);
    assert.equal((await fetch(publicUrl)).status, 404);
    assert.deepEqual(Buffer.from(await (await fetch(current.media[0].url)).arrayBuffer()), tools.video);
    const exportRevision = (await db.query('SELECT revision FROM publication_revisions ORDER BY aggregate_version DESC LIMIT 1')).rows[0].revision;
    await api('/catalog-exports/' + exportRevision, {}, 200, 'CmsExport');
    await api(path, patch('"v6"', { rightsStatus: 'REJECTED' }), 200);
    await api('/catalog-exports/' + exportRevision, {}, 410);
    assert.equal((await fetch(current.media[0].url)).status, 404);
    await api(uploadPath(video.uploadId) + '/preview', {}, 410);
    await api(uploadPath(video.uploadId) + '/preview', { user: other }, 404);
  });

  await t.test('expired grants cannot reopen and garbage collection retains every referenced revision', async () => {
    const grant = await reserve();
    await put(grant, tools.png);
    await db.query("UPDATE media_uploads SET expires_at=now()-interval '2 hours' WHERE id=$1", [grant.uploadId]);
    await api(uploadPath(grant.uploadId), {}, 410);
    await api(uploadPath(grant.uploadId) + '/complete', post(), 410);
    assert.equal(await jobs.collectNext(signal), true);
    const { rows } = await db.query('SELECT purged_at FROM media_uploads WHERE id=$1', [grant.uploadId]);
    assert.ok(rows[0].purged_at);
    for (const used of [image, video]) {
      await db.query("UPDATE media_uploads SET verified_at=now()-interval '40 days' WHERE id=$1", [used.uploadId]);
    }
    while (await jobs.collectNext(signal)) {}
    const retained = await db.query('SELECT purged_at FROM media_uploads WHERE id=ANY($1::text[])', [[image.uploadId, video.uploadId]]);
    assert.ok(retained.rows.every(row => row.purged_at === null));
  });

  await t.test('configured media worker runs independently and can recover a queued upload', async () => {
    const grant = await reserve(); await put(grant, tools.png);
    await api(uploadPath(grant.uploadId) + '/complete', post(), 202);
    const worker = startProcess(['dist/media-worker.js'], 'backend/apps/catalog', {
      DATABASE_URL: pg.connectionString, CATALOG_MEDIA_ENABLED: 'true', CATALOG_MEDIA_PUBLIC_ORIGIN: origin,
      CATALOG_MEDIA_S3_ENDPOINT: tools.endpoint, CATALOG_MEDIA_BUCKET: tools.bucket, CATALOG_MEDIA_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: tools.credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: tools.credentials.secretAccessKey,
      CATALOG_MEDIA_FFPROBE: tools.ffprobe, CATALOG_MEDIA_FFMPEG: tools.ffmpeg,
      CATALOG_MEDIA_CLAMD_HOST: tools.scanner.host, CATALOG_MEDIA_CLAMD_PORT: String(tools.scanner.port),
    }); cleanup.push(() => worker.stop());
    try {
      let status;
      for (let attempt = 0; attempt < 80; attempt++) {
        status = (await state(grant.uploadId)).status;
        if (status !== 'VERIFYING') break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(status, 'READY');
    } finally { await worker.stop(); }
  });
});
