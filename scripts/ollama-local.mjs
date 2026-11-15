import { spawn } from 'node:child_process';
import { access, mkdir, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { aiDirectory } from './ai-local-env.mjs';

export const ollamaDockerOrigin = 'http://ollama:11434';
const localhost = 'http://127.0.0.1:11434';
const ollamaWindowsOrigin = 'http://host.docker.internal:11434';

export async function selectOllama(env, cudaAvailable) {
  const mode = env.SMARTGYM_OLLAMA_ACCELERATION || 'auto';
  const explicit = env.SMARTGYM_OLLAMA_ORIGIN;
  if (mode === 'cpu') return { origin: ollamaDockerOrigin };
  if (explicit && explicit !== ollamaWindowsOrigin && explicit !== ollamaDockerOrigin) {
    return { origin: explicit };
  }
  if (cudaAvailable) {
    return { origin: ollamaDockerOrigin, overlay: 'infra/compose.ollama-nvidia.yaml', gpu: 'CUDA' };
  }
  if (process.platform === 'win32') {
    try {
      await startWindowsOllama(env);
      return { origin: ollamaWindowsOrigin, gpu: 'Windows Vulkan' };
    } catch (error) {
      console.warn('Ollama Windows unavailable:', error.message);
    }
  }
  if (process.platform === 'linux') {
    const devices = await Promise.all(['/dev/dri', '/dev/kfd'].map(path => access(path).then(() => true, () => false)));
    if (devices.every(Boolean)) {
      return { origin: ollamaDockerOrigin, overlay: 'infra/compose.ollama-vulkan.yaml', gpu: 'Linux Vulkan' };
    }
  }
  return { origin: ollamaDockerOrigin };
}

async function windowsOllamaStatus() {
  try {
    const response = await fetch(localhost + '/api/version', { signal: AbortSignal.timeout(1200) });
    return response.ok && typeof (await response.json()).version === 'string' ? 'ready' : 'occupied';
  } catch (error) {
    return error.cause?.code === 'ECONNREFUSED' ? 'missing' : 'occupied';
  }
}

async function startWindowsOllama(env) {
  const status = await windowsOllamaStatus();
  if (status === 'ready') return;
  if (status === 'occupied') throw new Error('Windows port 11434 is occupied');
  if (env.SMARTGYM_OLLAMA_MODELS && !/[\\/]/.test(env.SMARTGYM_OLLAMA_MODELS) && env.SMARTGYM_OLLAMA_MODELS !== 'smartgym-ollama-models')
    throw new Error('The configured Docker model volume has no Windows model path');
  const standardPath = env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe');
  const executable = env.SMARTGYM_OLLAMA_WINDOWS_BINARY || (standardPath
    && await access(standardPath).then(() => true, () => false) ? standardPath : 'ollama.exe');
  const models = env.SMARTGYM_OLLAMA_MODELS;
  const absoluteModels = models && models !== 'smartgym-ollama-models'
    ? resolve(fileURLToPath(new URL('../infra/', import.meta.url)), models) : undefined;
  await mkdir(aiDirectory, { recursive: true });
  const log = await open(join(aiDirectory, 'ollama-host.log'), 'a');
  let failure;
  try {
    const child = spawn(executable, ['serve'], {
      env: { ...env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_VULKAN: '1', OLLAMA_NO_CLOUD: '1',
        ...(absoluteModels ? { OLLAMA_MODELS: absoluteModels } : {}) },
      stdio: ['ignore', log.fd, log.fd], detached: true, windowsHide: true,
    });
    child.once('error', error => { failure = error; });
    child.once('exit', code => { failure = new Error('Ollama exited with ' + code); });
    child.unref();
  } finally {
    await log.close();
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    if (await windowsOllamaStatus() === 'ready') return;
    if (failure) throw failure;
    await delay(500);
  }
  throw new Error('Ollama did not listen on Windows loopback');
}

// Run inside RAG to check its actual route and model placement. Empty prompts
// load the configured model without sending or generating user content.
export const verifyOllamaGpu = `
import json, os, urllib.request
origin = os.environ['OLLAMA_BASE_URL']
model = os.environ['OLLAMA_CHAT_MODEL']
name = model if ':' in model.rsplit('/', 1)[-1] else model + ':latest'
body = json.dumps({'model': model, 'stream': False, 'options': {'num_ctx': 8192}}).encode()
with urllib.request.urlopen(urllib.request.Request(origin + '/api/generate', body,
        {'Content-Type': 'application/json'}), timeout=75) as response:
    assert json.load(response).get('done') is True
with urllib.request.urlopen(origin + '/api/ps', timeout=5) as response:
    loaded = json.load(response)['models']
assert any(item['name'] == name and item.get('size_vram', 0) > 0 for item in loaded), 'Ollama did not load the chat model on GPU'
`;
