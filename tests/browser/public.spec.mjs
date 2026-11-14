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

test('filter, open real instructions and use keyboard navigation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tìm bài tập');
  await page.getByLabel('Tìm bài tập').fill('khong ta');
  await page.getByLabel('Nhóm cơ', { exact: true }).selectOption('quadriceps');
  await page.getByLabel('Dụng cụ').selectOption('bodyweight');
  await page.getByRole('button', { name: 'Tìm bài tập' }).click();
  await expect(page).toHaveURL(/muscleGroupId=quadriceps/);
  await page.getByRole('link', { name: 'Squat không tạ', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/bai-tap\/squat-khong-ta$/);
  await expect(page.getByRole('heading', { name: 'Cách thực hiện' })).toBeVisible();
  await expect(page.getByText(/Giữ bàn chân tiếp xúc với sàn/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile form reflows, empty query and missing detail are actionable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(url);
  await expect(page.getByLabel('Tìm bài tập')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByLabel('Tìm bài tập').fill('bai-khong-ton-tai');
  await page.getByRole('button', { name: 'Tìm bài tập' }).click();
  await expect(page.getByText(/Chưa có bài tập khớp/)).toBeVisible();
  await page.screenshot({ path: '.local/browser-results/mobile-empty.png', fullPage: true });
  await page.goto(url + '/bai-tap/missing');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy bài tập' })).toBeVisible();
  await page.getByRole('link', { name: 'Trở về thư viện' }).click();
  await expect(page.getByRole('heading', { name: /Tìm bài tập/ })).toBeVisible();
});

test('cursor pagination exposes the rest of the source catalog', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('article')).toHaveCount(20);
  const first = await page.locator('article h3').allTextContents();
  await page.getByRole('link', { name: 'Xem thêm bài tập' }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.locator('article')).toHaveCount(15);
  const second = await page.locator('article h3').allTextContents();
  expect(new Set([...first, ...second]).size).toBe(35);
});

test('public library has no automated WCAG A/AA violations and a keyboard bypass', async ({ page }) => {
  const reports = [];
  for (const path of ['/', '/?q=khong+ta', '/?q=not-an-exercise', '/bai-tap/squat-khong-ta', '/bai-tap/missing']) {
    await page.goto(url + path);
    if (path === '/') {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Bỏ qua điều hướng' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
    }
    await page.addScriptTag({ path: axeScript });
    const result = await page.evaluate(async () => {
      const { violations, incomplete } = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
      });
      return { violations: violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) })),
        incomplete: incomplete.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })) };
    });
    reports.push({ path, ...result });
    expect(result.violations, path + '\n' + JSON.stringify(result)).toEqual([]);
  }
  await writeFile('.local/public-accessibility.json', JSON.stringify({ checkedAt: new Date().toISOString(), engine: 'axe-core 4.11.4', reports }, null, 2));
});

test('public library stays independent and private routes fail closed when account and AI services are disabled', async ({ page, context }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(url);
  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(navigation.getByRole('link', { name: 'Thư viện bài tập', exact: true })).toHaveAttribute('href', '/');
  await expect(navigation.getByRole('link', { name: 'Hỏi SmartGym', exact: true })).toHaveAttribute('href', '/hoi-dap');
  await expect(navigation.getByRole('link', { name: /^(Đăng nhập|Tài khoản)$/ })).toHaveCount(0);
  await expect(page.locator('article')).toHaveCount(20);
  for (const path of ['/api/v1/auth/login', '/api/v1/me', '/api/v1/pose/capabilities', '/api/v1/admin/exercises', '/app', '/app/tap-ai', '/admin']) {
    const response = await context.request.get(url + path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(503);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.text()).not.toMatch(/accessToken|DATABASE_URL|PRIVATE KEY/);
  }
  expect((await context.request.get(url + '/internal/v1/identity/jwks')).status()).toBe(404);
  const chat = await context.request.post(url + '/api/v1/chat', {
    data: { message: 'Hỏi về squat', task: 'knowledge' },
  });
  expect(chat.status()).toBe(503);
  expect(chat.headers()['cache-control']).toBe('no-store');
  await page.goto(url + '/bai-tap/squat-khong-ta');
  await expect(page.getByRole('heading', { name: 'Cách thực hiện' })).toBeVisible();
  expect(requests.filter(value => /\/api\/v1\/(auth|pose|admin|chat)|\/internal\//.test(value))).toEqual([]);
});

test('shared search URL, article fallback and public SEO use the Catalog canonical slug', async ({ page, context }) => {
  await page.goto(url + '/?q=khong+ta&muscleGroupId=quadriceps&equipmentId=bodyweight');
  await expect(page.getByLabel('Tìm bài tập')).toHaveValue('khong ta');
  await expect(page.getByLabel('Nhóm cơ', { exact: true })).toHaveValue('quadriceps');
  await expect(page.getByLabel('Dụng cụ', { exact: true })).toHaveValue('bodyweight');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Squat không tạ', exact: true }).click();
  await expect(page).toHaveTitle('Squat không tạ — SmartGym');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://smartgym.example.test/bai-tap/squat-khong-ta');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://smartgym.example.test/bai-tap/squat-khong-ta');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /./);
  await expect(page.getByRole('link', { name: 'Đùi trước', exact: true })).toHaveAttribute('href', '/?muscleGroupId=quadriceps');
  await expect(page.getByRole('link', { name: 'Không cần dụng cụ', exact: true })).toHaveAttribute('href', '/?equipmentId=bodyweight');
  await expect(page.getByText('Chưa có video minh họa khả dụng.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cách thực hiện' })).toBeVisible();
  const bot = await context.request.get(page.url(), { headers: { 'User-Agent': 'Twitterbot/1.0' } });
  expect((await bot.text()).split('</head>')[0]).toContain('rel="canonical" href="https://smartgym.example.test/bai-tap/squat-khong-ta"');
  const sitemap = await context.request.get(url + '/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('application/xml');
  const xml = await sitemap.text();
  expect(xml).toContain('<loc>https://smartgym.example.test/bai-tap/squat-khong-ta</loc>');
  expect(xml.match(/<loc>/g)).toHaveLength(36);
  expect(xml).not.toMatch(/\/admin|[?]q=/);
});

test('muscle map keeps keyboard focus, selection and URL filters in sync', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url + '/?q=chong+day&equipmentId=bodyweight');
  const map = page.getByRole('region', { name: 'Bản đồ cơ thể' });
  const front = map.getByRole('group', { name: 'Các vùng tương tác · Mặt trước' });
  const list = map.getByRole('list', { name: 'Danh sách nhóm cơ' });
  const chest = front.getByRole('button', { name: 'Ngực', exact: true });
  const shoulder = front.getByRole('button', { name: 'Vai', exact: true });
  await expect(front.locator('[tabindex="0"]')).toHaveCount(1);
  await map.getByRole('button', { name: 'Mặt sau', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(shoulder).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(chest).toBeFocused();
  await expect(chest).toHaveCSS('stroke-width', '5px');
  await expect(chest).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/muscleGroupId=chest/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('chong day');
  expect(new URL(page.url()).searchParams.get('equipmentId')).toBe('bodyweight');
  await expect(chest).toHaveAttribute('aria-pressed', 'true');
  await expect(chest).toBeFocused();
  await expect(page.getByLabel('Nhóm cơ', { exact: true })).toHaveValue('chest');
  await expect(list.getByRole('link', { name: 'Ngực', exact: true })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('article').first()).toBeVisible();
  const titles = await page.locator('article h3').allTextContents();
  await page.keyboard.press('Tab');
  await expect(list.getByRole('link', { name: 'Tất cả', exact: true })).toBeFocused();

  await map.getByRole('button', { name: 'Mặt sau', exact: true }).click();
  const back = map.getByRole('group', { name: 'Các vùng tương tác · Mặt sau' });
  await expect(back.getByRole('button', { name: 'Ngực', exact: true })).toHaveCount(0);
  await expect(map.getByRole('status')).toHaveText('Đang chọn Ngực');
  expect(await page.locator('article h3').allTextContents()).toEqual(titles);
  const triceps = back.getByRole('button', { name: 'Tay sau', exact: true });
  await triceps.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/muscleGroupId=triceps/);
  await expect(triceps).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(list.getByRole('link', { name: 'Ngực', exact: true })).toHaveAttribute('aria-current', 'true');
  const shared = page.url();
  await page.goto(shared);
  await expect(front.getByRole('button', { name: 'Ngực', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('article h3').allTextContents()).toEqual(titles);
  await list.getByRole('link', { name: 'Tất cả', exact: true }).click();
  await expect(map.getByRole('status')).toHaveText('Đang xem tất cả nhóm cơ');
  await map.getByRole('link', { name: 'Đến kết quả', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Bài tập', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('muscle map taps and pointer clicks lead to matching results and reset the cursor', async ({ browser, page }) => {
  await page.goto(url);
  await page.getByRole('link', { name: 'Xem thêm bài tập' }).click();
  await expect(page).toHaveURL(/cursor=/);
  await page.getByRole('button', { name: 'Đùi trước', exact: true }).locator('path').first().click();
  await expect(page).toHaveURL(/muscleGroupId=quadriceps$/);
  await expect(page.getByRole('link', { name: 'Squat không tạ', exact: true })).toBeVisible();
  const titles = await page.locator('article h3').allTextContents();
  const mobile = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 740 } });
  try {
    const touch = await mobile.newPage();
    await touch.goto(url);
    await touch.getByRole('button', { name: 'Đùi trước', exact: true }).locator('path').first().tap();
    await expect(touch.getByRole('status').filter({ hasText: 'Đang chọn Đùi trước' })).toBeVisible();
    expect(await touch.locator('article h3').allTextContents()).toEqual(titles);
    expect(await touch.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await touch.getByRole('region', { name: 'Bản đồ cơ thể' }).screenshot({ path: '.local/browser-results/muscle-map-mobile.png' });
  } finally { await mobile.close(); }
  for (const width of [320, 640, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('list', { name: 'Danh sách nhóm cơ' }).getByRole('link', { name: 'Đùi trước', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test('unmapped Catalog groups stay usable through HTML with JavaScript disabled', async ({ browser, page }) => {
  const group = 'quadriceps';
  await database.query('UPDATE muscle_groups SET svg_regions=$2::jsonb WHERE id=$1', [group, JSON.stringify(['unknown_geometry'])]);
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await page.goto(url);
    await expect(page.getByRole('button', { name: 'Mặt trước', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Đùi trước', exact: true })).toHaveCount(0);
    const fallback = await context.newPage();
    await fallback.goto(url);
    await expect(fallback.getByRole('button', { name: 'Mặt trước', exact: true })).toHaveCount(0);
    await fallback.getByRole('list', { name: 'Danh sách nhóm cơ' }).getByRole('link', { name: 'Đùi trước', exact: true }).click();
    await expect(fallback).toHaveURL(/muscleGroupId=quadriceps/);
    await expect(fallback.getByRole('link', { name: 'Squat không tạ', exact: true })).toBeVisible();
  } finally {
    await context.close();
    await database.query('UPDATE muscle_groups SET svg_regions=$2::jsonb WHERE id=$1', [group, '[]']);
  }
});
