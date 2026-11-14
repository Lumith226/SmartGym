import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCircuitBreaker } from '../../frontend/server/resilience.mjs';

test('RAG circuit opens after three failures and permits only one recovery probe', async () => {
  let time = 0;
  const run = createCircuitBreaker({ clock: () => time });
  const unhealthy = status => status >= 500;
  for (let i = 0; i < 3; i++) assert.equal(await run(async () => 503, unhealthy), 503);
  await assert.rejects(run(async () => assert.fail('upstream called while open'), unhealthy), { status: 503 });
  time += 15000;
  let recover;
  const probe = run(() => new Promise(resolve => { recover = resolve; }), unhealthy);
  await assert.rejects(run(async () => assert.fail('parallel probe'), unhealthy), { status: 503 });
  recover(200);
  assert.equal(await probe, 200);
  assert.equal(await run(async () => 200, unhealthy), 200);
});
