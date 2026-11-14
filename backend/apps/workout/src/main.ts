import { createWorkoutApp } from './app.js';
import { loadAuthConfig } from './auth.js';
import { loadCatalogClient } from './modules/plans/catalog-client.js';
import { connectDatabase } from './database.js';

async function main() {
  const port = Number(process.env.WORKOUT_PORT ?? 3444);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Workout port');
  const auth = await loadAuthConfig(), catalog = await loadCatalogClient(), db = connectDatabase();
  let app: Awaited<ReturnType<typeof createWorkoutApp>> | undefined;
  try {
    if (!(await db.query('SELECT 1 FROM workout_migrations WHERE version=3')).rows.length) throw new Error('Migration required');
    app = await createWorkoutApp(db, auth, catalog);
    await app.listen(port, process.env.WORKOUT_HOST ?? '127.0.0.1');
    let closing = false;
    const stop = () => {
      if (closing) return;
      closing = true;
      void app!.close().finally(() => db.close());
    };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log('Workout ready');
  } catch (error) { await app?.close(); await db.close(); throw error; }
}
main().catch(() => { console.error('Workout startup failed; verify config, certificates and schema'); process.exitCode = 1; });
