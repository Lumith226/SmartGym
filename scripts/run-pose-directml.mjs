import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
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
const statusFile = join(config, 'web', 'pose-startup.json');
const key = join(engineSecrets, 'host-server.key');
const cert = join(engineSecrets, 'host-server.crt');
const env = await localAIEnv();
const exec = promisify(execFile);
const exists = path => access(path).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

const mode = process.argv[2] ?? 'dml';
if (!['dml', 'auto'].includes(mode) || process.argv.length > 3) throw new Error('Expected dml or auto');
const port = Number(process.env.SMARTGYM_POSE_DIRECTML_PORT || '8002');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Pose port');

function portIsListening() {
  return new Promise(resolve => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}
// A previous scheduled process may still be releasing its socket.
if (mode === 'auto' && await portIsListening()) process.exit(0);

const log = process.env.SMARTGYM_POSE_BACKGROUND === '1'
  ? await open(join(aiDirectory, 'pose-directml-start.log'), 'a') : null;
function report(message) {
  if (log) void log.appendFile(`${new Date().toISOString()} ${message}\n`).catch(() => {});
  else console.error(message);
}
async function publish(stage) {
  const temp = `${statusFile}.${process.pid}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({ stage, updatedAt: Date.now() }));
    await rename(temp, statusFile);
  } catch {
    await rm(temp, { force: true }).catch(() => {});
  }
}

async function prepareDirectML() {
  if (await exists(provider)) return;
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

await publish('checking_runtime');
try {
  await access(python);
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
} catch (error) {
  await publish('failed');
  report(error.message);
  throw error;
}

let child;
let stopping = false;
function runEngine(device) {
  return new Promise((resolve, reject) => {
    child = spawn(python, ['-B', join(root, 'backend/apps/pose/engine/main.py'),
      '--device', device, '--source', source, '--host', process.env.SMARTGYM_POSE_DIRECTML_BIND || '127.0.0.1',
      '--port', String(port), '--key', key, '--cert', cert, '--ca', join(engineSecrets, 'ca.crt')],
    { cwd: root, env: { ...env, PYTHONPATH: device === 'dml' ? provider : '', OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' },
      windowsHide: true, stdio: log ? ['ignore', log.fd, log.fd] : 'inherit' });
    let statusWrite = Promise.resolve();
    const check = setInterval(() => {
      const socket = connect(port, '127.0.0.1');
      socket.once('error', () => socket.destroy());
      socket.once('connect', () => {
        socket.destroy();
        clearInterval(check);
        if (child.exitCode === null && child.signalCode === null) statusWrite = publish('listening');
      });
    }, 1000);
    child.once('error', error => { clearInterval(check); reject(error); });
    child.once('exit', code => { clearInterval(check); void statusWrite.then(() => resolve(code ?? 1)); });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopping = true;
  child?.kill(signal);
});
try {
  await publish('checking_gpu');
  await prepareDirectML();
  if (!stopping) {
    await publish('warming_gpu');
    process.exitCode = await runEngine('dml');
  }
} catch (error) {
  report(error.message);
  process.exitCode = 1;
}
if (!stopping && mode === 'auto' && process.exitCode !== 0) {
  if (await portIsListening()) process.exit(0);
  report('Pose DirectML failed. Starting CPU at the same endpoint.');
  await publish('starting_cpu');
  process.exitCode = await runEngine('cpu');
}
await publish(stopping || !process.exitCode ? 'stopped' : 'failed');
await log?.close();
