import { spawn } from 'node:child_process';
import { startPostgres } from '../tests/helpers/postgres.mjs';
import { randomBytes } from 'node:crypto';

const server = await startPostgres();
console.log('Testing over TCP with ' + server.version);
try {
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', 'test/catalog.test.cjs'], {
      cwd: new URL('../backend/services/catalog/', import.meta.url),
      env: { ...process.env, CATALOG_TEST_DATABASE_URL: server.connectionString },
      stdio: 'inherit', windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = status;
  if (status === 0) {
    const { connectDatabase } = await import('../backend/services/identity/dist/database.js');
    const administrator = connectDatabase(server.connectionString);
    const password = randomBytes(24).toString('hex');
    try {
      // Literal identifier and generated hex password only. No user-controlled SQL interpolation.
      await administrator.query("CREATE ROLE identity_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + password + "'");
      await administrator.query('CREATE DATABASE identity_test OWNER identity_test');
      await administrator.query('REVOKE CONNECT ON DATABASE postgres FROM PUBLIC');
    } finally { await administrator.close(); }
    const identityUrl = new URL(server.connectionString);
    identityUrl.username = 'identity_test'; identityUrl.password = password; identityUrl.pathname = '/identity_test';
    const forbiddenUrl = new URL(identityUrl); forbiddenUrl.pathname = '/postgres';
    process.exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--test', 'test/identity.test.cjs'], {
        cwd: new URL('../backend/services/identity/', import.meta.url),
        env: { ...process.env, IDENTITY_TEST_DATABASE_URL: identityUrl.href, IDENTITY_TEST_FORBIDDEN_DATABASE_URL: forbiddenUrl.href },
        stdio: 'inherit', windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  }
  if (process.exitCode === 0) {
    const { connectDatabase } = await import('../backend/services/notification/dist/database.js');
    const administrator = connectDatabase(server.connectionString);
    const password = randomBytes(24).toString('hex');
    try {
      await administrator.query("CREATE ROLE notification_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + password + "'");
      await administrator.query('CREATE DATABASE notification_test OWNER notification_test');
    } finally { await administrator.close(); }
    const url = new URL(server.connectionString);
    url.username = 'notification_test'; url.password = password; url.pathname = '/notification_test';
    process.exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--test', 'test/delivery.test.cjs'], {
        cwd: new URL('../backend/services/notification/', import.meta.url),
        env: { ...process.env, NOTIFICATION_TEST_DATABASE_URL: url.href }, stdio: 'inherit', windowsHide: true,
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  }
} finally {
  await server.stop();
}
