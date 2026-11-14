import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = process.env.SMARTGYM_LEGACY_DATABASE_URL;
if (!source) throw new Error('Set SMARTGYM_LEGACY_DATABASE_URL to the existing local PostgreSQL');
const migrations = new URL('../backend/services/catalog/migrations/', import.meta.url);
const files = (await readdir(migrations)).filter(file => /^\d{3}_.+\.sql$/.test(file));
const migrationSql = await Promise.all(files.map(file => readFile(new URL(file, migrations), 'utf8')));
const tables = [...new Set(migrationSql.flatMap(sql => [...sql.matchAll(/CREATE TABLE\s+([a-z_]+)\s*\(/gi)].map(match => match[1])))]
  .filter(table => table !== 'catalog_migrations');
if (!tables.includes('exercises') || !tables.includes('support_revisions')) throw new Error('Could not identify Catalog tables');

const { Client } = createRequire(new URL('../backend/services/catalog/package.json', import.meta.url))('pg');
const db = new Client({ connectionString: source, connectionTimeoutMillis: 3000 });
let schema;
try {
  await db.connect();
  schema = (await db.query('SELECT version,checksum FROM catalog_migrations ORDER BY version')).rows;
} catch {
  throw new Error('Could not read Catalog schema history from the existing PostgreSQL');
} finally {
  await db.end();
}
if (schema.length !== files.length) throw new Error('Legacy Catalog is missing migrations');

function completion(child, message) {
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(message)));
    child.once('close', code => code === 0 ? resolve() : reject(new Error(message)));
  });
}

const url = new URL(source);
const dump = spawn(process.env.SMARTGYM_PG_DUMP || 'pg_dump', [
  '--no-password', '--data-only', '--disable-triggers', '--no-owner', '--no-privileges',
  ...tables.flatMap(table => ['--table', 'public.' + table]),
], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) },
});
const dumpDone = completion(dump, 'Catalog pg_dump failed');
const chunks = [];
for await (const chunk of dump.stdout) chunks.push(chunk);
await dumpDone;

const expected = Buffer.from(JSON.stringify(schema)).toString('base64');
const guard = `BEGIN;
DO $guard$ BEGIN
  IF (SELECT jsonb_agg(to_jsonb(history) ORDER BY version) FROM (SELECT version,checksum FROM catalog_migrations) history)
    IS DISTINCT FROM convert_from(decode('${expected}', 'base64'), 'UTF8')::jsonb THEN
    RAISE EXCEPTION 'Catalog schemas do not match';
  END IF;
  IF ${tables.map(table => 'EXISTS (SELECT 1 FROM public.' + table + ')').join(' OR ')} THEN
    RAISE EXCEPTION 'Catalog destination must be empty';
  END IF;
END $guard$;
`;
const restore = spawn('docker', ['compose', '--env-file', '.env', '-f', 'infra/compose.yaml', 'exec', '-T', 'catalog-db',
  'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'smartgym_catalog', '-d', 'smartgym_catalog'],
  { cwd: root, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
const restoreDone = completion(restore, 'Catalog import failed. Check matching schemas and an empty destination.');
restore.stdin.on('error', () => {});
restore.stdin.end(Buffer.concat([Buffer.from(guard), ...chunks, Buffer.from('\nCOMMIT;\n')]));
await restoreDone;
console.log('Imported Catalog data and publication history into its persistent Docker database.');
