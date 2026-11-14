import { createHash, randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { AuthError } from './identity-client.mjs';

let connection;
async function redis() {
  if (!connection) {
    const client = createClient({ url: process.env.SMARTGYM_REDIS_URL, disableOfflineQueue: true,
      socket: { connectTimeout: 1000, reconnectStrategy: (attempt, cause) => attempt > 2 ? cause : 200 } });
    client.on('error', () => {});
    connection = client.connect().catch(error => { connection = undefined; throw error; });
    client.on('end', () => { connection = undefined; });
  }
  return connection;
}

const claim = `
  if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
  if tonumber(redis.call('GET', KEYS[1]) or '0') >= 5 then return 0 end
  redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[2])
  if redis.call('INCR', KEYS[1]) == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
  return 1
`;
const release = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
  return 0
`;

export async function claimSharedChat(key, deadlineMs) {
  const id = createHash('sha256').update(key).digest('hex');
  const prefix = 'smartgym:chat:{' + id + '}:';
  const token = randomUUID();
  let client, allowed;
  try {
    client = await redis();
    allowed = await client.withCommandOptions({ abortSignal: AbortSignal.timeout(800) }).eval(claim, {
      keys: [prefix + 'count', prefix + 'lease'], arguments: [token, String(deadlineMs + 5000)],
    });
  } catch {
    throw new AuthError(503, 'RAG_UNAVAILABLE');
  }
  if (!allowed) throw new AuthError(429, 'RATE_LIMITED');
  return () => { void client.eval(release, { keys: [prefix + 'lease'], arguments: [token] }).catch(() => {}); };
}

/** @param {{ threshold?: number, cooldownMs?: number, clock?: () => number }} [options] */
export function createCircuitBreaker({ threshold = 3, cooldownMs = 15000, clock = Date.now } = {}) {
  let failures = 0;
  let openedUntil = 0;
  let probing = false;
  let generation = 0;

  /** @template T @param {() => Promise<T>} work @param {(result: T) => boolean} unhealthy @param {(error: unknown) => boolean} [ignoreError] */
  return async function run(work, unhealthy, ignoreError = () => false) {
    if (openedUntil && (clock() < openedUntil || probing)) throw new AuthError(503, 'RAG_UNAVAILABLE');
    const probe = Boolean(openedUntil);
    if (probe) probing = true;
    const started = generation;
    const complete = failed => {
      if (started !== generation) return;
      if (!failed) {
        failures = 0;
        openedUntil = 0;
      } else if (probe || ++failures >= threshold) {
        openedUntil = clock() + cooldownMs;
        generation++;
      }
    };
    try {
      const result = await work();
      complete(unhealthy(result));
      return result;
    } catch (error) {
      if (!ignoreError(error)) complete(true);
      throw error;
    } finally {
      if (probe) probing = false;
    }
  };
}
