import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(v => !['--build', '--external-pose'].includes(v))) throw new Error('Use --build and/or --external-pose');
const run = (program, argv) => new Promise((resolve, reject) => {
  const p = spawn(program, argv, { cwd: root, stdio: 'inherit', windowsHide: true });
  p.once('error', reject); p.once('exit', code => code === 0 ? resolve() : reject(new Error(program + ' exited ' + code)));
});
await run(process.execPath, ['scripts/setup-integrated.mjs']);
const command = ['compose', '-p', 'smartgym-integrated', '--env-file', '.env', '-f', 'infra/compose.yaml', '-f', 'infra/compose.integrated.yaml'];
if (args.includes('--external-pose')) command.push('-f', 'infra/compose.external-pose.yaml');
command.push('up', '-d', '--wait', '--wait-timeout', '300');
if (args.includes('--build')) command.push('--build');
await run('docker', command);
console.log('SmartGym: https://127.0.0.1:3100/hoi-dap | Mailpit: http://127.0.0.1:8025');
