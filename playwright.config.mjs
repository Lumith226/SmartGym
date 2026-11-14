import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.local/browsers');

export default defineConfig({
  testDir: './tests/browser',
  outputDir: '.local/browser-results',
  timeout: 30000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
