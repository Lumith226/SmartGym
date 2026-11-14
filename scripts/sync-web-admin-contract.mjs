import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const api = JSON.parse(await readFile(new URL('docs/api/openapi.yaml', root), 'utf8'));
const names = new Set(['getCatalogAdminStats', 'listAdminExercises', 'createExerciseDraft', 'getAdminExercise', 'updateExerciseDraft',
  'publishExercise', 'unpublishExercise', 'restoreExercise', 'deleteArchivedExercise', 'listCatalogAudit', 'listCmsAudit',
  'listCmsContent', 'createCmsContent', 'getCmsContent', 'updateCmsContent', 'publishCmsContent', 'archiveCmsContent', 'restoreCmsContent',
  'listCmsRevisions', 'getCmsRevision', 'restoreCmsRevision',
  'createCatalogImport', 'getCatalogImport', 'applyCatalogImport', 'exportCatalogPublication',
  'createCmsMediaUpload', 'getCmsMediaUpload', 'completeCmsMediaUpload', 'getCmsMediaPreview',
  'listAdminPoseExerciseLinks', 'updateAdminPoseExerciseLink']);
const schemaNames = new Set(['Problem']);
const operations = [];
const schemaName = content => content?.['application/json']?.schema?.$ref?.split('/').at(-1);
for (const [path, item] of Object.entries(api.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!names.has(operation.operationId)) continue;
    const [status, response] = Object.entries(operation.responses).find(([code]) => code.startsWith('2'));
    const input = schemaName(operation.requestBody?.content), output = schemaName(response.content);
    if (input) schemaNames.add(input);
    schemaNames.add(output);
    operations.push({
      path, method: method.toUpperCase(), status: Number(status), input, output,
      errors: Object.keys(operation.responses).filter(code => !code.startsWith('2')).map(Number),
      pathParameters: Object.fromEntries((operation.parameters ?? []).filter(p => p.in === 'path').map(p => [p.name, p.schema])),
      queries: Object.fromEntries((operation.parameters ?? []).filter(p => p.in === 'query').map(p => [p.name, p.schema])),
      headers: Object.fromEntries((operation.parameters ?? []).filter(p => p.in === 'header' && p.name !== 'X-SmartGym-CSRF').map(p => [p.name.toLowerCase(), p.schema])),
      etag: Boolean(response.headers?.ETag), location: Boolean(response.headers?.Location),
    });
  }
}
if (operations.length !== names.size) throw new Error('Unexpected count of Web admin operations');
for (const name of schemaNames) {
  for (const match of JSON.stringify(api.components.schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g)) schemaNames.add(match[1]);
}
const schemas = Object.fromEntries([...schemaNames].map(name => [name,
  JSON.parse(JSON.stringify(api.components.schemas[name]).replaceAll('#/components/schemas/', '#/$defs/')),
]));
const content = JSON.stringify({ schemas, operations }, null, 2) + '\n';
const target = new URL('frontend/data/admin-contracts.json', root);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== content) throw new Error('Stale Web admin contracts');
  console.log('Web admin contracts match OpenAPI');
} else await writeFile(target, content);
