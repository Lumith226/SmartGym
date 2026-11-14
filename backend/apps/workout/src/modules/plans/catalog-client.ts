import { request } from 'node:https';
import { readFile } from 'node:fs/promises';
import { reject, valid } from '../../contract.js';

export type ExerciseRef = { exerciseId: string; available: boolean; nameVi?: string };
export type CatalogClient = (ids: string[]) => Promise<ExerciseRef[]>;
export async function loadCatalogClient(): Promise<CatalogClient> {
  const origin = process.env.WORKOUT_CATALOG_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || new URL(origin).protocol !== 'https:') throw new Error('Catalog HTTPS origin required');
  const [key, cert, ca] = await Promise.all(['KEY', 'CERT', 'CA'].map(field => {
    const file = process.env['WORKOUT_CATALOG_TLS_' + field + '_FILE'];
    if (!file) throw new Error('Missing Catalog client certificate');
    return readFile(file, 'utf8');
  }));
  return async ids => {
    const exerciseIds = [...new Set(ids)];
    const payload = JSON.stringify({ exerciseIds });
    try {
      const result: unknown = await new Promise((resolve, fail) => {
        const req = request(new URL('/internal/v1/catalog/exercise-refs', origin), {
          key, cert, ca, method: 'POST', agent: false, signal: AbortSignal.timeout(3000),
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
        }, res => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 32768) req.destroy(new Error('Catalog response too large')); else chunks.push(chunk); });
          res.on('error', fail);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200 || !res.headers['content-type']?.startsWith('application/json')) throw new Error('Catalog unavailable');
              resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch (error) { fail(error); }
          });
        });
        req.on('error', fail); req.end(payload);
      });
      if (!valid('ExerciseRefList', result)) throw new Error('Invalid Catalog refs');
      const { items } = result as { items: ExerciseRef[] };
      if (items.length !== exerciseIds.length || new Set(items.map(item => item.exerciseId)).size !== items.length ||
          items.some(item => !exerciseIds.includes(item.exerciseId) || (item.available && !item.nameVi))) throw new Error('Invalid Catalog response');
      return items;
    } catch { reject(503, 'CATALOG_UNAVAILABLE'); }
  };
}
