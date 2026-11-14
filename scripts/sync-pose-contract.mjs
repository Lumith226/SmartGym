import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const api = JSON.parse(await readFile(new URL('docs/api/openapi.yaml', root), 'utf8'));
const names = new Set(['Jwks', 'PoseUploadRequest', 'PoseJobCreate', 'PoseJob', 'PoseResult', 'PoseCapabilityList', 'PoseLiveCreate', 'PoseLiveSession']);
for (const name of names) for (const match of JSON.stringify(api.components.schemas[name]).matchAll(/#\/components\/schemas\/(\w+)/g)) names.add(match[1]);
const content = JSON.stringify({ $id: 'pose-contract', components: { schemas: Object.fromEntries([...names].map(name => [name, api.components.schemas[name]])) } }, null, 2) + '\n';
const target = new URL('backend/apps/pose/data/contracts.json', root);
const webNames = ['PoseLiveCreate','PoseLiveSession','PoseResult','PoseRep','PoseUploadRequest','PoseUpload','PoseJobCreate','PoseJob','PoseCapabilityList','PoseCapability'];
const web = JSON.stringify({ $id: 'web-pose-live', components: { schemas: Object.fromEntries(webNames.map(name => [name, api.components.schemas[name]])) } }, null, 2) + '\n';
const webTarget = new URL('frontend/data/pose-live-contracts.json', root);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== content) throw new Error('Stale Pose contracts');
  if ((await readFile(webTarget, 'utf8')).replaceAll('\r\n', '\n') !== web) throw new Error('Stale Web Pose live contracts');
  console.log('Pose generated schemas match OpenAPI');
} else { await writeFile(target, content); await writeFile(webTarget, web); }
