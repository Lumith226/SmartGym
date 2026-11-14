import { connectDatabase } from './database.js';
import { ScheduleMaterializer } from './modules/scheduling/materializer.js';

async function main() {
  const db = connectDatabase();
  let stopped = false;
  let wake: (() => void) | undefined;
  const stop = () => { stopped = true; wake?.(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    if (!(await db.query('SELECT 1 FROM workout_migrations WHERE version=3')).rows.length) throw Error('Migration required');
    const worker = new ScheduleMaterializer(db);
    console.log('Workout materializer ready');
    while (!stopped) {
      try {
        const result = await worker.tick();
        if (result.failed) console.error('Workout projection failed; retry scheduled');
        if (result.processed === 20) continue;
      } catch { console.error('Workout projection unavailable; retry pending'); }
      if (!stopped) await new Promise<void>(resolve => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, 1000);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    }
  } finally { await db.close(); }
}
main().catch(() => { console.error('Workout materializer startup failed'); process.exitCode = 1; });
