import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formatsModule from 'ajv-formats';
const ajv = new Ajv2020({ strict: false });
(formatsModule as unknown as (a: Ajv2020) => void)(ajv);
ajv.addSchema(JSON.parse(readFileSync(new URL('../data/contracts.json', import.meta.url), 'utf8')));
export const valid = (name: string, value: unknown) => !!ajv.getSchema('pose-contract#/components/schemas/' + name)?.(value);
export function reject(status: number, code: string): never { throw new HttpException({ code }, status); }
export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const iso = (date: Date | string) => new Date(date).toISOString();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export type Model = { catalogId: string; poseId: string; sha256: string; schemaVersion: string;
  labels: { key: string; kind: string; raw_label: string; threshold: number | null; calibrated: boolean; rep_supported?: boolean }[] };
const manifestBytes = readFileSync(new URL('../data/models.json', import.meta.url));
export const models: Model[] = JSON.parse(manifestBytes.toString('utf8'));
export const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
export function modelOf(id: string) { const model = models.find(m => m.catalogId === id); if (!model) reject(422, 'EXERCISE_UNSUPPORTED'); return model; }
export function validateRaw(model: Model, value: unknown, scope: 'video' | 'window' | 'rep' = 'video'): asserts value is Record<string, any> {
  const r = value as Record<string, any>;
  if (!r || r.exercise !== model.poseId || r.schema_version !== model.schemaVersion || r.scope !== scope ||
      typeof r.quality?.usable !== 'boolean' || !Array.isArray(r.label_results) || r.label_results.length !== model.labels.length) throw new Error('INVALID_ENGINE_RESULT');
  if (r.model_provenance?.model_sha256 && r.model_provenance.model_sha256 !== model.sha256) throw new Error('INVALID_ENGINE_RESULT');
  const seen = new Set();
  for (const row of r.label_results) {
    const expected = model.labels.find(e => e.key === row?.key);
    if (!expected || seen.has(row.key) || row.kind !== expected.kind || row.raw_label !== expected.raw_label) throw new Error('INVALID_ENGINE_RESULT');
    seen.add(row.key);
    if (row.probability !== null && (typeof row.probability !== 'number' || !Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1)) throw new Error('INVALID_ENGINE_RESULT');
    if (row.probability === null && r.quality.usable && expected.calibrated && (scope === 'video' || expected.rep_supported)) throw new Error('INVALID_ENGINE_RESULT');
    if (row.threshold !== null && (typeof row.threshold !== 'number' || expected.threshold === null || Math.abs(row.threshold - expected.threshold) > 1e-6)) throw new Error('INVALID_ENGINE_RESULT');
  }
}
