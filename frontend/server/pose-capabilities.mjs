import { readFile } from 'node:fs/promises';
import { get } from 'node:https';

/** @typedef {{id: string, name: string, version: string, label_count: number, labels?: unknown[]}} PoseCapability */
/** @returns {Promise<PoseCapability[]>} */
export async function readPoseCapabilities() {
  const origin = process.env.BFF_POSE_STUDIO_ENGINE_ORIGIN;
  if (!origin || process.env.BFF_AUTH_ENABLED !== 'true') throw new Error('Pose Engine unavailable');
  const engine = new URL(origin);
  if (engine.protocol !== 'https:' || engine.origin !== origin) throw new Error('Invalid engine origin');
  const files = ['KEY', 'CERT', 'CA'].map(name => process.env['BFF_POSE_STUDIO_TLS_' + name + '_FILE']);
  const [key, cert, ca] = await Promise.all(files.map(file => readFile(/* turbopackIgnore: true */ file ?? '')));
  const payload = await new Promise((resolve, reject) => {
    const request = get(new URL('/api/exercises', engine), {
      key, cert, ca, signal: AbortSignal.timeout(2000), agent: false,
    }, response => {
      response.on('error', reject);
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('Pose exercise list unavailable'));
        return;
      }
      response.setEncoding('utf8');
      let body = '';
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 128 * 1024) request.destroy(new Error('Pose exercise list too large'));
      });
      response.on('end', () => resolve(body));
    });
    request.on('error', reject);
  });
  const { exercises } = JSON.parse(payload);
  if (!Array.isArray(exercises) || exercises.length > 100) throw new Error('Invalid Pose list');
  const seen = new Set();
  return exercises.map(item => {
    if (typeof item?.id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(item.id) || seen.has(item.id)) {
      throw new Error('Invalid Pose exercise ID');
    }
    seen.add(item.id);
    return { id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 160) : item.id,
      version: typeof item.version === 'string' ? item.version.slice(0, 32) : '',
      label_count: Number.isInteger(item.label_count) ? item.label_count : 0,
      labels: Array.isArray(item.labels) ? item.labels : [] };
  });
}
