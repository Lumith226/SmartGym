import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiDirectory, localAIEnv } from './ai-local-env.mjs';
const child = spawn(join(aiDirectory, 'pose-env/Scripts/python.exe'),
  ['-B', fileURLToPath(new URL('../backend/apps/pose/engine/main.py', import.meta.url)), ...process.argv.slice(2)],
  { env: await localAIEnv(), windowsHide: true, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('error', () => { console.error('Pose engine could not start'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
