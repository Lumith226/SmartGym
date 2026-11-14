import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdtemp, rename, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { aiDirectory, localAIEnv, uvBinary } from './ai-local-env.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('The DirectML profile requires Windows x64');
}

const root = fileURLToPath(new URL('../', import.meta.url));
const config = resolve(root, process.env.SMARTGYM_CONFIG_DIR || '.local/compose');
const source = resolve(root, process.env.SMARTGYM_POSE_SOURCE || '../SmartGym');
const python = join(aiDirectory, 'pose-env/Scripts/python.exe');
const provider = join(aiDirectory, 'pose-directml-1.24.4');
const engineSecrets = join(config, 'pose-engine');
const key = join(engineSecrets, 'host-server.key');
const cert = join(engineSecrets, 'host-server.crt');
const env = await localAIEnv();
const exec = promisify(execFile);
const exists = path => access(path).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

await access(python);
if (!await exists(provider)) {
  const staging = await mkdtemp(join(aiDirectory, 'directml-install-'));
  try {
    await exec(uvBinary, ['pip', 'install', '--python', python, '--target', staging, '--no-deps',
      '--require-hashes', '-r', join(root, 'infra/ai/pose-directml.windows-x64.lock.txt')],
    { env, windowsHide: true, timeout: 180000 });
    await rename(staging, provider);
  } finally {
    if (staging.startsWith(aiDirectory.endsWith(sep) ? aiDirectory : aiDirectory + sep)) {
      await rm(staging, { recursive: true, force: true });
    }
  }
}

if (!await exists(key) || !await exists(cert)) {
  if (await exists(key) || await exists(cert)) throw new Error('Incomplete DirectML host certificate pair');
  const staging = await mkdtemp(join(engineSecrets, 'host-tls-'));
  const openssl = process.env.OPENSSL_BINARY || 'openssl';
  const run = args => exec(openssl, args, { cwd: staging, env, windowsHide: true, timeout: 30000 });
  try {
    await run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr',
      '-subj', '/CN=SmartGym Pose DirectML host',
      '-addext', 'subjectAltName=DNS:host.docker.internal,DNS:localhost,IP:127.0.0.1',
      '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'extendedKeyUsage=serverAuth']);
    await run(['x509', '-req', '-in', 'server.csr', '-CA', join(config, 'ca/pose-engine.crt'),
      '-CAkey', join(config, 'ca/pose-engine.key'), '-set_serial', '0x' + randomBytes(16).toString('hex'),
      '-out', 'server.crt', '-days', '365', '-copy_extensions', 'copy']);
    await rename(join(staging, 'server.key'), key);
    await rename(join(staging, 'server.crt'), cert);
  } finally {
    if (staging.startsWith(engineSecrets + sep)) await rm(staging, { recursive: true, force: true });
  }
}

const child = spawn(python, ['-B', join(root, 'backend/apps/pose/engine/main.py'),
  '--device', 'dml', '--source', source, '--host', process.env.SMARTGYM_POSE_DIRECTML_BIND || '127.0.0.1',
  '--port', process.env.SMARTGYM_POSE_DIRECTML_PORT || '8002', '--key', key, '--cert', cert, '--ca', join(engineSecrets, 'ca.crt')],
{ cwd: root, env: { ...env, PYTHONPATH: provider, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' },
  windowsHide: true, stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
