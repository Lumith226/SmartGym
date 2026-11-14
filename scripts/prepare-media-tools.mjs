import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('These local media test tools require Windows x64');
const directory = fileURLToPath(new URL('../.local/media-tools/', import.meta.url));
const artifacts = [
  { archive: 'ffmpeg.zip', directory: 'ffmpeg', expected: 'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe',
    url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip',
    sha256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba' },
  { archive: 'clamav.zip', directory: 'clamav', expected: 'clamav-1.5.4.win.x64/clamd.exe',
    url: 'https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.win.x64.zip',
    sha256: '0d9e0228b2674137ea1a2853566c98a0278ad52ab2582c3d6dbd75373848c395' },
  { archive: 'seaweed.zip', directory: 'seaweed', expected: 'weed.exe',
    url: 'https://github.com/seaweedfs/seaweedfs/releases/download/4.52/windows_amd64.zip',
    sha256: 'e3dfe6c441686887b8fdde4420aa2c11ad9c8ce152340bd053e8176e07851a26' },
];
const exec = promisify(execFile);
const exists = async file => { try { await access(file); return true; } catch { return false; } };
await mkdir(directory, { recursive: true });
for (const artifact of artifacts) {
  const archive = join(directory, artifact.archive);
  if (!await exists(archive)) {
    const partial = archive + '.part';
    try {
      const response = await fetch(artifact.url, { signal: AbortSignal.timeout(300000) });
      if (!response.ok || !response.body) throw new Error('Official media test tool download failed');
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }));
      await rename(partial, archive);
    } catch (error) { await rm(partial, { force: true }); throw error; }
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== artifact.sha256) throw new Error('Media test tool SHA-256 mismatch');
  const output = resolve(directory, artifact.directory);
  if (!output.startsWith(resolve(directory) + sep)) throw new Error('Unsafe media extraction path');
  if (!await exists(join(output, artifact.expected))) {
    if (await exists(output)) throw new Error('Partial media extraction exists, inspect it before replacing files');
    const listing = await exec('tar.exe', ['-tf', archive], { windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    if (listing.stdout.split(/\r?\n/).some(name => /(^[/\\]|(^|[/\\])\.\.([/\\]|$)|:)/.test(name))) throw new Error('Unsafe media archive entry');
    await mkdir(output);
    await exec('tar.exe', ['-xf', archive, '-C', output], { windowsHide: true, timeout: 120000 });
    await access(join(output, artifact.expected));
  }
  console.log('Verified local media tool ' + artifact.archive);
}
