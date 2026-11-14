import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

async function freePort() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function waitFor(url, child, output) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(output());
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {}
    await setTimeout(100);
  }
  throw new Error('Service startup timeout: ' + output());
}

test('Web → Catalog public flow degrades and recovers across a Catalog restart', { timeout: 45000 }, async t => {
  const catalogPort = await freePort();
  const webPort = await freePort();
  const children = [];
  function start(args, cwd, env) {
    const child = spawn(process.execPath, args, { cwd: resolve(cwd), env: { ...process.env, ...env }, windowsHide: true });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    children.push(child);
    return { child, output: () => output };
  }
  t.after(async () => {
    await Promise.all(children.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill();
    })));
  });
  const startCatalog = () => start(['test/dev.cjs', '--ephemeral'], 'backend/services/catalog', {
    PORT: String(catalogPort), NODE_ENV: 'development',
  });
  const backend = startCatalog();
  const backendUrl = 'http://127.0.0.1:' + catalogPort;
  await waitFor(backendUrl + '/health/ready', backend.child, backend.output);
  const web = start(['server.mjs'], 'frontend', {
    NODE_ENV: 'production', PORT: String(webPort), HOST: '127.0.0.1', BFF_AUTH_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1', CATALOG_URL: backendUrl,
    WEB_PUBLIC_ORIGIN: '',
  });
  const webUrl = 'http://127.0.0.1:' + webPort;
  await waitFor(webUrl, web.child, web.output);
  const home = await (await fetch(webUrl + '/?muscleGroupId=quadriceps&equipmentId=bodyweight')).text();
  assert.match(home, /Squat không tạ/);
  assert.match(home, /\/bai-tap\/squat-khong-ta/);
  const response = await fetch(webUrl + '/bai-tap/squat-khong-ta');
  assert.equal(response.status, 200);
  const detail = await response.text();
  assert.match(detail, /Giữ bàn chân tiếp xúc với sàn/);
  assert.match(detail, /noindex/);
  assert.equal((await fetch(webUrl + '/sitemap.xml')).status, 404);
  const empty = await (await fetch(webUrl + '/?q=unknown-exercise')).text();
  assert.match(empty, /Chưa có bài tập khớp/);
  assert.equal((await fetch(webUrl + '/bai-tap/missing')).status, 404);
  const exit = new Promise(resolve => backend.child.once('exit', resolve));
  backend.child.kill();
  await exit;
  const degraded = await (await fetch(webUrl)).text();
  assert.match(degraded, /Thư viện đang kết nối lại/);

  const restarted = startCatalog();
  await waitFor(backendUrl + '/health/ready', restarted.child, restarted.output);
  const recovered = await fetch(webUrl + '/bai-tap/squat-khong-ta', { signal: AbortSignal.timeout(5000) });
  assert.equal(recovered.status, 200);
  assert.match(await recovered.text(), /Giữ bàn chân tiếp xúc với sàn/);
});
