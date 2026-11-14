import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const api = JSON.parse(await readFile(new URL('docs/api/openapi.yaml', root), 'utf8'));
const names = ['ExerciseDraftCreate', 'ExerciseDraftUpdate', 'CmsArchiveReason', 'Jwks', 'CmsContentCreate', 'CmsContentUpdate',
  'CmsRestoreRevision', 'CmsMediaUploadRequest', 'CmsImportRequest', 'CmsImportCommit', 'ExerciseRefBatch',
  'ExerciseProfile', 'ExerciseImageRoles', 'PoseExerciseLinkUpdate'];
const content = JSON.stringify(Object.fromEntries(names.map(name => [name, api.components.schemas[name]])), null, 2)
  .replaceAll('#/components/schemas/ExerciseProfile', 'ExerciseProfile')
  .replaceAll('#/components/schemas/ExerciseImageRoles', 'ExerciseImageRoles') + '\n';
const target = new URL('backend/apps/catalog/data/admin.schemas.json', root);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== content) throw new Error('Stale Catalog admin schemas');
  console.log('Catalog admin schemas match OpenAPI');
} else await writeFile(target, content);
