import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { startPostgres, freePort } from '../helpers/postgres.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { connectDatabase } from '../../backend/services/catalog/dist/database.js';
import { migrate } from '../../backend/services/catalog/dist/migrate.js';
import { importSnapshot } from '../../backend/services/catalog/dist/import.js';

const seconds = Number(process.env.LIBRARY_LOAD_SECONDS ?? 60);
assert.ok(Number.isInteger(seconds) && seconds >= 60 && seconds <= 600, 'LIBRARY_LOAD_SECONDS must be 60–600');

test('Catalog public read load on an isolated PostgreSQL database', { timeout: (seconds + 90) * 1000 }, async t => {
  const cleanup = [];
  t.after(async () => {
    const results = [];
    for (const close of cleanup.reverse()) try { await close(); } catch (error) { results.push(error); }
    if (results.length) throw new AggregateError(results, 'Load fixture cleanup failed');
  });
  const pg = await startPostgres();
  cleanup.push(pg.stop);
  const db = connectDatabase(pg.connectionString);
  cleanup.push(() => db.close());
  await migrate(db);
  const snapshot = JSON.parse(await readFile('backend/services/catalog/data/smartgym-m2.json', 'utf8'));
  await importSnapshot(db, snapshot, true);
  const port = await freePort();
  const origin = 'http://127.0.0.1:' + port;
  const service = startProcess(['dist/main.js'], 'backend/services/catalog', {
    HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: pg.connectionString,
    CATALOG_ADMIN_ENABLED: 'false', CATALOG_MEDIA_ENABLED: 'false',
  });
  cleanup.push(() => service.stop());
  await service.waitFor(origin + '/health/ready');
  const cases = [
    { path: '/api/v1/exercises?limit=20', valid: value => value.items?.length === 20 },
    { path: '/api/v1/exercises?q=squat&limit=20', valid: value => value.items?.some(item => item.id === 'bodyweight_squat') },
    { path: '/api/v1/exercises/squat-khong-ta', valid: value => value.id === 'bodyweight_squat' && value.instructions?.length > 0 },
    { path: '/api/v1/muscle-groups', valid: value => value.items?.some(item => item.id === 'quadriceps') },
  ];
  for (const item of cases) assert.equal((await fetch(origin + item.path)).status, 200);
  const latencies = [], requests = [], errors = [];
  let inFlight = 0, peak = 0, missed = 0;
  const started = performance.now();
  async function request(item) {
    inFlight++; peak = Math.max(peak, inFlight);
    const start = performance.now();
    try {
      const response = await fetch(origin + item.path, { signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 200);
      assert.ok(item.valid(await response.json()), 'Response content mismatch');
      latencies.push(performance.now() - start);
    } catch (error) { errors.push(error.name + ': ' + error.message); }
    finally { inFlight--; }
  }
  for (let index = 0; index < seconds * 20; index++) {
    const due = started + index * 50;
    await delay(Math.max(0, due - performance.now()));
    if (inFlight >= 100 || performance.now() - due > 1000) { missed++; continue; }
    requests.push(request(cases[index % cases.length]));
  }
  await Promise.all(requests);
  const elapsed = performance.now() - started;
  latencies.sort((a, b) => a - b);
  const percentile = fraction => Math.round((latencies[Math.ceil(latencies.length * fraction) - 1] ?? 0) * 100) / 100;
  const report = {
    checkedAt: new Date().toISOString(), node: process.version, os: platform() + ' ' + release(),
    cpu: cpus()[0]?.model, logicalCpus: cpus().length, postgres: pg.version, sourceExercises: snapshot.exercises.length,
    requestedRps: 20, seconds, requests: requests.length, successes: latencies.length, errors: errors.length,
    missed, peakInFlight: peak, actualRps: Math.round(requests.length / elapsed * 100000) / 100,
    latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
    paths: cases.map(item => item.path),
  };
  await mkdir('.local', { recursive: true });
  await writeFile('.local/catalog-read-load.json', JSON.stringify(report, null, 2));
  t.diagnostic(JSON.stringify(report));
  assert.equal(errors.length, 0, errors.slice(0, 3).join('\n'));
  assert.equal(missed, 0, 'Load generator could not sustain the requested schedule');
});
