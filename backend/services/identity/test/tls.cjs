const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readFile, writeFile, mkdir, mkdtemp, rm, access } = require('node:fs/promises');
const { resolve, join, sep } = require('node:path');
const { X509Certificate } = require('node:crypto');

// Disposable certificates only. Does not modify OS certificate stores or production secrets.
exports.createTestTls = async function createTestTls() {
  let binary = process.env.OPENSSL_TEST_BINARY || 'openssl';
  if (process.platform === 'win32' && !process.env.OPENSSL_TEST_BINARY) {
    const candidate = 'C:/Program Files/Git/usr/bin/openssl.exe';
    try { await access(candidate); binary = candidate; } catch {}
  }
  const base = resolve(__dirname, '../.local/test-tls');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'run-'));
  const run = async args => { await promisify(execFile)(binary, args, { cwd: directory, windowsHide: true, timeout: 30000 }); };
  const stop = async () => { if (resolve(directory).startsWith(base + sep)) await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); };
  try {
    await run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-subj','/CN=SmartGym-Ephemeral-Test-CA','-days','1','-addext','basicConstraints=critical,CA:TRUE']);
    const clients = {}, callers = {};
    for (const name of ['server','bff','notification','catalog','unknown']) {
      await run(['req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=smartgym-test-'+name]);
      await writeFile(join(directory,name+'.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage='+
        (name === 'server' ? 'serverAuth\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n' : 'clientAuth\n'));
      await run(['x509','-req','-in',name+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',name+'.crt','-days','1','-extfile',name+'.ext']);
      clients[name] = { cert: await readFile(join(directory,name+'.crt'),'utf8'), key: await readFile(join(directory,name+'.key'),'utf8') };
      if (!['server','unknown'].includes(name)) callers[name] = [new X509Certificate(clients[name].cert).fingerprint256];
    }
    return { directory, ca: await readFile(join(directory,'ca.crt'),'utf8'), clients, callers, stop };
  } catch (error) { await stop(); throw error; }
};
