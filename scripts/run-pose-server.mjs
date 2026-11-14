import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const python = resolve('.local/ai/pose-env/Scripts/python.exe');
const serverScript = resolve('scripts/pose_server_dml.py');

const env = {
  ...process.env,
  GYM_WEB_ORIGINS: 'http://localhost:3100,http://127.0.0.1:3100,http://localhost:8080,http://127.0.0.1:8080',
};

console.log('Khởi chạy Server AI RTMPose + ST-GCN++ trên cổng 8001 (GPU DirectML)...');
const child = spawn(python, [serverScript, '--device', 'auto', '--port', '8001'], {
  env,
  stdio: 'inherit',
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

child.on('exit', code => {
  process.exit(code ?? 0);
});
