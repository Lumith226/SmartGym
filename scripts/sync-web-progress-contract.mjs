import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const api = JSON.parse(await readFile(new URL('docs/api/openapi.yaml', root), 'utf8'));
const names = new Set(['listWorkoutLogs','createWorkoutLog','getWorkoutLog','updateWorkoutLog','deleteWorkoutLog','getProgressSummary','importPoseResult']);
const schemaNames = new Set(['Problem']), operations = [];
const nameOf = content => content?.['application/json']?.schema?.$ref?.split('/').at(-1);
for (const [path, item] of Object.entries(api.paths)) for (const [method, op] of Object.entries(item)) {
  if (!names.has(op.operationId)) continue;
  const [status, response] = Object.entries(op.responses).find(([code]) => code.startsWith('2'));
  const input = nameOf(op.requestBody?.content), output = nameOf(response.content);
  if (input) schemaNames.add(input); if (output) schemaNames.add(output);
  const parameters = op.parameters ?? [];
  operations.push({ path, method: method.toUpperCase(), name: op.operationId, public: op.operationId === 'listExercises',
    status: Number(status), input, output, errors: Object.keys(op.responses).filter(code => !code.startsWith('2')).map(Number),
    paths: Object.fromEntries(parameters.filter(p => p.in === 'path').map(p => [p.name, p.schema])),
    queries: Object.fromEntries(parameters.filter(p => p.in === 'query').map(p => [p.name, p.schema])),
    requiredQueries: parameters.filter(p => p.in === 'query' && p.required).map(p => p.name),
    headers: Object.fromEntries(parameters.filter(p => p.in === 'header' && p.name !== 'X-SmartGym-CSRF').map(p => [p.name.toLowerCase(), p.schema])),
    etag: Boolean(response.headers?.ETag), location: Boolean(response.headers?.Location) });
}
if (operations.length !== names.size) throw Error('Unexpected Progress operation count');
for (const name of schemaNames) for (const ref of JSON.stringify(api.components.schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g)) schemaNames.add(ref[1]);
const schemas = Object.fromEntries([...schemaNames].map(name => [name, JSON.parse(JSON.stringify(api.components.schemas[name]).replaceAll('#/components/schemas/', '#/$defs/'))]));
const result = JSON.stringify({ schemas, operations }, null, 2) + '\n';
const file = new URL('frontend/data/progress-contracts.json', root);
if (process.argv.includes('--check')) {
  if ((await readFile(file, 'utf8')).replaceAll('\r\n', '\n') !== result) throw Error('Stale Web Progress contracts');
  console.log('Web Progress contracts match OpenAPI');
} else await writeFile(file, result);
