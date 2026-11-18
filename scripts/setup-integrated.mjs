import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const rag = join(root, 'services/kb_rag');
const index = join(rag, 'data/releases/six_exercises_20261118_r3');
const snapshotBytes = await readFile(join(index, 'snapshot.json'));
const snapshot = JSON.parse(snapshotBytes);
const dense = JSON.parse(await readFile(join(index, 'embeddings.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(rag, 'data/export/manifest.json'), 'utf8'));
if (createHash('sha256').update(snapshotBytes).digest('hex') !== manifest.snapshot_sha256 ||
    createHash('sha256').update(await readFile(join(rag, 'data/export/smartgym_six_kb.cypher'))).digest('hex') !== manifest.cypher_sha256 ||
    snapshot.version !== dense.kb_version || snapshot.version !== manifest.kb_version) {
  throw new Error('The bundled KB, embedding and export versions do not match');
}
const registry = snapshot.sources.map(s => {
  const url = new URL(s.url);
  if (url.protocol !== 'https:' || url.username) throw new Error('Invalid source origin');
  return { id: s.id, rightsStatus: 'APPROVED', kind: s.format === 'pdf' ? 'BOOK' : 'HTML',
    allowedOrigins: [url.origin], publisher: s.publisher, license: s.license,
    approvalScope: 'Existing academic corpus citation display; not expert approval or a grant to redistribute full documents' };
});
const registryFile = join(root, 'infra/config/rag-sources.integrated.json');
await writeFile(registryFile, JSON.stringify(registry, null, 2) + '\n');
const env = { ...process.env, SMARTGYM_RAG_SOURCE: rag, SMARTGYM_RAG_INDEX_DIR: index,
  SMARTGYM_RAG_SOURCES_FILE: registryFile, SMARTGYM_RAG_PRESERVE_RELEASE: 'true' };
if (process.platform === 'win32' && !env.OPENSSL_BINARY) {
  const gitOpenSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';
  if (existsSync(gitOpenSSL)) {
    env.OPENSSL_BINARY = gitOpenSSL;
    env.OPENSSL_CONF ||= 'C:/Program Files/Git/usr/ssl/openssl.cnf';
  }
}
const result = spawnSync(process.execPath, ['scripts/prepare-compose-local.mjs'],
  { cwd: root, env, stdio: 'inherit', windowsHide: true });
if (result.status !== 0) throw new Error('Local configuration preparation failed');
const file = join(root, '.env');
let content = await readFile(file, 'utf8');
const get = key => {
  const value = content.match(new RegExp('^' + key + '=(.*)$', 'm'))?.[1]?.trim() ?? '';
  if (value.startsWith('"')) return JSON.parse(value);
  return value.replace(/^'|'$/g, '');
};
const set = (key, value, overwrite = true) => {
  const re = new RegExp('^' + key + '=.*$', 'm');
  if (!overwrite && get(key)) return;
  const line = key + '=' + JSON.stringify(String(value));
  content = re.test(content) ? content.replace(re, () => line) : content.trimEnd() + '\n' + line + '\n';
};
// Also support a user who copied .env.example before running setup.
// Preserve credentials already in use; fill only absent/template values.
for (const name of ['catalog', 'identity', 'notification', 'workout', 'progress', 'pose']) {
  const prefix = name.toUpperCase();
  if (!get(prefix + '_DB_PASSWORD') || get(prefix + '_DB_PASSWORD').includes('REPLACE_')) {
    set(prefix + '_DB_PASSWORD', randomBytes(24).toString('base64url'));
  }
  if (!get(prefix + '_DATABASE_URL') || get(prefix + '_DATABASE_URL').includes('REPLACE_')) {
    set(prefix + '_DATABASE_URL', `postgresql://smartgym_${name}:${encodeURIComponent(get(prefix + '_DB_PASSWORD'))}@${name}-db:5432/smartgym_${name}`);
  }
}
set('SMARTGYM_WEB_ORIGIN', 'https://127.0.0.1:3100', false);
for (const [key, value] of Object.entries({
  SMARTGYM_RAG_SOURCE: rag.replaceAll('\\', '/'), SMARTGYM_RAG_INDEX_DIR: index.replaceAll('\\', '/'),
  SMARTGYM_RAG_SOURCES_FILE: registryFile.replaceAll('\\', '/'), SMARTGYM_RAG_PRESERVE_RELEASE: 'true',
  SMARTGYM_WEB_RAG_ENABLED: 'true', SMARTGYM_QWEN_ENABLED: 'false', SMARTGYM_GEMINI_ENABLED: 'false',
  SMARTGYM_CHAT_MODEL: 'qwen3.5:9b', SMARTGYM_EMBED_MODEL: 'qwen3-embedding:0.6b',
})) set(key, value);
set('SMARTGYM_OLLAMA_ORIGIN', 'http://host.docker.internal:11434', false);
set('NEO4J_PASSWORD', randomBytes(24).toString('base64url'), false);
set('SMARTGYM_NEO4J_HTTP_PORT', '7475', false);
set('SMARTGYM_NEO4J_BOLT_PORT', '7688', false);
await writeFile(file, content, { mode: 0o600 });
console.log('Prepared complete KB ' + snapshot.version + '; credentials remain in ignored .env and .local/.');
console.log('No pose-model source or weights are included. Start with: node scripts/start-integrated.mjs --build');
