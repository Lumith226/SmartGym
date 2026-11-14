import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { checkHandoff } from '../../scripts/check-ai-handoff.mjs';

const api = JSON.parse(await readFile(new URL('../../docs/api/openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile({ $ref: '#/components/schemas/PoseResult', components: api.components });
const capability = ajv.compile({ $ref: '#/components/schemas/PoseCapability', components: api.components });
// Synthetic API examples only. They establish no model accuracy or inference acceptance.
const result = () => ({
  id: '60000000-0000-4000-8000-000000000001', source: 'VIDEO', exerciseId: 'bodyweight_squat',
  modelVersion: 'ST-GCNpp-V4', configVersion: 'qualcomm-squat-14-clipbatch-v1',
  repCount: null, repCountStatus: 'UNAVAILABLE', reps: [], formStatus: 'ASSESSED',
  limitations: ['Whole-video V4 does not count reps.'],
  completedAt: '2026-11-07T00:00:00Z', expiresAt: '2026-12-07T00:00:00Z',
});

test('whole-video can return assessed form with unavailable rep count', () => {
  assert.equal(validate(result()), true, JSON.stringify(validate.errors));
});

test('missing count is never represented as zero or fabricated per-rep evidence', () => {
  for (const changes of [
    { repCount: 0 }, { repCount: 4 }, { repCountStatus: 'AVAILABLE', repCount: 0 },
    { reps: [{ sequence: 1, endedAtMs: 1000 }] },
  ]) assert.equal(validate({ ...result(), ...changes }), false, JSON.stringify(changes));
  const missing = result(); delete missing.repCountStatus;
  assert.equal(validate(missing), false);
});

test('live count zero is a valid measured value, and unavailable live remains explicit', () => {
  assert.equal(validate({ ...result(), source: 'LIVE', repCountStatus: 'AVAILABLE', repCount: 0 }), true);
  assert.equal(validate({ ...result(), source: 'LIVE' }), true);
  assert.equal(validate({ ...result(), source: 'LIVE', repCountStatus: 'AVAILABLE' }), false);
  for (const value of [-1, 0.5, 501, '0']) {
    assert.equal(validate({ ...result(), source: 'LIVE', repCountStatus: 'AVAILABLE', repCount: value }), false);
  }
});

test('capability distinguishes form analysis from rep counting per mode', () => {
  const value = { exerciseId: 'bodyweight_squat', modelVersion: 'ST-GCNpp-V4', uploadEnabled: true,
    liveEnabled: false, uploadRepCounting: false, liveRepCounting: false, formFeedback: true, limitations: [] };
  assert.equal(capability(value), true);
  delete value.uploadRepCounting;
  assert.equal(capability(value), false);
});

test('handoff check requires explicit provider locations instead of guessing local paths', async () => {
  await assert.rejects(checkHandoff({}), /Explicit/);
});
