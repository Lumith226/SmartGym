import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { forbiddenImport, checkBoundaries } from '../../scripts/check-boundaries.mjs';

test('service boundary check detects direct cross-service imports', async () => {
  const source = resolve('frontend/app/page.tsx');
  assert.equal(forbiddenImport(source, '../../backend/apps/catalog/src/app.js'), true);
  assert.equal(forbiddenImport(source, '@smartgym/catalog'), true);
  assert.equal(forbiddenImport(source, './catalog'), false);
  const backend = resolve('backend/apps/catalog/src/app.ts');
  assert.equal(forbiddenImport(backend, '../../../../frontend/app/catalog.ts'), true);
  assert.equal(forbiddenImport(backend, '../../identity/src/app.ts'), true);
  assert.equal(forbiddenImport(backend, '@smartgym/web'), true);
  assert.equal(forbiddenImport(backend, './database.js'), false);
  assert.deepEqual(await checkBoundaries(), []);
});
