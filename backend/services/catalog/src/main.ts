import { createApp } from './app.js';
import { connectDatabase } from './database.js';
import { loadAdminConfig } from './modules/admin/admin-auth.js';
import { createAdminApp } from './admin-app.js';
import { loadMediaConfig } from './modules/media/media-storage.js';

async function main() {
  const database = connectDatabase();
  const apps: { close(): Promise<void> }[] = [];
  let media: ReturnType<typeof loadMediaConfig>;
  try {
    media = loadMediaConfig();
    const app = await createApp(database, media?.storage);
    apps.push(app);
    const port = Number(process.env.PORT ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
    await app.listen(port, process.env.HOST ?? '127.0.0.1');
    const config = await loadAdminConfig();
    if (config) {
      const adminPort = Number(process.env.CATALOG_ADMIN_PORT ?? 3101);
      if (!Number.isInteger(adminPort) || adminPort < 1 || adminPort > 65535 || adminPort === port) throw new Error('Invalid admin port');
      const admin = await createAdminApp(database, config, media);
      apps.push(admin);
      await admin.listen(adminPort, process.env.CATALOG_ADMIN_HOST ?? '127.0.0.1');
    }
    let stopping = false;
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        if (stopping) return;
        stopping = true;
        void Promise.allSettled(apps.map(item => item.close())).then(() => { media?.close(); return database.close(); });
      });
    }
    console.log('Catalog listening on port ' + port);
  } catch (error) {
    await Promise.allSettled(apps.map(item => item.close()));
    media?.close();
    await database.close();
    throw error;
  }
}
main().catch(() => { console.error('Catalog startup failed. Check configuration and database.'); process.exitCode = 1; });
