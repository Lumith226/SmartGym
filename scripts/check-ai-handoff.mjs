import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// Read-only source validation. Never import provider code, copy weights, or run inference.
export async function checkHandoff({ poseRoot, ragRoot }) {
  assert(poseRoot && ragRoot, 'Explicit --pose-root and --rag-root are required');
  const manifest = await json(resolve(project, 'docs/api/ai-provider-compatibility.yaml'));
  const registry = await json(resolve(ragRoot, 'label_catalog_v4.json'));
  const catalog = await json(resolve(project, 'backend/apps/catalog/data/smartgym-m2.json'));
  const catalogIds = new Set(catalog.exercises.map(row => row.id));
  const results = [];
  const ids = new Set();
  for (const model of manifest.models) {
    assert(!ids.has(model.catalog_id), 'Duplicate Catalog mapping');
    ids.add(model.catalog_id);
    assert(catalogIds.has(model.catalog_id), 'Unknown Catalog ID: ' + model.catalog_id);
    for (const name of [model.model_file, model.contract_file]) {
      assert.equal(basename(name), name, 'Manifest filename must not escape weights directory');
      assert(!/[\\/]/.test(name), 'Manifest filename must be a basename');
    }
    const weights = resolve(poseRoot, 'smart_gym_test_rtmpose_v4/weights');
    const registered = registry.exercises[model.rag_code];
    assert(registered, 'Missing RAG exercise: ' + model.rag_code);
    assert.equal(registered.model_exercise, model.pose_id);
    assert.equal(registered.schema_version, model.schema_version);
    assert.equal(registered.model_sha256, model.model_sha256);
    assert.equal(await fileDigest(resolve(weights, model.model_file)), model.model_sha256, 'ONNX digest mismatch: ' + model.pose_id);
    const poseBytes = await readFile(resolve(weights, model.contract_file));
    const ragBytes = await readFile(resolve(ragRoot, 'model_contracts', model.contract_file));
    assert(poseBytes.equals(ragBytes), 'Provider contracts differ: ' + model.pose_id);
    assert.equal(digest(poseBytes), model.contract_bytes_sha256);
    const lfDigest = digest(poseBytes.toString('utf8').replaceAll('\r\n', '\n'));
    assert.equal(lfDigest, model.contract_lf_sha256);
    assert.equal(lfDigest, registered.contract_sha256);
    const contract = JSON.parse(poseBytes.toString('utf8'));
    assert.equal(contract.schema_version, model.schema_version);
    assert.equal(contract.labels.length, model.label_count);
    assert.equal(registered.labels.length, model.label_count);
    assert.equal(contract.frames, registered.frames);
    assert.equal(contract.context_size, registered.context_size);
    const labels = new Map(registered.labels.map(row => [row.key, row]));
    assert.equal(labels.size, model.label_count, 'Duplicate registry label');
    assert.equal(new Set(contract.labels.map(row => row.key)).size, model.label_count, 'Duplicate contract label');
    for (const label of contract.labels) {
      const peer = labels.get(label.key);
      assert(peer, 'Unknown label: ' + label.key);
      for (const key of ['raw_label', 'kind', 'threshold', 'rep_supported', 'calibrated']) {
        assert.deepEqual(label[key], peer[key], model.pose_id + ':' + label.key + ':' + key);
      }
    }
    results.push({ exerciseId: model.catalog_id, labels: model.label_count, status: 'SOURCE_VERIFIED', inference: 'NOT_RUN_BY_THIS_COMMAND' });
  }
  assert.equal(results.length, 4, 'Expected four active V4 mappings');
  return { status: 'PASS', checks: 'ONNX bytes, raw/LF contract hashes, schema, label semantics and preprocessing', models: results, runtime: 'NOT_RUN_BY_THIS_COMMAND', runtimeEvidence: 'docs/api/ai-runtime-verification.yaml' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    assert.equal(args.length, 4, 'Usage: node scripts/check-ai-handoff.mjs --pose-root <Pose repo> --rag-root <kb_rag service>');
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      assert(['--pose-root', '--rag-root'].includes(args[i]), 'Unknown argument');
      assert(!options[args[i]], 'Duplicate argument');
      options[args[i]] = args[i + 1];
    }
    console.log(JSON.stringify(await checkHandoff({ poseRoot: options['--pose-root'], ragRoot: options['--rag-root'] }), null, 2));
  } catch (error) {
    console.error('AI handoff check failed: ' + error.message);
    process.exitCode = 1;
  }
}
