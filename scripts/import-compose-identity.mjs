import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = process.env.SMARTGYM_LEGACY_DATABASE_URL;
if (!source) throw new Error('Set SMARTGYM_LEGACY_DATABASE_URL to the existing local PostgreSQL');
const { Client } = createRequire(new URL('../backend/services/identity/package.json', import.meta.url))('pg');
const db = new Client({ connectionString: source, connectionTimeoutMillis: 3000 });
let rows;
try {
  await db.connect();
  ({ rows } = await db.query(`
    SELECT u.id, u.email, u.email_normalized, u.display_name, u.time_zone, u.role, u.status,
      u.email_verified_at, u.version, u.created_at, u.updated_at, to_jsonb(u)->>'google_subject' AS google_subject,
      c.password_hash, c.password_changed_at, c.credential_version
    FROM users u JOIN credentials c ON c.user_id=u.id ORDER BY u.id`));
} catch {
  throw new Error('Could not read users from the existing PostgreSQL');
} finally {
  await db.end();
}
if (!rows.length) throw new Error('No legacy accounts found');
const data = Buffer.from(JSON.stringify(rows)).toString('base64');
const sql = `
BEGIN;
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM users) THEN RAISE EXCEPTION 'Identity must be empty for the first import'; END IF;
END $guard$;
CREATE TEMP TABLE account_import ON COMMIT DROP AS
SELECT * FROM jsonb_to_recordset(convert_from(decode('${data}', 'base64'), 'UTF8')::jsonb) AS r(
  id uuid, email text, email_normalized text, display_name text, time_zone text, role text, status text,
  email_verified_at timestamptz, version int, created_at timestamptz, updated_at timestamptz, google_subject text,
  password_hash text, password_changed_at timestamptz, credential_version int
);
INSERT INTO users (id,email,email_normalized,display_name,time_zone,role,status,email_verified_at,version,created_at,updated_at,google_subject)
SELECT id,email,email_normalized,display_name,time_zone,role,status,email_verified_at,version,created_at,updated_at,google_subject FROM account_import;
INSERT INTO credentials (user_id,password_hash,password_changed_at,credential_version)
SELECT id,password_hash,password_changed_at,credential_version FROM account_import;
COMMIT;`;
const proc = spawn('docker', ['compose', '--env-file', '.env', '-f', 'infra/compose.yaml', 'exec', '-T', 'identity-db',
  'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'smartgym_identity', '-d', 'smartgym_identity'],
  { cwd: root, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
const outcome = new Promise((resolve, reject) => {
  proc.once('error', () => reject(new Error('Docker CLI unavailable')));
  proc.once('close', resolve);
});
proc.stdin.on('error', () => {});
proc.stdin.end(sql);
if (await outcome !== 0) throw new Error('Identity import failed. Check that migrations have run and the destination is empty.');
console.log('Imported ' + rows.length + ' accounts into the persistent Identity database.');
