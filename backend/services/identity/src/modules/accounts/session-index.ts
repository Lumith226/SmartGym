import { createClient } from 'redis';

const url = process.env.SMARTGYM_REDIS_URL;
const index = url && createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 1000 } });
if (index) {
  index.on('error', () => {});
  void index.connect().catch(() => {});
}

export function findSessionOwner(hash: string) {
  return index && index.isReady
    ? index.withCommandOptions({ abortSignal: AbortSignal.timeout(250) }).get('smartgym:identity:session:' + hash).catch(() => null)
    : Promise.resolve(null);
}

export function rememberSessionOwner(hash: string, owner: string) {
  if (index && index.isReady) {
    void index.set('smartgym:identity:session:' + hash, owner, { expiration: { type: 'EX', value: 3600 } }).catch(() => {});
  }
}
