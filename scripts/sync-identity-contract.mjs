import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const spec = JSON.parse(await readFile(new URL('docs/api/openapi.yaml', root), 'utf8'));
const names = ['RegisterRequest', 'LoginRequest', 'EmailRequest', 'TokenRequest', 'ResetPasswordRequest',
  'ProfileUpdate', 'IdentityIntrospection', 'GoogleLoginIdentity'];
const schemas = Object.fromEntries(names.map(name => [name, spec.components.schemas[name]]));
const output = JSON.stringify(schemas, null, 2) + '\n';
const target = new URL('backend/apps/identity/data/http.schemas.json', root);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== output) throw new Error('Identity request schemas are stale: run node scripts/sync-identity-contract.mjs');
  console.log('Identity generated request schemas match OpenAPI');
} else {
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, output);
}
