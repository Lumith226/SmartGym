import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { connectDatabase, Database } from './database.js';

export async function migrate(database: Database): Promise<void> {
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
  const migrations = await Promise.all(files.map(async file => {
    const sql = await readFile(new URL(file, directory), 'utf8');
    return { version: Number(file.slice(0, 3)), sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  if (migrations.some((migration, index) => migration.version !== index + 1)) {
    throw new Error('Migration sequence must start at 1 and have no gaps');
  }
  await database.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(73001)');
    const exists = await client.query<{ present: string | null }>(
      "SELECT to_regclass('public.catalog_migrations')::text AS present",
    );
    const applied = exists.rows[0].present
      ? (await client.query<{ version: number; checksum: string }>('SELECT version,checksum FROM catalog_migrations ORDER BY version')).rows
      : [];
    for (const [index, row] of applied.entries()) {
      if (row.version !== index + 1 || migrations[index]?.checksum !== row.checksum) {
        throw new Error('Migration checksum or sequence mismatch');
      }
    }
    for (const migration of migrations.slice(applied.length)) {
      await client.query(migration.sql);
      await client.query('INSERT INTO catalog_migrations(version,checksum) VALUES($1,$2)', [migration.version, migration.checksum]);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = connectDatabase();
  migrate(database).finally(() => database.close()).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
