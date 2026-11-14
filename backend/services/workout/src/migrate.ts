import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, type Database } from './database.js';
export async function migrate(database: Database) {
  const dir = new URL('../migrations/', import.meta.url);
  const files = (await readdir(dir)).filter(name => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(files.map(async (name, i) => {
    const version = Number(name.slice(0, 3));
    if (version !== i + 1) throw new Error('Workout migration sequence mismatch');
    const sql = await readFile(new URL(name, dir), 'utf8');
    return { version, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  await database.transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(73020)');
    const exists = (await db.query("SELECT to_regclass('public.workout_migrations') AS present")).rows[0].present;
    const rows = exists ? (await db.query('SELECT version,checksum FROM workout_migrations ORDER BY version')).rows : [];
    if (exists && rows.length === 0 || rows.some((row, i) => row.version !== i + 1 || row.checksum !== migrations[i]?.checksum)) throw new Error('Workout migration history mismatch');
    for (const { version, sql, checksum } of migrations.slice(rows.length)) {
      await db.query(sql);
      await db.query('INSERT INTO workout_migrations VALUES($1,$2)', [version, checksum]);
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = connectDatabase();
  migrate(db).finally(() => db.close()).catch(() => { console.error('Workout migration failed'); process.exitCode = 1; });
}
