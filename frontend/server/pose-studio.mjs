import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import { pipeline } from 'node:stream/promises';
import WebSocket, { WebSocketServer } from 'ws';
import { problem, requireSameOrigin } from './auth.mjs';
import { assertionForSession, AuthError } from './identity-client.mjs';
import { relayPoseSocket } from './pose-live.mjs';

const streamPath = '/api/pose-studio/live';
const routes = new Map([
  ['/api/pose-studio/health', '/api/health'],
  ['/api/pose-studio/exercises', '/api/exercises'],
  ['/api/pose-studio/analyze-video', '/api/analyze-video'],
]);
const maxFrameBytes = 2 * 1024 * 1024;
const maxUploadBytes = 201 * 1024 * 1024;

export async function loadPoseStudio(webOrigin) {
  const engineOrigin = process.env.BFF_POSE_STUDIO_ENGINE_ORIGIN;
  if (!engineOrigin) return null;
  const engine = new URL(engineOrigin);
  if (engine.protocol !== 'https:' || engine.origin !== engineOrigin) throw Error('Invalid Pose Studio engine origin');
  const [key, cert, ca] = await Promise.all(['KEY', 'CERT', 'CA'].map(kind =>
    readFile(process.env['BFF_POSE_STUDIO_TLS_' + kind + '_FILE'])));
  const tls = { key, cert, ca };
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxFrameBytes, perMessageDeflate: false });
  const streams = new Set();
  let pending = 0;
  let uploads = 0;
  let closing = false;

  async function http(req, res) {
    const path = routes.get(req.url);
    if (!path) return problem(res, 404, 'NOT_FOUND');
    const upload = path === '/api/analyze-video';
    if (req.method !== (upload ? 'POST' : 'GET')) return problem(res, 405, 'METHOD_NOT_ALLOWED');
    try {
      requireSameOrigin(req, webOrigin);
      await assertionForSession(req.headers.cookie ?? '');
      const headers = { accept: 'application/json' };
      if (upload) {
        const type = req.headers['content-type'] ?? '';
        const length = req.headers['content-length'] ?? '';
        if (!/^multipart\/form-data;\s*boundary=/i.test(type) || !/^[1-9]\d*$/.test(length))
          return problem(res, 400, 'BAD_REQUEST');
        if (Number(length) > maxUploadBytes) return problem(res, 413, 'VIDEO_TOO_LARGE');
        if (uploads >= 2) return problem(res, 429, 'RATE_LIMITED');
        headers['content-type'] = type;
        headers['content-length'] = length;
        uploads++;
      }
      try {
        await new Promise((resolve, reject) => {
          const upstream = request(new URL(path, engine), { ...tls, agent: false, method: req.method, headers,
            signal: AbortSignal.timeout(upload ? 300000 : 2500) }, reply => {
            if (!reply.headers['content-type']?.startsWith('application/json')) {
              reply.resume();
              reject(Error('Invalid engine response'));
              return;
            }
            res.writeHead(reply.statusCode, { 'content-type': 'application/json', 'cache-control': 'no-store',
              'x-content-type-options': 'nosniff' });
            pipeline(reply, res).then(resolve, reject);
          });
          upstream.on('error', reject);
          res.once('close', () => { if (!res.writableFinished) upstream.destroy(); });
          if (upload) {
            req.once('error', error => upstream.destroy(error));
            req.pipe(upstream);
          } else upstream.end();
        });
      } finally {
        if (upload) uploads--;
      }
    } catch (error) {
      if (res.headersSent) res.destroy();
      else if (error instanceof AuthError) problem(res, error.status, error.status === 401 ? 'UNAUTHENTICATED' : 'POSE_UNAVAILABLE');
      else problem(res, 503, 'POSE_UNAVAILABLE');
    }
  }

  async function upgrade(req, socket, head) {
    const deny = status => { if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Upgrade Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    socket.on('error', () => socket.destroy());
    if (req.url !== streamPath || req.method !== 'GET' || head.length || req.headers['sec-websocket-protocol'] ||
        req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' ||
        !/^[A-Za-z0-9+/]{22}==$/.test(req.headers['sec-websocket-key'] ?? ''))
      return deny(400);
    if (!req.socket.encrypted || req.headers.host !== new URL(webOrigin).host || req.headers.origin !== webOrigin)
      return deny(403);
    if (closing || pending + streams.size >= 4) return deny(429);
    pending++;
    socket.pause();
    let upstream;
    try {
      const cookie = req.headers.cookie ?? '';
      const assertion = await assertionForSession(cookie);
      if (closing || socket.destroyed) return deny(503);
      const target = new URL('/ws/live', engine);
      target.protocol = 'wss:';
      upstream = new WebSocket(target, { ...tls, maxPayload: maxFrameBytes, handshakeTimeout: 5000, perMessageDeflate: false });
      await new Promise((resolve, reject) => {
        upstream.on('error', reject);
        upstream.once('unexpected-response', (_, reply) => {
          reply.destroy();
          reject(Error('Engine rejected upgrade'));
        });
        upstream.once('open', () => {
          if (closing || socket.destroyed) {
            upstream.terminate();
            resolve();
            return;
          }
          wss.handleUpgrade(req, socket, head, peer => {
            const stop = relayPoseSocket(peer, upstream, cookie, assertion, assertionForSession, 30000);
            streams.add(stop);
            peer.once('close', () => streams.delete(stop));
            socket.resume();
            resolve();
          });
        });
      });
    } catch (error) {
      upstream?.terminate();
      deny(error instanceof AuthError ? error.status : 503);
    } finally { pending--; }
  }

  return {
    http,
    upgrade,
    isUpgrade: url => url === streamPath,
    close() {
      closing = true;
      for (const stop of streams) stop();
      wss.close();
    },
  };
}
