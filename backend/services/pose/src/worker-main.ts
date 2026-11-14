import { isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { connectDatabase } from './database.js';
import { loadStorage } from './modules/analysis/storage.js';
import { loadEngine } from './engine.js';
import { PoseWorker } from './modules/analysis/worker.js';
async function main() {
  const ffmpeg = process.env.POSE_FFMPEG, ffprobe = process.env.POSE_FFPROBE, temp = process.env.POSE_TEMP_DIR;
  if (!ffmpeg || !ffprobe || !temp || ![ffmpeg,ffprobe,temp].every(isAbsolute)) throw new Error('Worker needs configured absolute tool/temp paths');
  const db = connectDatabase(), storage = loadStorage();
  const stop = new AbortController();
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => stop.abort());
  try {
    const worker = new PoseWorker(db, storage.storage, await loadEngine(), { ffmpeg, ffprobe, temp });
    await storage.storage.ready();
    while (!stop.signal.aborted) {
      try {
        const worked = await worker.runNext(stop.signal);
        await worker.collectNext(AbortSignal.any([stop.signal, AbortSignal.timeout(10000)]));
        if (!worked) await delay(500, undefined, { signal: stop.signal });
      } catch { if (!stop.signal.aborted) await delay(1000); }
    }
  } finally { await db.close(); storage.close(); }
}
main().catch(() => { console.error('Pose worker failed. Check private configuration.'); process.exitCode = 1; });
