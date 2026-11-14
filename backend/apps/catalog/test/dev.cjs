// Explicit local development entry point. Production uses DATABASE_URL and pg.
const { PGlite } = require('@electric-sql/pglite');
const { mkdir, readFile } = require('node:fs/promises');
const { resolve } = require('node:path');

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Embedded runner is local development only');
  const dataDir = resolve('.local/catalog');
  const ephemeral = process.argv.includes('--ephemeral');
  if (!ephemeral) await mkdir(dataDir, { recursive: true });
  const pg = ephemeral ? new PGlite() : new PGlite(dataDir);
  const wrap = client => ({
    query: async (sql, values) => {
      if (!values) {
        const results = await client.exec(sql);
        return results.at(-1) ?? { rows: [] };
      }
      return client.query(sql, values);
    },
  });
  const database = {
    query: (...args) => pg.query(...args),
    transaction: action => pg.transaction(client => action(wrap(client))),
    close: () => pg.close(),
  };
  let app;
  try {
    const { migrate } = await import('../dist/migrate.js');
    const { createApp } = await import('../dist/app.js');
    await migrate(database);
    if (ephemeral && process.argv.includes('--seed-test-catalog')) {
      const { importSnapshot } = await import('../dist/import.js');
      const snapshot = await readFile(resolve(__dirname, '../data/smartgym-m1.json'), 'utf8');
      await importSnapshot(database, JSON.parse(snapshot), true);
    }
    app = await createApp(database);
    await app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1');
    console.log('Catalog local PostgreSQL embedded listening on ' + await app.getUrl());
    console.log('Development content only. Production requires reviewed content and PostgreSQL server.');
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, async () => { await app.close(); await database.close(); });
    }
  } catch (error) {
    if (app) await app.close();
    await database.close();
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
