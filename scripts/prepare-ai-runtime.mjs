import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import { aiDirectory, uvBinary, localAIEnv } from './ai-local-env.mjs';

const exec = promisify(execFile);
const env = { ...await localAIEnv(), UV_PYTHON_CPYTHON_BUILD: '20261026' };
const run = async args => {
  const result = await exec(uvBinary, ['--no-config', ...args], { env, windowsHide: true, timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
};
await run(['python', 'install', '3.12.16']);
const python = join(aiDirectory, 'python', 'cpython-3.12.16-windows-x86_64-none', 'python.exe');
const { stdout } = await exec(python, ['-I', '-c', 'import sys; assert sys.version_info[:3]==(3,12,16); print(sys.version)'], { env, windowsHide: true });
console.log(stdout.trim());
for (const name of ['pose', 'rag']) {
  const directory = join(aiDirectory, name + '-env');
  const target = join(directory, 'Scripts', 'python.exe');
  let exists = false;
  try { await access(target); exists = true; } catch {}
  if (!exists) await run(['venv', '--python', python, directory]);
  await exec(target, ['-I', '-c', 'import sys; assert sys.version_info[:3]==(3,12,16); assert sys.prefix!=sys.base_prefix'], { env, windowsHide: true });
  console.log('Verified local environment: ' + name);
}
