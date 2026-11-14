import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { startPostgres, freePort } from '../helpers/postgres.mjs';
import { startProcess } from '../helpers/processes.mjs';
import { connectDatabase } from '../../backend/apps/catalog/dist/database.js';
import { migrate } from '../../backend/apps/catalog/dist/migrate.js';
import { importSnapshot } from '../../backend/apps/catalog/dist/import.js';
import { createRequire } from 'node:module';

const axeScript = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

let postgres;
let backend;
let web;
let database;
let url;

test.beforeAll(async () => {
  test.setTimeout(90000);
  postgres = await startPostgres();
  console.log(postgres.version);
  database = connectDatabase(postgres.connectionString);
  await migrate(database);
  const snapshot = JSON.parse(await readFile('backend/apps/catalog/data/smartgym-m2.json', 'utf8'));
  await importSnapshot(database, snapshot, true);
  const backendPort = await freePort();
  backend = startProcess(['dist/main.js'], 'backend/apps/catalog', {
    PORT: String(backendPort), DATABASE_URL: postgres.connectionString,
  });
  await backend.waitFor('http://127.0.0.1:' + backendPort + '/health/ready');
  const webPort = await freePort();
  url = 'http://127.0.0.1:' + webPort;
  web = startProcess(['server.mjs'], 'frontend', {
    NODE_ENV: 'production', PORT: String(webPort), HOST: '127.0.0.1', BFF_AUTH_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1',
    CATALOG_URL: 'http://127.0.0.1:' + backendPort, WEB_PUBLIC_ORIGIN: 'https://smartgym.example.test',
  });
  await web.waitFor(url);
});

test.afterAll(async () => {
  test.setTimeout(90000);
  await web?.stop();
  await backend?.stop();
  await database?.close();
  await postgres?.stop();
});
test('shots', async ({ browser }) => {
  test.setTimeout(90000);
  for (const [name, vp] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]) {
    const ctx = await browser.newContext({ viewport: vp }); const page = await ctx.newPage();
    await page.goto(url); await page.waitForTimeout(600);
    await page.screenshot({ path: `.local/ui-review/home-${name}.png`, fullPage: false });
    await page.goto(url + '/bai-tap/squat-khong-ta'); await page.waitForTimeout(600);
    await page.screenshot({ path: `.local/ui-review/detail-${name}.png`, fullPage: false });
    await ctx.close();
  }
});
