import { mkdir, access, rename, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Local AI bootstrap targets Windows x64');
const root = fileURLToPath(new URL('../.local/ai/', import.meta.url));
const version = '0.13.7';
const sha256 = '0cdc5b38fe5a8168ed6a25814f5ba43c21d313dd3187314fccb37b7cec46e021';
const archive = join(root, 'uv-' + version + '.zip');
const destination = join(root, 'uv-' + version);
const exec = promisify(execFile);
await mkdir(root, { recursive: true });
const exists = async file => { try { await access(file); return true; } catch { return false; } };
if (!await exists(archive)) {
  const partial = archive + '.part';
  try {
    const response = await fetch('https://github.com/astral-sh/uv/releases/download/' + version + '/uv-x86_64-pc-windows-msvc.zip', { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error('Official uv download failed');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }));
    await rename(partial, archive);
  } catch (error) { await rm(partial, { force: true }); throw error; }
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(archive)) hash.update(chunk);
if (hash.digest('hex') !== sha256) throw new Error('uv archive SHA-256 mismatch');
if (!resolve(destination).startsWith(resolve(root) + sep)) throw new Error('Unsafe output');
if (!await exists(join(destination, 'uv.exe'))) {
  if (await exists(destination)) throw new Error('Partial extraction exists; inspect before replacing');
  const listing = await exec('tar.exe', ['-tf', archive], { windowsHide: true });
  for (const name of listing.stdout.split(/\r?\n/).filter(Boolean)) {
    if (/(^[/\\]|(^|[/\\])\.\.([/\\]|$)|:)/.test(name)) throw new Error('Unsafe archive member');
  }
  await mkdir(destination);
  await exec('tar.exe', ['-xf', archive, '-C', destination], { windowsHide: true, timeout: 30000 });
}
const { stdout } = await exec(join(destination, 'uv.exe'), ['--version'], { windowsHide: true });
if (!stdout.startsWith('uv ' + version + ' ')) throw new Error('Unexpected uv version');
console.log(stdout.trim());
console.log('Verified portable uv in .local/ai; no PATH, registry, or service installation');
