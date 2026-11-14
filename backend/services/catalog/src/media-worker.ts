import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { connectDatabase } from './database.js';
import { loadMediaInspector } from './modules/media/media-inspector.js';
import { MediaJobs } from './modules/media/media-jobs.js';
import { loadMediaConfig } from './modules/media/media-storage.js';

async function main() {
  const config = loadMediaConfig();
  if (!config) throw new Error('Enable Catalog media before starting its worker');
  const inspect = loadMediaInspector(), db = connectDatabase();
  const shutdown = new AbortController();
  process.once('SIGINT', () => shutdown.abort());
  process.once('SIGTERM', () => shutdown.abort());
  const jobs = new MediaJobs(db, config.storage, inspect);
  try {
    const { rows } = await db.query('SELECT 1 FROM catalog_migrations WHERE version=6');
    if (!rows.length) throw new Error('Catalog media migration required');
    while (!shutdown.signal.aborted) {
      let busy = false;
      try {
        busy = await jobs.verifyNext(shutdown.signal);
        busy = await jobs.collectNext(shutdown.signal) || busy;
        if (process.env.SMARTGYM_WORKER_HEARTBEAT === 'true') await writeFile('/tmp/smartgym-worker-ready', '');
      } catch { console.error('Catalog media worker will retry'); }
      if (!busy && !shutdown.signal.aborted) await delay(2000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  } finally { config.close(); await db.close(); }
}

main().catch(() => { console.error('Catalog media worker startup failed'); process.exitCode = 1; });
