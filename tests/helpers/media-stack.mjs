import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { S3Client, PutBucketVersioningCommand, HeadBucketCommand } from '../../backend/apps/catalog/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';
import { freePort } from './postgres.mjs';

const exec = promisify(execFile);
export async function startMediaTools() {
  const base = resolve('.local/media-tests');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'run-'));
  const tools = resolve('.local/media-tools');
  const ffmpeg = join(tools, 'ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe');
  const ffprobe = join(tools, 'ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe');
  const weed = join(tools, 'seaweed/weed.exe');
  const clamRoot = join(tools, 'clamav/clamav-1.5.4.win.x64');
  const clamd = join(clamRoot, 'clamd.exe');
  const children = [], cleanup = [];
  async function stop() {
    const failures = [];
    for (const close of cleanup.reverse()) try { await close(); } catch (error) { failures.push(error); }
    for (const child of children.reverse()) if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); child.kill(); });
    }
    if (!failures.length && resolve(directory).startsWith(base + sep)) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (failures.length) throw new AggregateError(failures, 'Media fixture cleanup failed');
  }
  function run(binary, args, env = {}) {
    const child = spawn(binary, args, { cwd: directory, env: { ...process.env, ...env }, windowsHide: true });
    children.push(child);
    let output = '', failure;
    child.stdout.on('data', data => { output = (output + data).slice(-12000); });
    child.stderr.on('data', data => { output = (output + data).slice(-12000); });
    child.on('error', error => { failure = error; });
    return () => { if (failure) throw failure; if (child.exitCode !== null || child.signalCode !== null) throw new Error(output); };
  }
  try {
    const ports = await Promise.all(Array.from({ length: 9 }, () => freePort()));
    if (new Set(ports).size !== ports.length) throw new Error('Media test port collision');
    const [s3Port, masterPort, volumePort, filerPort, masterGrpc, volumeGrpc, filerGrpc, s3Grpc, clamdPort] = ports;
    const credentials = { accessKeyId: 'sg' + randomBytes(10).toString('hex'), secretAccessKey: randomBytes(30).toString('hex') };
    const bucket = 'smartgym-test', endpoint = 'http://127.0.0.1:' + s3Port;
    const weedAlive = run(weed, ['mini', '-dir=' + join(directory, 'objects'), '-ip=127.0.0.1', '-ip.bind=127.0.0.1',
      '-s3.port=' + s3Port, '-master.port=' + masterPort, '-volume.port=' + volumePort, '-filer.port=' + filerPort,
      '-master.port.grpc=' + masterGrpc, '-volume.port.grpc=' + volumeGrpc, '-filer.port.grpc=' + filerGrpc, '-s3.port.grpc=' + s3Grpc,
      '-s3.port.iceberg=0', '-s3.port.lance=0', '-admin.ui=false', '-webdav=false', '-bucket=' + bucket],
    { AWS_ACCESS_KEY_ID: credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey });
    const client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials, maxAttempts: 1,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    cleanup.push(() => client.destroy());
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      weedAlive();
      try { await client.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(500) }); ready = true; break; } catch {}
      await delay(100);
    }
    if (!ready) throw new Error('S3 test store startup timed out');
    await client.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }));
    const virus = 'SmartGym Test Only Malware Signature 2026';
    const signatures = join(directory, 'signatures');
    await mkdir(signatures);
    await writeFile(join(signatures, 'test.ndb'), 'SmartGym.Test.Signature:0:*:' + Buffer.from(virus).toString('hex') + '\n');
    const clamConfig = join(directory, 'clamd.conf');
    await writeFile(clamConfig, ['DatabaseDirectory "' + signatures.replaceAll('\\', '/') + '"',
      'TemporaryDirectory "' + directory.replaceAll('\\', '/') + '"', 'TCPSocket ' + clamdPort, 'TCPAddr 127.0.0.1',
      'Foreground yes', 'MaxThreads 2', 'StreamMaxLength 110M', 'MaxFileSize 110M', 'MaxScanSize 120M',
      'ReadTimeout 30', 'CommandReadTimeout 10', 'ExitOnOOM yes'].join('\n') + '\n');
    const clamAlive = run(clamd, ['--config-file=' + clamConfig]);
    const { connect } = await import('node:net');
    ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      clamAlive();
      try {
        await new Promise((resolve, reject) => {
          const socket = connect({ host: '127.0.0.1', port: clamdPort });
          socket.once('error', reject); socket.setTimeout(500, () => socket.destroy(new Error('Clamd ping timeout')));
          socket.on('data', data => { socket.destroy(); data.toString().includes('PONG') ? resolve() : reject(new Error('Bad clamd ping')); });
          socket.end('zPING\0');
        }); ready = true; break;
      } catch {}
      await delay(100);
    }
    if (!ready) throw new Error('Clamd fixture startup timed out');
    const png = join(directory, 'fixture.png'), video = join(directory, 'fixture.mp4');
    await exec(ffmpeg, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=32x32', '-frames:v', '1', png], { windowsHide: true, timeout: 15000 });
    await exec(ffmpeg, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=10:d=0.5',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { windowsHide: true, timeout: 15000 });
    const extraFiles = [
      { name: 'photo.jpg', mime: 'image/jpeg', args: ['-f', 'lavfi', '-i', 'color=c=green:s=32x32', '-frames:v', '1'] },
      { name: 'photo.webp', mime: 'image/webp', args: ['-f', 'lavfi', '-i', 'color=c=green:s=32x32', '-frames:v', '1', '-c:v', 'libwebp'] },
      { name: 'video.webm', mime: 'video/webm', args: ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=10:d=0.5', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p'] },
      { name: 'long.mp4', mime: 'video/mp4', args: ['-f', 'lavfi', '-i', 'color=c=blue:s=16x16:r=1:d=121', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'] },
    ];
    const extra = [];
    for (const file of extraFiles) {
      const destination = join(directory, file.name);
      await exec(ffmpeg, ['-hide_banner', '-v', 'error', ...file.args, destination], { windowsHide: true, timeout: 15000 });
      extra.push({ mime: file.mime, bytes: await readFile(destination) });
    }
    return { directory, ffmpeg, ffprobe, endpoint, bucket, client, credentials, scanner: { host: '127.0.0.1', port: clamdPort }, virus,
      png: await readFile(png), video: await readFile(video), extra, stop };
  } catch (error) { await stop(); throw error; }
}
