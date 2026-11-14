import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, Database } from './database.js';

export async function migrate(database: Database): Promise<void> {
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
  const migrations = await Promise.all(files.map(async file => {
    const sql = await readFile(new URL(file, directory), 'utf8');
    return { version: Number(file.slice(0, 3)), sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  if (!migrations.length || migrations.some((m, i) => m.version !== i + 1)) throw new Error('Invalid Identity migration sequence');
  await database.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(74001)');
    const exists = await client.query<{ present: string | null }>("SELECT to_regclass('public.identity_migrations')::text AS present");
    const applied = exists.rows[0].present ? (await client.query<{ version: number; checksum: string }>(
      'SELECT version,checksum FROM identity_migrations ORDER BY version')).rows : [];
    for (const [i, row] of applied.entries()) if (row.version !== i + 1 || row.checksum !== migrations[i]?.checksum) throw new Error('Identity migration checksum or sequence mismatch');
    for (const m of migrations.slice(applied.length)) {
      await client.query(m.sql);
      await client.query('INSERT INTO identity_migrations(version,checksum) VALUES($1,$2)', [m.version, m.checksum]);
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = connectDatabase();
  migrate(database).finally(() => database.close()).catch(() => { console.error('Identity migration failed; check connectivity and migration checksums'); process.exitCode = 1; });
}
