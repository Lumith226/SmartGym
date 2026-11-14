import { request } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { manifestSha256 } from './contract.js';
export type EngineTls = { key: string; cert: string; ca: string };
export interface Engine {
  ready(signal: AbortSignal): Promise<void>;
  analyze(path: string, exercise: string, mime: string, signal: AbortSignal): Promise<unknown>;
}
export class EngineHttp implements Engine {
  constructor(readonly origin: string, readonly tls: EngineTls) {
    if (new URL(origin).origin !== origin || new URL(origin).protocol !== 'https:') throw new Error('Private HTTPS engine is required');
  }
  private call(path: string, signal: AbortSignal, upload?: { file: string; exercise: string; mime: string }) {
    return new Promise<unknown>(async (resolve, reject) => {
      let size = 0;
      const boundary = 'smartgym-' + randomUUID();
      const prefix = upload ? Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="exercise"\r\n\r\n${upload.exercise}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="input.${upload.mime === 'video/mp4' ? 'mp4' : 'webm'}"\r\nContent-Type: ${upload.mime}\r\n\r\n`) : Buffer.alloc(0);
      const suffix = Buffer.from('\r\n--' + boundary + '--\r\n');
      try {
        if (upload) size = (await stat(upload.file)).size;
        const req = request(new URL(path, this.origin), { ...this.tls, agent: false, method: upload ? 'POST' : 'GET', signal,
          headers: upload ? { 'content-type': 'multipart/form-data; boundary=' + boundary, 'content-length': String(prefix.length + size + suffix.length) } : {} }, res => {
          const chunks: Buffer[] = []; let length = 0;
          res.on('data', (chunk: Buffer) => { length += chunk.length; if (length > 524288) req.destroy(new Error('ENGINE_RESPONSE_INVALID')); else chunks.push(chunk); });
          res.on('error', reject);
          res.on('end', () => {
            try {
              if (res.statusCode !== 200 || !res.headers['content-type']?.startsWith('application/json')) throw new Error('ENGINE_RESPONSE_INVALID');
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (error) { reject(error); }
          });
        });
        req.on('error', reject);
        if (upload) {
          const stream = createReadStream(upload.file);
          req.on('close', () => stream.destroy());
          stream.on('error', error => req.destroy(error));
          stream.on('end', () => req.end(suffix));
          req.write(prefix);
          stream.pipe(req, { end: false });
        } else req.end();
      } catch (error) { reject(error); }
    });
  }
  async ready(signal: AbortSignal) {
    const response = await this.call('/internal/v1/engine/manifest', signal) as { manifestSha256?: string; ready?: boolean };
    if (!response.ready || response.manifestSha256 !== manifestSha256) throw new Error('ENGINE_MANIFEST_MISMATCH');
  }
  async analyze(path: string, exercise: string, mime: string, signal: AbortSignal) {
    const response = await this.call('/api/analyze-video', signal, { file: path, exercise, mime }) as { result?: unknown };
    if (!response.result) throw new Error('ENGINE_RESPONSE_INVALID');
    return response.result;
  }
}
export async function loadEngine() {
  const origin = process.env.POSE_ENGINE_ORIGIN;
  if (!origin) throw new Error('POSE_ENGINE_ORIGIN required');
  const values = await Promise.all(['KEY', 'CERT', 'CA'].map(k => {
    const f = process.env['POSE_ENGINE_TLS_' + k + '_FILE'];
    if (!f) throw new Error('Missing engine client TLS');
    return readFile(f, 'utf8');
  }));
  return new EngineHttp(origin, { key: values[0], cert: values[1], ca: values[2] });
}
