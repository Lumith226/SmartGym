import { randomBytes } from 'node:crypto';
import { request } from 'node:https';
import { startAuthStack } from '../tests/helpers/auth-stack.mjs';

// A disposable loopback demo. The email is captured by the local SMTP sandbox.
const configuredPort = process.env.SMARTGYM_AUTH_DEMO_PORT;
const webPort = configuredPort === undefined ? undefined : Number(configuredPort);
if (webPort !== undefined && (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535)) {
  throw new Error('SMARTGYM_AUTH_DEMO_PORT phải từ 1024 đến 65535.');
}
const stack = await startAuthStack({ webPort });
const email = 'demo@smartgym.example.test';
const password = randomBytes(6).toString('base64url');

function call(path, input, expected) {
  const payload = JSON.stringify(input);
  return new Promise((resolve, reject) => {
    const req = request(stack.url + path, {
      ca: stack.testTls.ca,
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { origin: stack.url, 'x-smartgym-csrf': '1', 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, response => {
      response.resume();
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode === expected) resolve();
        else reject(new Error(`${path} returned ${response.statusCode}, expected ${expected}`));
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

try {
  await call('/api/v1/auth/register', { email, password, displayName: 'Tài khoản demo' }, 202);
  const link = new URL(await stack.mailLink(email, 'verify'));
  const token = new URLSearchParams(link.hash.slice(1)).get('token');
  await call('/api/v1/auth/verify-email', { token }, 204);
  await call('/api/v1/auth/login', { email, password }, 200);
  console.log(`SmartGym Auth demo: ${stack.url}/dang-nhap`);
  console.log(`Tài khoản thử: ${email} / ${password}`);
  console.log('HTTPS dùng CA thử nghiệm riêng. Ctrl+C để dừng demo và dọn dữ liệu.');
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void stack.stop().catch(() => {
        console.error('Không dọn được đầy đủ tiến trình demo.');
        process.exitCode = 1;
      });
    });
  }
} catch (error) {
  await stack.stop();
  throw error;
}
