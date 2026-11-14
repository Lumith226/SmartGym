import { connectDatabase } from './database.js';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

async function main() {
  const config = await loadConfig(), port = Number(process.env.PORT ?? '3002');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const database = connectDatabase();
  try {
    const { app, identity } = await createApp(database, config);
    // Scrub expired encrypted delivery tokens before listening, then every minute.
    await identity.cleanup();
    await app.listen(port, process.env.HOST ?? '127.0.0.1');
    let cleaning = false;
    const timer = setInterval(async () => {
      if (cleaning) return; cleaning = true;
      try { await identity.cleanup(); } catch { console.error('Identity cleanup unavailable'); } finally { cleaning = false; }
    }, 60000).unref();
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; clearInterval(timer); await app.close(); await database.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log('Identity listening on configured HTTPS endpoint');
  } catch (error) { await database.close(); throw error; }
}
main().catch(() => { console.error('Identity startup failed; verify secrets, TLS, database and migrations'); process.exitCode = 1; });
