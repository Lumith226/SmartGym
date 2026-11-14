import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const exec = promisify(execFile);

export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function startPostgres() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Portable PostgreSQL test runner requires Windows x64. Use Compose for PostgreSQL on this platform.');
  }
  const binaries = await import('@embedded-postgres/windows-x64');
  const base = resolve('.local/postgres-tests');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'run-'));
  let data = join(directory, 'data');
  const passwordFile = join(directory, 'password');
  const password = randomBytes(24).toString('hex');
  const port = await freePort();
  const options = { windowsHide: true, encoding: 'utf8', timeout: 30000 };
  let started = false;
  async function stopServer() {
    if (started) {
      await exec(binaries.pg_ctl, ['-D', data, '-m', 'fast', '-w', 'stop'], options);
      started = false;
    }
  }
  async function startServer() {
    try {
      await exec(binaries.pg_ctl, ['-D', data, '-l', join(directory, 'server.log'), '-o', '-p ' + port + ' -h 127.0.0.1', '-w', 'start'], options);
      started = true;
    } catch (error) {
      // A timed-out start can leave a running process. Inspect only this test data directory.
      try {
        await exec(binaries.pg_ctl, ['-D', data, 'status'], options);
        started = true;
      } catch {}
      throw error;
    }
  }
  async function stop() {
    await stopServer();
    const target = resolve(directory);
    if (target.startsWith(base + sep)) await rm(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
  }
  async function restoreColdCopy() {
    if (!started || data !== join(directory, 'data')) throw new Error('Expected an active original test cluster');
    await stopServer();
    const backup = join(directory, 'backup');
    const restored = join(directory, 'restored');
    await cp(data, backup, { recursive: true, force: false, errorOnExist: true });
    await cp(backup, restored, { recursive: true, force: false, errorOnExist: true });
    data = restored;
    await startServer();
  }
  try {
    await writeFile(passwordFile, password, { mode: 0o600 });
    await exec(binaries.initdb, ['-D', data, '-U', 'catalog_test', '--pwfile=' + passwordFile,
      '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', '--encoding=UTF8', '--locale=C', '--no-sync'], options);
    await rm(passwordFile);
    const version = (await exec(binaries.postgres, ['--version'], options)).stdout.trim();
    await startServer();
    return { connectionString: 'postgresql://catalog_test:' + password + '@127.0.0.1:' + port + '/postgres', version, stop, restoreColdCopy };
  } catch (error) {
    await stop();
    throw error;
  }
}
