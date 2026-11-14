import { execFile, spawn } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { aiDirectory, localAIEnv } from './ai-local-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '--env-file', '.env', '-f', 'infra/compose.yaml'];
const cudaCompose = ['-f', 'infra/compose.pose-cuda.yaml'];
const cpuOrigin = 'https://pose-engine:8001';
const env = { ...process.env };
const mode = env.SMARTGYM_POSE_ACCELERATION || 'auto';
const args = process.argv.slice(2);

if (!['auto', 'cpu'].includes(mode) || args.some(arg => arg !== '--build')) {
  throw new Error('Usage: pnpm start:local [--build], SMARTGYM_POSE_ACCELERATION=auto|cpu');
}
if (env.SMARTGYM_OTEL_DISABLED === 'false') compose.push('--profile', 'observability');

const exec = promisify(execFile);
const run = (program, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: root, env, stdio: 'inherit', windowsHide: true, ...options });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${program} exited with ${signal ?? code}`));
  });
});
const runScript = (file, ...args) => run(process.execPath, [join(root, 'scripts', file), ...args]);

async function dockerHasNvidiaGpu() {
  try {
    const { stdout } = await exec('docker', ['run', '--rm', '--gpus', 'all', '--network', 'none',
      '--env', 'NVIDIA_DRIVER_CAPABILITIES=utility',
      '--entrypoint', 'nvidia-smi', 'python:3.12-slim-bookworm', '--list-gpus'],
    { cwd: root, env, windowsHide: true, timeout: 30000 });
    return /(?:^|\n)GPU \d+:/.test(stdout);
  } catch {
    return false;
  }
}

function probeDirectML(tls, port) {
  return new Promise((resolve, reject) => {
    const req = request(`https://127.0.0.1:${port}/api/health`, {
      ...tls,
      signal: AbortSignal.timeout(2000),
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('error', reject);
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 16384) res.destroy(new Error('Pose health response too large'));
      });
      res.on('end', () => {
        try {
          const health = JSON.parse(body);
          resolve(res.statusCode === 200 && health.ready === true && health.runtime?.device === 'dml'
            && health.runtime.pose_providers?.[0] === 'DmlExecutionProvider'
            && health.runtime.detector_providers?.[0] === 'DmlExecutionProvider');
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function preparePoseRuntime() {
  const python = join(aiDirectory, 'pose-env', 'Scripts', 'python.exe');
  const pythonEnv = await localAIEnv();
  const canImportPose = () => exec(python, ['-I', '-c', 'import onnxruntime, rtmlib, fastapi, uvicorn, torch'],
    { env: pythonEnv, windowsHide: true, timeout: 30000 }).then(() => true, () => false);
  if (await canImportPose()) return;
  await runScript('prepare-ai-tools.mjs');
  await runScript('prepare-ai-runtime.mjs');
  await runScript('ai-dependencies.mjs', 'install', 'pose');
}

async function startDirectML() {
  const port = Number(env.SMARTGYM_POSE_DIRECTML_PORT || '8002');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DirectML port.');
  const webSecrets = resolve(root, env.SMARTGYM_CONFIG_DIR || '.local/compose', 'web');
  const tls = Object.fromEntries(await Promise.all([
    ['ca', 'pose-studio-ca.crt'], ['cert', 'pose-studio-client.crt'], ['key', 'pose-studio-client.key'],
  ].map(async ([kind, file]) => [kind, await readFile(join(webSecrets, file))])));

  let child;
  let startupError;
  const logPath = join(aiDirectory, 'pose-directml-start.log');
  try {
    const ready = await probeDirectML(tls, port).catch(error => {
      if (error.code === 'ECONNREFUSED') return null;
      if (error.name === 'AbortError') return false;
      throw error;
    });
    if (ready) return `https://host.docker.internal:${port}`;
    if (ready === null) {
      await preparePoseRuntime();
      const log = await open(logPath, 'a');
      try {
        console.log('Starting Pose DirectML on Windows. Waiting for model warm-up…');
        child = spawn(process.execPath, [join(root, 'scripts/run-pose-directml.mjs')], {
          cwd: root,
          env: { ...env, SMARTGYM_POSE_BACKGROUND: '1', SMARTGYM_POSE_DIRECTML_BIND: '127.0.0.1',
            SMARTGYM_POSE_DIRECTML_PORT: String(port) },
          stdio: ['ignore', log.fd, log.fd],
          detached: true,
          windowsHide: true,
        });
        child.once('error', error => { startupError = error; });
        child.unref();
      } finally {
        await log.close();
      }
    }
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (child && (child.exitCode !== null || child.signalCode !== null)) break;
      if (await probeDirectML(tls, port).catch(() => false)) return `https://host.docker.internal:${port}`;
      await delay(1000);
    }
    throw new Error(`DirectML did not become ready. Engine log: ${logPath}`);
  } catch (error) {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      await exec('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
    }
    throw error;
  }
}

await run('docker', ['info', '--format', '{{.ServerVersion}}']);
const up = ['up', '-d', '--wait', '--wait-timeout', '180'];
let activeCompose = compose;
let device = 'cpu';
let origin = cpuOrigin;
const cudaAvailable = mode === 'auto' && process.arch === 'x64' && await dockerHasNvidiaGpu();
if (cudaAvailable) {
  const candidate = [...compose, ...cudaCompose];
  try {
    console.log('Starting Pose CUDA in Docker. Waiting for model warm-up…');
    await run('docker', [...candidate, ...up, ...args, 'pose-engine']);
    activeCompose = candidate;
    device = 'cuda';
  } catch (error) {
    console.warn('Pose CUDA did not become ready:', error.message);
  }
}
if (mode === 'auto' && !cudaAvailable && process.platform === 'win32' && process.arch === 'x64') {
  try {
    origin = await startDirectML();
    device = 'dml';
  } catch (error) {
    console.warn('DirectML unavailable. Using CPU:', error.message);
  }
}

env.SMARTGYM_POSE_ENGINE_ORIGIN = origin;
const deviceLabel = { cpu: 'CPU (Docker)', dml: 'GPU DirectML (Windows)', cuda: 'GPU CUDA (Docker)' };
console.log('Pose Engine:', deviceLabel[device]);
try {
  await run('docker', [...activeCompose, ...up, ...args]);
  if (device !== 'cpu') {
    const verify = `
      const { readFileSync } = require('node:fs');
      const { request } = require('node:https');
      const pem = kind => readFileSync(process.env['BFF_POSE_STUDIO_TLS_' + kind + '_FILE']);
      const url = new URL('/api/health', process.env.BFF_POSE_STUDIO_ENGINE_ORIGIN);
      const req = request(url, { ca: pem('CA'), cert: pem('CERT'), key: pem('KEY'), signal: AbortSignal.timeout(5000) }, async res => {
        try {
          const health = JSON.parse(await res.toArray().then(chunks => Buffer.concat(chunks)));
          const provider = process.argv[1] === 'cuda' ? 'CUDAExecutionProvider' : 'DmlExecutionProvider';
          if (res.statusCode !== 200 || !health.ready || health.runtime?.device !== process.argv[1]
            || health.runtime.pose_providers?.[0] !== provider
            || health.runtime.detector_providers?.[0] !== provider) process.exitCode = 1;
        } catch { process.exitCode = 1; }
      });
      req.on('error', () => { process.exitCode = 1; });
      req.end();
    `;
    await run('docker', [...activeCompose, 'exec', '-T', 'web', 'node', '-e', verify, device]);
    console.log(deviceLabel[device], 'verified from Web over mTLS.');
  }
} catch (error) {
  if (device === 'cpu') throw error;
  console.warn('GPU startup could not be verified from Docker. Retrying with CPU:', error.message);
  env.SMARTGYM_POSE_ENGINE_ORIGIN = cpuOrigin;
  await run('docker', [...compose, ...up, ...args]);
  console.log('Pose Engine: CPU (Docker)');
}
