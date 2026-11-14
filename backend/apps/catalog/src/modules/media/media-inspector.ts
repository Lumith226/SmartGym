import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { connect, type Socket, type TcpNetConnectOpts } from 'node:net';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { InvalidMedia, type MediaMime } from './media-types.js';

const exec = promisify(execFile);
const signatures: Record<MediaMime, (prefix: Buffer) => boolean> = {
  'image/jpeg': bytes => bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  'video/mp4': bytes => bytes.toString('ascii', 4, 8) === 'ftyp',
  'video/webm': bytes => {
    const header = bytes.subarray(0, 64);
    return header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
      header.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]));
  },
};
const formats: Record<MediaMime, string> = {
  'image/jpeg': 'jpeg_pipe', 'image/png': 'png_pipe', 'image/webp': 'webp_pipe', 'video/mp4': 'mov', 'video/webm': 'matroska,webm',
};
const codecs: Record<MediaMime, string[]> = {
  'image/jpeg': ['mjpeg'], 'image/png': ['png'], 'image/webp': ['webp'],
  'video/mp4': ['h264', 'hevc', 'av1', 'mpeg4'], 'video/webm': ['vp8', 'vp9', 'av1'],
};
type Stream = { codec_type: string; codec_name: string; width: number; height: number };
export type Inspection = { width: number; height: number; durationMs: number | null };
export type MediaInspector = (file: string, mime: MediaMime, prefix: Buffer, signal: AbortSignal) => Promise<Inspection>;

const send = (socket: Socket, data: Buffer | string) => new Promise<void>((resolve, reject) => {
  socket.write(data, error => error ? reject(error) : resolve());
});

async function scan(file: string, scanner: TcpNetConnectOpts | { path: string }, signal: AbortSignal) {
  const socket = 'path' in scanner ? connect(scanner.path) : connect(scanner);
  const stop = () => socket.destroy(new Error('Media scan deadline exceeded'));
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  if (deadline.aborted) stop();
  deadline.addEventListener('abort', stop, { once: true });
  const response = new Promise<string>((resolve, reject) => {
    let reply = '';
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('Scanner closed before a result')));
    socket.on('data', (chunk: Buffer) => {
      reply += chunk.toString('utf8');
      if (reply.length > 4096) { socket.destroy(new Error('Scanner response too large')); return; }
      if (reply.includes('\0')) resolve(reply.slice(0, reply.indexOf('\0')));
    });
  });
  const request = async () => {
    await send(socket, 'zINSTREAM\0');
    for await (const chunk of createReadStream(file, { highWaterMark: 64 * 1024, signal: deadline })) {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(chunk.length);
      await send(socket, size);
      await send(socket, chunk);
    }
    await send(socket, Buffer.alloc(4));
  };
  try {
    const [reply] = await Promise.all([response, request()]);
    if (/^stream: .+ FOUND$/.test(reply)) throw new InvalidMedia('MEDIA_MALWARE_DETECTED');
    if (reply !== 'stream: OK') throw new Error('Scanner did not verify the media');
  } finally {
    deadline.removeEventListener('abort', stop);
    socket.destroy();
  }
}

async function inspectBinary(binary: string, args: string[], signal: AbortSignal, timeout: number) {
  try { return (await exec(binary, args, { signal, timeout, maxBuffer: 128 * 1024, windowsHide: true })).stdout; }
  catch (error) {
    const failure = error as { code?: unknown; killed?: boolean };
    if (typeof failure.code === 'number' && !failure.killed) throw new InvalidMedia('MEDIA_DECODE_FAILED');
    throw error;
  }
}

export function createMediaInspector(ffprobe: string, ffmpeg: string, scanner: TcpNetConnectOpts | { path: string }): MediaInspector {
  return async (file, mime, prefix, signal) => {
    if (!signatures[mime](prefix)) throw new InvalidMedia('MEDIA_SIGNATURE_MISMATCH');
    await scan(file, scanner, signal);
    const input = ['-max_alloc', '67108864', '-protocol_whitelist', 'file', '-format_whitelist', formats[mime], '-threads', '1'];
    const probe = JSON.parse(await inspectBinary(ffprobe, ['-v', 'error', ...input, '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', '-i', file], signal, 15000)) as
      { streams?: Stream[]; format?: { duration?: string } };
    const video = mime.startsWith('video/');
    const streams = probe.streams ?? [];
    const images = streams.filter(stream => stream.codec_type === 'video');
    const frame = images[0], max = video ? 1920 : 4096, min = video ? 1080 : 4096;
    const duration = video ? Math.ceil(Number(probe.format?.duration) * 1000) : null;
    if (images.length !== 1 || streams.length > (video ? 2 : 1) || streams.some(s => s.codec_type !== 'video' && s.codec_type !== 'audio') ||
        !codecs[mime].includes(frame.codec_name) || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
        frame.width < 1 || frame.height < 1 || Math.max(frame.width, frame.height) > max || Math.min(frame.width, frame.height) > min ||
        (video && (!Number.isSafeInteger(duration) || duration! < 1 || duration! > 120000))) throw new InvalidMedia('MEDIA_DIMENSIONS_OR_DURATION');
    const maxFrames = video ? 7200 : 1;
    const progress = await inspectBinary(ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-nostats',
      '-stats_period', '2', '-progress', 'pipe:1', ...input, '-err_detect', 'explode', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
      '-frames:v', String(maxFrames + 1), '-f', 'null', '-'], signal, 65000);
    const frames = Number([...progress.matchAll(/^frame=\s*(\d+)\s*$/gm)].at(-1)?.[1]);
    if (!Number.isInteger(frames) || frames < 1 || frames > maxFrames) throw new InvalidMedia('MEDIA_FRAME_LIMIT');
    return { width: frame.width, height: frame.height, durationMs: duration };
  };
}

export function loadMediaInspector() {
  const ffprobe = process.env.CATALOG_MEDIA_FFPROBE, ffmpeg = process.env.CATALOG_MEDIA_FFMPEG;
  const socket = process.env.CATALOG_MEDIA_CLAMD_SOCKET, host = process.env.CATALOG_MEDIA_CLAMD_HOST;
  const port = Number(process.env.CATALOG_MEDIA_CLAMD_PORT ?? 3310);
  if (!ffprobe || !ffmpeg || !isAbsolute(ffprobe) || !isAbsolute(ffmpeg) || (socket && !isAbsolute(socket)) ||
      (!socket && (!host || !Number.isInteger(port) || port < 1 || port > 65535))) throw new Error('Invalid Catalog scanner configuration');
  return createMediaInspector(ffprobe, ffmpeg, socket ? { path: socket } : { host, port });
}
