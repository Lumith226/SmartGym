import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { aiDirectory, uvBinary, localAIEnv } from './ai-local-env.mjs';

const [action, service, sourceRoot, ...extra] = process.argv.slice(2);
if (!['resolve', 'install', 'check'].includes(action) || !['pose', 'rag'].includes(service) || extra.length ||
    (action === 'resolve' && !sourceRoot)) throw new Error('Usage: ai-dependencies.mjs resolve|install|check pose|rag [provider-root]');
const exec = promisify(execFile), env = await localAIEnv();
const root = fileURLToPath(new URL('../', import.meta.url));
const lock = join(root, 'infra', 'ai', service + '.windows-x64.lock.txt');
const python = join(aiDirectory, service + '-env', 'Scripts', 'python.exe');
const run = async (args, showOutput = true) => {
  const r = await exec(uvBinary, ['--no-config', ...args], { env, windowsHide: true, timeout: 900000, maxBuffer: 8 * 1024 * 1024 });
  if (showOutput && r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
};
if (action === 'resolve') {
  const paths = service === 'rag' ? ['requirements.lock.txt'] : ['smart_gym_test_rtmpose_v4/requirements.txt', 'smart_gym_web_v4/server/requirements.txt'];
  const requirements = [];
  for (const path of paths) {
    const bytes = await readFile(join(sourceRoot, path));
    let text = bytes.toString('utf8');
    // ADR 0010: local CPU smoke profile. Provider files remain unchanged.
    if (service === 'pose') text = text.replace(/^onnxruntime-gpu==1\.19\.2\r?$/m, 'onnxruntime==1.31.1');
    requirements.push(text);
    console.log(path + ' SHA-256 ' + createHash('sha256').update(bytes).digest('hex'));
  }
  const input = join(aiDirectory, service + '.requirements.in');
  if (service === 'pose') requirements.push('opencv-contrib-python==4.12.0.88\nhttpx==0.28.1\n');
  await writeFile(input, requirements.join('\n'));
  await mkdir(join(root, 'infra', 'ai'), { recursive: true });
  // Never replace a reviewed lock silently. Resolving is an explicit maintenance action.
  const candidate = join(aiDirectory, service + '.candidate.lock');
  await run(['pip', 'compile', input, '--python', python, '--python-platform', 'x86_64-pc-windows-msvc',
    '--generate-hashes', '--only-binary', ':all:', '--no-header', '--default-index', 'https://pypi.org/simple', '--output-file', candidate], false);
  const generated = await readFile(candidate, 'utf8');
  let prior;
  try { prior = await readFile(lock, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (prior !== undefined && prior.replaceAll('\r\n', '\n') !== generated.replaceAll('\r\n', '\n')) {
    throw new Error('Resolved dependencies differ from the reviewed lock. Inspect .local/ai/' + service + '.candidate.lock before an explicit lock update.');
  }
  if (prior === undefined) await writeFile(lock, generated, { flag: 'wx' });
} else if (action === 'install') {
  const content = await readFile(lock, 'utf8');
  if (service === 'pose' && /^(onnxruntime-gpu==|opencv-contrib-python==(?!4\.12\.0\.88))/m.test(content)) {
    throw new Error('Refusing mismatched CPU/OpenCV profile; see ADR 0010');
  }
  await run(['pip', 'sync', lock, '--python', python, '--require-hashes', '--only-binary', ':all:', '--default-index', 'https://pypi.org/simple',
    ...(service === 'pose' ? ['--reinstall'] : [])]);
} else {
  await run(['pip', 'check', '--python', python]);
}
