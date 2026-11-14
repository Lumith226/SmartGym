import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { startPostgres, freePort } from '../helpers/postgres.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { connectDatabase } from '../../backend/apps/catalog/dist/database.js';
import { migrate } from '../../backend/apps/catalog/dist/migrate.js';
import { importSnapshot } from '../../backend/apps/catalog/dist/import.js';

test('isolated Catalog cold backup restores data, database roles and API readiness', { timeout: 120000 }, async t => {
  const pg = await startPostgres();
  t.after(pg.stop);
  const catalogUrl = new URL(pg.connectionString);
  catalogUrl.username = 'catalog_restore_owner';
  catalogUrl.password = randomBytes(24).toString('hex');
  catalogUrl.pathname = '/catalog_restore';
  const admin = connectDatabase(pg.connectionString);
  try {
    await admin.query("CREATE ROLE catalog_restore_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + catalogUrl.password + "'");
    await admin.query('CREATE DATABASE catalog_restore OWNER catalog_restore_owner');
    await admin.query('REVOKE CONNECT ON DATABASE postgres FROM PUBLIC');
  } finally {
    await admin.close();
  }

  async function catalogState(db) {
    const [migrations, revisions, exercises] = await Promise.all([
      db.query('SELECT version, checksum FROM catalog_migrations ORDER BY version'),
      db.query('SELECT revision, aggregate_version FROM publication_revisions ORDER BY aggregate_version'),
      db.query('SELECT exercise_id, version, document FROM exercise_revisions ORDER BY exercise_id, version'),
    ]);
    return { migrations: migrations.rows, revisions: revisions.rows, exercises: exercises.rows };
  }

  const fixture = JSON.parse(await readFile('backend/apps/catalog/data/smartgym-m2.json', 'utf8'));
  const source = connectDatabase(catalogUrl.href);
  let expected;
  try {
    await migrate(source);
    await importSnapshot(source, fixture, true);
    expected = await catalogState(source);
    assert.equal(expected.exercises.length, fixture.exercises.length);
    assert.ok(expected.exercises.length > 0);
  } finally {
    await source.close();
  }

  const startedAt = performance.now();
  await pg.restoreColdCopy();
  const restored = connectDatabase(catalogUrl.href);
  try {
    assert.deepEqual(await catalogState(restored), expected);
  } finally {
    await restored.close();
  }

  const foreignUrl = new URL(catalogUrl);
  foreignUrl.pathname = '/postgres';
  const foreign = connectDatabase(foreignUrl.href);
  try {
    await assert.rejects(foreign.query('SELECT 1'), { code: '42501' });
  } finally {
    await foreign.close();
  }

  const port = await freePort();
  const origin = 'http://127.0.0.1:' + port;
  const catalog = startProcess(['dist/main.js'], 'backend/apps/catalog', {
    DATABASE_URL: catalogUrl.href, HOST: '127.0.0.1', PORT: String(port),
    CATALOG_ADMIN_ENABLED: 'false', CATALOG_MEDIA_ENABLED: 'false',
  });
  try {
    await catalog.waitFor(origin + '/health/ready');
    const response = await fetch(origin + '/api/v1/exercises/squat-khong-ta', { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, 'bodyweight_squat');
    t.diagnostic(JSON.stringify({ postgres: pg.version, exercises: expected.exercises.length,
      migrations: expected.migrations.length, elapsedMs: Math.round(performance.now() - startedAt) }));
  } finally {
    await catalog.stop();
  }
});
