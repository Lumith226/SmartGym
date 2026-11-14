const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');

test('Catalog migration, atomic import and HTTP contract over PostgreSQL', async t => {
  const { migrate } = await import('../dist/migrate.js');
  const { importSnapshot } = await import('../dist/import.js');
  const { createApp } = await import('../dist/app.js');
  const networkDatabase = process.env.CATALOG_TEST_DATABASE_URL
    ? (await import('../dist/database.js')).connectDatabase(process.env.CATALOG_TEST_DATABASE_URL)
    : null;
  const pg = networkDatabase ?? new PGlite();
  const wrap = client => ({
    query: async (sql, values) => {
      if (!values) {
        const results = await client.exec(sql);
        return results.at(-1) ?? { rows: [] };
      }
      return client.query(sql, values);
    },
  });
  let fail = false;
  const queryBatches = [];
  const database = {
    query: async (...args) => {
      if (fail) throw new Error('Private database connection details');
      const result = await pg.query(...args);
      if (Array.isArray(result.rows[0]?.documents)) queryBatches.push(result.rows[0].documents.length);
      return result;
    },
    transaction: action => networkDatabase ? networkDatabase.transaction(action) : pg.transaction(client => action(wrap(client))),
    close: () => pg.close(),
  };
  t.after(() => database.close());
  await migrate(database);
  await migrate(database);
  const snapshot = JSON.parse(await readFile(join(__dirname, '../data/smartgym-m1.json'), 'utf8'));
  const contract = JSON.parse(await readFile(join(__dirname, '../../../../docs/api/openapi.yaml'), 'utf8'));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema({ $id: 'catalog-contract', components: contract.components });
  function checkFields(value, schemaName) {
    const validate = ajv.getSchema('catalog-contract#/components/schemas/' + schemaName);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
  await assert.rejects(importSnapshot(database, snapshot), /Development content/);
  await Promise.all([
    importSnapshot(database, snapshot, true),
    importSnapshot(database, snapshot, true),
  ]);
  await importSnapshot(database, snapshot, true);
  assert.equal((await pg.query('SELECT count(*)::int AS count FROM exercises')).rows[0].count, 1);

  await t.test('invalid and conflicting snapshots leave the published revision unchanged', async () => {
    const duplicate = structuredClone(snapshot);
    duplicate.exercises.push(duplicate.exercises[0]);
    await assert.rejects(importSnapshot(database, duplicate, true), /Duplicate/);
    const changed = structuredClone(snapshot);
    changed.exercises[0].nameVi = 'Changed';
    await assert.rejects(importSnapshot(database, changed, true), /different content/);
    const collision = structuredClone(snapshot);
    collision.revision = 'second-snapshot';
    collision.muscleGroups[0].id = 'new_group';
    collision.muscleGroups[0].slug = 'new-group';
    collision.exercises[0].publishedRevision = collision.revision;
    collision.exercises[0].primaryMuscleIds = ['new_group', 'glutes'];
    await assert.rejects(importSnapshot(database, collision, true));
    assert.equal((await pg.query("SELECT count(*)::int AS count FROM muscle_groups WHERE id='new_group'")).rows[0].count, 0);
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM publication_revisions')).rows[0].count, 1);
  });
  const app = await createApp(database);
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const get = suffix => fetch(url + suffix, { redirect: 'manual' });
  await t.test('public queries and error responses', async () => {
    assert.equal((await get('/health/ready')).status, 200);
    const groups = await (await get('/api/v1/muscle-groups')).json();
    checkFields(groups.items[0], 'MuscleGroup');
    assert.ok(groups.items.some(item => item.id === 'quadriceps'));
    const list = await (await get('/api/v1/exercises?q=khong%20ta&muscleGroupId=quadriceps&equipmentId=bodyweight')).json();
    assert.equal(list.items[0].id, 'bodyweight_squat');
    checkFields(list.items[0], 'ExerciseSummary');
    assert.equal(list.nextCursor, null);
    assert.deepEqual((await (await get('/api/v1/exercises?muscleGroupId=unknown')).json()).items, []);
    const detail = await (await get('/api/v1/exercises/squat-khong-ta')).json();
    checkFields(detail, 'ExerciseDetail');
    assert.equal(detail.instructions.length, 3);
    assert.equal(detail.variants.length, 0);
    for (const suffix of ['?limit=0', '?limit=1x', '?q=', '?cursor=bad', '?limit=2&limit=3', '?unexpected=1']) {
      assert.equal((await get('/api/v1/exercises' + suffix)).status, 400, suffix);
    }
    assert.equal((await get('/api/v1/exercises/missing')).status, 404);
    await pg.query("INSERT INTO slug_history VALUES('old-squat','bodyweight_squat','ALIAS')");
    const alias = await get('/api/v1/exercises/old-squat');
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get('location'), '/api/v1/exercises/squat-khong-ta');
  });
  await t.test('cursor binds filter and revision, and archived content stays private', async () => {
    const doc = { ...snapshot.exercises[0], id: 'zz_test_squat', slug: 'test-squat' };
    await database.transaction(async client => {
      await client.query("INSERT INTO exercises VALUES('zz_test_squat','PUBLISHED',1)");
      await client.query('INSERT INTO exercise_revisions VALUES($1,1,$2)', [doc.id, JSON.stringify(doc)]);
    });
    const first = await (await get('/api/v1/exercises?limit=1')).json();
    assert.ok(first.nextCursor);
    const cursor = encodeURIComponent(first.nextCursor);
    const second = await (await get('/api/v1/exercises?limit=1&cursor=' + cursor)).json();
    assert.equal(second.items[0].id, doc.id);
    assert.equal((await get('/api/v1/exercises?limit=1&q=squat&cursor=' + cursor)).status, 400);
    await pg.query("INSERT INTO publication_revisions(revision) VALUES('new-head')");
    assert.equal((await get('/api/v1/exercises?limit=1&cursor=' + cursor)).status, 400);
    await pg.query("UPDATE exercises SET lifecycle='ARCHIVED' WHERE id='bodyweight_squat'");
    assert.equal((await get('/api/v1/exercises/squat-khong-ta')).status, 404);
    assert.equal((await get('/api/v1/exercises/old-squat')).status, 404);
  });
  await t.test('dependency failure returns safe service error while liveness survives', async () => {
    fail = true;
    const response = await get('/api/v1/exercises');
    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /application\/problem\+json/);
    const error = await response.json();
    checkFields(error, 'Problem');
    assert.equal(error.code, 'SERVICE_UNAVAILABLE');
    assert.ok(error.requestId);
    assert.ok(!JSON.stringify(error).includes('Private'));
    assert.equal((await get('/health/ready')).status, 503);
    assert.equal((await get('/health/live')).status, 200);
    fail = false;
  });
  await t.test('upgrades version-one data without rewriting migration history', async () => {
    // Reconstruct the committed v1 schema in this test-only database, retaining its source rows.
    await database.transaction(async client => {
      await client.query('DROP TABLE catalog_feed_snapshots; ALTER TABLE publication_revisions DROP COLUMN reason; ALTER TABLE outbox_events DROP COLUMN lease_token, DROP COLUMN lease_until, DROP COLUMN error_code; DELETE FROM catalog_migrations WHERE version=8');
      await client.query('DROP TABLE catalog_exports,catalog_import_jobs; DELETE FROM catalog_migrations WHERE version=7');
      await client.query(`DROP TRIGGER exercise_revisions_append_only ON exercise_revisions;
        DROP FUNCTION prevent_exercise_revision_changes();
        DROP INDEX catalog_audit_revision;
        ALTER TABLE catalog_audit DROP COLUMN source_version;
        DELETE FROM catalog_migrations WHERE version IN (5,6)`);
      await client.query("UPDATE exercises SET lifecycle='PUBLISHED' WHERE id='bodyweight_squat'");
      await client.query("UPDATE exercises SET current_published_version=NULL WHERE id='zz_test_squat'");
      await client.query("DELETE FROM exercise_revisions WHERE exercise_id='zz_test_squat'");
      await client.query("DELETE FROM exercises WHERE id='zz_test_squat'");
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
      await client.query(`DROP TABLE revision_variants, revision_media;
        ALTER TABLE revision_muscle_groups DROP COLUMN support_version;
        ALTER TABLE revision_equipment DROP COLUMN support_version;
        ALTER TABLE muscle_groups DROP COLUMN current_draft_version, DROP COLUMN current_published_version,
          DROP COLUMN edit_version, DROP COLUMN created_by, DROP COLUMN updated_at, DROP COLUMN sort_order;
        ALTER TABLE equipment DROP COLUMN current_draft_version, DROP COLUMN current_published_version,
          DROP COLUMN edit_version, DROP COLUMN created_by, DROP COLUMN updated_at;
        DROP TABLE support_revisions, exercise_variants, media_assets, media_uploads;
        DROP FUNCTION prevent_support_revision_changes();
        DROP INDEX muscle_groups_public_slug, equipment_public_slug;
        ALTER TABLE muscle_groups ALTER COLUMN label_vi SET NOT NULL, ALTER COLUMN slug SET NOT NULL, ADD UNIQUE (slug);
        ALTER TABLE equipment ALTER COLUMN label_vi SET NOT NULL, ALTER COLUMN slug SET NOT NULL, ADD UNIQUE (slug);
        ALTER TABLE publication_revisions DROP COLUMN content_type, DROP COLUMN content_id;
        DELETE FROM catalog_migrations WHERE version=4`);
      await client.query(`DROP TABLE outbox_events, catalog_audit, idempotency_keys;
        DROP FUNCTION prevent_catalog_audit_changes();
        ALTER TABLE exercises DROP COLUMN edit_version, DROP COLUMN current_draft_version, DROP COLUMN published_from_version, DROP COLUMN created_by, DROP COLUMN updated_at;
        ALTER TABLE exercise_revisions DROP COLUMN author, DROP COLUMN created_at;
        ALTER TABLE publication_revisions DROP COLUMN exercise_id, DROP COLUMN entity_version, DROP COLUMN action, DROP COLUMN actor;
        DELETE FROM catalog_migrations WHERE version=3`);
      await client.query('DROP INDEX catalog_keyset; ALTER TABLE exercise_revisions DROP COLUMN search_key; DROP FUNCTION catalog_search_key(text); ALTER TABLE catalog_imports DROP COLUMN source_manifest; DELETE FROM catalog_migrations WHERE version=2');
      // A retained public revision may no longer be the owner's current publication.
      await client.query(`INSERT INTO exercise_revisions(exercise_id,version,document)
        SELECT exercise_id,2,document FROM exercise_revisions WHERE exercise_id='bodyweight_squat' AND version=1;
        INSERT INTO revision_muscle_groups(exercise_id,version,group_id,rank)
        SELECT exercise_id,2,group_id,rank FROM revision_muscle_groups WHERE exercise_id='bodyweight_squat' AND version=1`);
    });
    await migrate(database);
    await migrate(database);
    const pins = await pg.query('SELECT support_version FROM revision_muscle_groups WHERE exercise_id=$1 ORDER BY group_id', [snapshot.exercises[0].id]);
    assert.equal(pins.rows.length, 2 * (snapshot.exercises[0].primaryMuscleIds.length + snapshot.exercises[0].secondaryMuscleIds.length));
    assert.ok(pins.rows.every(row => row.support_version === 1));
    assert.equal((await get('/api/v1/exercises?q=KHÔNG%20TẠ')).status, 200);
    assert.equal((await (await get('/api/v1/exercises?q=khong%20ta')).json()).items[0].id, snapshot.exercises[0].id);
    const before = (await pg.query('SELECT checksum FROM catalog_migrations WHERE version=1')).rows[0].checksum;
    await pg.query("UPDATE catalog_migrations SET checksum='tampered' WHERE version=1");
    try { await assert.rejects(migrate(database), /checksum/); }
    finally { await pg.query('UPDATE catalog_migrations SET checksum=$1 WHERE version=1', [before]); }
    const legacy = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    await pg.query('UPDATE catalog_imports SET checksum=$1 WHERE source_revision=$2', [legacy, snapshot.revision]);
    await importSnapshot(database, snapshot, true);
    assert.equal((await pg.query('SELECT document FROM exercise_revisions WHERE exercise_id=$1', [snapshot.exercises[0].id])).rows[0].document.publishedRevision, snapshot.revision);
  });
  await t.test('metadata-only legacy READY uploads are queued for byte verification during migration', async () => {
    await database.transaction(async client => {
      await client.query('DROP TABLE catalog_feed_snapshots; ALTER TABLE publication_revisions DROP COLUMN reason; ALTER TABLE outbox_events DROP COLUMN lease_token, DROP COLUMN lease_until, DROP COLUMN error_code; DELETE FROM catalog_migrations WHERE version=8');
      await client.query('DROP TABLE catalog_exports,catalog_import_jobs; DELETE FROM catalog_migrations WHERE version=7');
      await client.query(`DROP INDEX media_uploads_verify,media_uploads_cleanup,support_revisions_upload;
        ALTER TABLE media_uploads DROP COLUMN verified_at, DROP COLUMN width, DROP COLUMN height, DROP COLUMN duration_ms,
          DROP COLUMN verify_after, DROP COLUMN lease_token, DROP COLUMN lease_until, DROP COLUMN attempts,
          DROP COLUMN revoked_at, DROP COLUMN cleanup_after, DROP COLUMN purged_at;
        DELETE FROM catalog_migrations WHERE version=6;
        INSERT INTO media_uploads(id,actor_id,object_key,object_version,expected_mime,expected_bytes,expected_sha256,detected_mime,status,expires_at)
        VALUES('legacy_upload','00000000-0000-4000-8000-000000000001','legacy/test','legacy-version',
          'image/png',32,repeat('f',64),'image/png','READY',now())`);
    });
    await migrate(database);
    const row = (await pg.query("SELECT object_version,status,verified_at,verify_after FROM media_uploads WHERE id='legacy_upload'")).rows[0];
    assert.equal(row.object_version, 'legacy-version');
    assert.equal(row.status, 'VERIFYING');
    assert.equal(row.verified_at, null);
    assert.ok(row.verify_after);
    await pg.query("DELETE FROM media_uploads WHERE id='legacy_upload'");
  });
  await t.test('rejects malformed snapshots before database writes', async () => {
    for (const change of [
      data => { data.exercises[0].instructions = 'not an array'; },
      data => { data.exercises[0].nameVi = '   '; },
      data => { data.exercises[0].media = [{ url: 'unreviewed' }]; },
      data => { data.exercises[0].unknown = true; },
      data => { data.exercises[0].equipmentIds = ['bodyweight', 'bodyweight']; },
      data => { data.exercises[0].primaryMuscleIds = ['missing_group']; },
    ]) {
      const invalid = structuredClone(snapshot);
      change(invalid);
      await assert.rejects(importSnapshot(database, invalid, true));
    }
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM exercises')).rows[0].count, 1);
  });
  await t.test('imports the 35-exercise KB snapshot concurrently and keeps old public content', async () => {
    const full = JSON.parse(await readFile(join(__dirname, '../data/smartgym-m2.json'), 'utf8'));
    await Promise.all([importSnapshot(database, full, true), importSnapshot(database, full, true)]);
    // Canonical content fingerprint ignores object key insertion order.
    const reordered = Object.fromEntries(Object.entries(full).reverse());
    await importSnapshot(database, reordered, true);
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM exercises')).rows[0].count, 35);
    const m1 = await (await get('/api/v1/exercises/squat-khong-ta')).json();
    assert.equal(m1.publishedRevision, snapshot.revision);
    const ids = [];
    let cursor;
    queryBatches.length = 0;
    do {
      const page = await (await get('/api/v1/exercises?limit=7' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))).json();
      assert.ok(page.items.length <= 7);
      for (const row of page.items) checkFields(row, 'ExerciseSummary');
      ids.push(...page.items.map(row => row.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 35);
    assert.equal(new Set(ids).size, 35);
    assert.ok(Math.max(...queryBatches) <= 8, 'SQL must return at most limit+1 documents');
    assert.deepEqual(ids, [...ids].sort());
    const unaccented = await (await get('/api/v1/exercises?q=chong%20day')).json();
    const accented = await (await get('/api/v1/exercises?q=CHỐNG%20ĐẨY')).json();
    assert.deepEqual(accented, unaccented);
    assert.ok(unaccented.items.length >= 3);
    const literal = await (await get('/api/v1/exercises?q=%25')).json();
    assert.deepEqual(literal.items, []);
    const filtered = await (await get('/api/v1/exercises?muscleGroupId=chest&equipmentId=barbell')).json();
    assert.deepEqual(filtered.items.map(row => row.id), ['barbell_bench_press']);
    const refs = await pg.query('SELECT source_manifest FROM catalog_imports WHERE source_revision=$1', [full.revision]);
    assert.equal(refs.rows[0].source_manifest.files.length, 36);
    const changed = structuredClone(full);
    changed.revision = 'attempted-overwrite';
    for (const row of changed.exercises) row.publishedRevision = changed.revision;
    changed.exercises[0].nameVi = 'Changed source';
    await assert.rejects(importSnapshot(database, changed, true), /Existing exercise differs/);
    assert.equal((await pg.query('SELECT count(*)::int AS count FROM catalog_imports WHERE source_revision=$1', [changed.revision])).rows[0].count, 0);
  });
});
