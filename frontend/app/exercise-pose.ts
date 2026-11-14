import { readFile } from 'node:fs/promises';
import { get } from 'node:https';
import { cache } from 'react';
import contracts from '../data/chat-contracts.json';

export const readExercisePoseLinks = cache(async (): Promise<Record<string, string>> => {
  const origin = process.env.BFF_POSE_STUDIO_ENGINE_ORIGIN;
  if (!origin || process.env.BFF_AUTH_ENABLED !== 'true') return {};
  try {
    const files = ['KEY', 'CERT', 'CA'].map(name => process.env['BFF_POSE_STUDIO_TLS_' + name + '_FILE']);
    const [key, cert, ca] = await Promise.all(files.map(file => readFile(/* turbopackIgnore: true */ file ?? '')));
    const payload = await new Promise<string>((resolve, reject) => {
      const request = get(new URL('/api/exercises', origin), {
        key, cert, ca, signal: AbortSignal.timeout(1800), agent: false,
      }, response => {
        response.on('error', reject);
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error('Pose exercise list unavailable'));
          return;
        }
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 128 * 1024) request.destroy(new Error('Pose exercise list too large'));
        });
        response.on('end', () => resolve(body));
      });
      request.on('error', reject);
    });
    const { exercises } = JSON.parse(payload);
    if (!Array.isArray(exercises)) return {};
    const supported = new Set(exercises.map(item => item?.id));
    return Object.fromEntries(contracts.models.filter(model => supported.has(model.exercise))
      .flatMap(({ catalogId, exercise }) => [[catalogId, exercise], ['repdb_' + catalogId, exercise]]));
  } catch {
    return {};
  }
});
