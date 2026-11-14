import { connectDatabase } from './database.js';
import { loadAuthConfig } from './auth.js';
import { loadStorage } from './modules/analysis/storage.js';
import { createPoseApp } from './app.js';
import { loadEngine } from './engine.js';
async function main() {
  const db = connectDatabase(), storage = loadStorage();
  const consent = process.env.POSE_CONSENT_VERSION;
  if (!consent) throw new Error('Pose consent policy required');
  const engine = process.env.POSE_LIVE_ENABLED === 'true' ? await loadEngine() : undefined;
  const { app, stopLive } = await createPoseApp(db, storage.storage, await loadAuthConfig(), consent, process.env.POSE_UPLOAD_ENABLED === 'true', process.env.POSE_S3_PREFIX, engine);
  const port = Number(process.env.POSE_PORT ?? 3443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Pose port');
  await app.listen(port, process.env.POSE_HOST ?? '127.0.0.1');
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => { stopLive(); void app.close().then(() => db.close()).finally(() => storage.close()); });
}
main().catch(() => { console.error('Pose startup failed. Check private configuration.'); process.exitCode = 1; });
