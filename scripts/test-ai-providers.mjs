import { spawn } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiDirectory, localAIEnv } from './ai-local-env.mjs';

const [service, ...args] = process.argv.slice(2);
if (!['pose', 'rag', 'rag-regressions'].includes(service)) throw new Error('Select pose, rag or rag-regressions');
const index = args.indexOf('--output');
if (index < 0 || !args[index + 1] || !resolve(args[index + 1]).startsWith(resolve(aiDirectory) + sep)) {
  throw new Error('Explicit --output within .local/ai is required');
}
const child = spawn(join(aiDirectory, (service === 'pose' ? 'pose' : 'rag') + '-env/Scripts/python.exe'),
  ['-B', fileURLToPath(new URL('../tests/ai/provider-smoke.py', import.meta.url)), service, ...args],
  { env: await localAIEnv(), windowsHide: true, stdio: 'inherit' });
const timer = setTimeout(() => child.kill(), 600000);
child.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1; });
