import { createClient } from 'redis';

const url = process.env.SMARTGYM_REDIS_URL;
const cache = url && createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 1000 } });
if (cache) {
  cache.on('error', () => {});
  void cache.connect().catch(() => {});
}

export async function cachedExercise<T>(id: string, version: number, load: () => Promise<T>): Promise<T> {
  if (!cache || !cache.isReady) return load();
  const key = `smartgym:catalog:exercise:${id}:${version}`;
  try {
    const value = await cache.withCommandOptions({ abortSignal: AbortSignal.timeout(250) }).get(key);
    if (value !== null) return JSON.parse(value) as T;
  } catch {
    return load();
  }
  const result = await load();
  if (result) void cache.set(key, JSON.stringify(result), { expiration: { type: 'EX', value: 300 } }).catch(() => {});
  return result;
}
