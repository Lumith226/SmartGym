import { readFile } from 'node:fs/promises';
import { request } from 'node:https';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import WebSocket, { WebSocketServer } from 'ws';
import { assertionForSession, AuthError } from './identity-client.mjs';
import { problem, readJson, requireSameOrigin } from './auth.mjs';

const PROTOCOL = 'smartgym.pose.v1';
const LIMIT = 262144;
const root = '/api/v1/pose/live-sessions';
const idPath = /^\/api\/v1\/pose\/live-sessions\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
const uuidPath = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const jobPath = new RegExp(`^/api/v1/pose/jobs/(${uuidPath})(/cancel)?$`);
const resultPath = new RegExp(`^/api/v1/pose/results/(${uuidPath})$`);
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
ajv.addSchema(JSON.parse(await readFile(new URL('../data/pose-live-contracts.json', import.meta.url), 'utf8')));
const valid = (name, value) => ajv.getSchema('web-pose-live#/components/schemas/' + name)(value);
const codes = new Set(['NOT_FOUND','LIVE_SESSION_LIMIT','IDEMPOTENCY_CONFLICT','CONSENT_VERSION_UNSUPPORTED','EXERCISE_UNSUPPORTED',
  'LIVE_SESSION_UNAVAILABLE','LIVE_SESSION_EXPIRED','RESULT_EXPIRED','LIVE_SESSION_CONFIG_CHANGED','POSE_LIVE_DISABLED',
  'POSE_UPLOAD_DISABLED','UPLOAD_INCOMPLETE','UPLOAD_EXPIRED','UPLOAD_ALREADY_CLAIMED','CONSENT_VERSION_MISMATCH',
  'JOB_ALREADY_TERMINAL','UPLOAD_QUOTA_EXCEEDED','JOB_QUOTA_EXCEEDED','UPLOAD_METADATA_MISMATCH']);

export async function loadPoseLiveConfig() {
  const live = process.env.BFF_POSE_LIVE_ENABLED === 'true';
  const uploadOrigin = process.env.BFF_POSE_UPLOAD_ORIGIN;
  if (!live && !uploadOrigin && !process.env.BFF_POSE_ORIGIN) return null;
  if (uploadOrigin) {
    const url = new URL(uploadOrigin);
    if (url.origin !== uploadOrigin || !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw new Error('Invalid Pose upload origin');
  }
  const origin = process.env.BFF_POSE_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || new URL(origin).protocol !== 'https:') throw new Error('Private Pose HTTPS origin required');
  const refreshMs = Number(process.env.BFF_POSE_RECHECK_MS ?? 30000);
  if (!Number.isInteger(refreshMs) || refreshMs < 1000 || refreshMs > 30000) throw new Error('Invalid Pose session recheck interval');
  const [key, cert, ca] = await Promise.all(['KEY', 'CERT', 'CA'].map(k => readFile(process.env[`BFF_POSE_TLS_${k}_FILE`], 'utf8')));
  return { origin, tls: { key, cert, ca }, refreshMs, live, uploadOrigin };
}

function callPose(config, path, method, assertion, body, operationKey) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, config.origin), { ...config.tls, agent: false, method, signal: AbortSignal.timeout(5000),
      headers: { authorization: 'Bearer ' + assertion.accessToken, accept: 'application/json',
        ...(operationKey ? { 'idempotency-key': operationKey } : {}),
        ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }) } }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 131072) req.destroy(); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => {
        try {
          if (res.headers['cache-control'] !== 'no-store' || !res.headers['content-type']?.startsWith('application/json')) throw Error('Invalid Pose response');
          resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject); req.end(payload);
  });
}

function routeFor(method, path) {
  if (method === 'POST' && path === root) return { input: 'PoseLiveCreate', output: 'PoseLiveSession', status: 201, location: root, live: true };
  if (method === 'GET' && idPath.test(path)) return { output: 'PoseLiveSession', status: 200, id: idPath.exec(path)[1] };
  if (method === 'GET' && path === '/api/v1/pose/capabilities') return { output: 'PoseCapabilityList', status: 200 };
  if (method === 'POST' && path === '/api/v1/pose/uploads') return { input: 'PoseUploadRequest', output: 'PoseUpload', status: 201, upload: true };
  if (method === 'POST' && path === '/api/v1/pose/jobs') return { input: 'PoseJobCreate', output: 'PoseJob', status: 202, location: '/api/v1/pose/jobs', upload: true };
  const job = jobPath.exec(path);
  if (job && (job[2] ? method === 'POST' : method === 'GET')) return { output: 'PoseJob', status: 200, id: job[1] };
  const result = resultPath.exec(path);
  if (result && method === 'GET') return { output: 'PoseResult', status: 200, id: result[1] };
}

function validGrant(data, config, input) {
  const url = new URL(data.putUrl);
  const names = Object.keys(data.headers).sort();
  return url.origin === config.uploadOrigin && !url.username && !url.password && !url.hash &&
    names.join(',') === 'content-type,if-none-match,x-amz-checksum-sha256' &&
    data.headers['content-type'] === input.mimeType && data.headers['if-none-match'] === '*' &&
    data.headers['x-amz-checksum-sha256'] === Buffer.from(input.sha256, 'hex').toString('base64');
}

export async function handlePoseLive(req, res, webOrigin, config, verify = assertionForSession) {
  try {
    requireSameOrigin(req, webOrigin);
    if (!config) throw new AuthError(503, 'POSE_LIVE_DISABLED');
    const operation = routeFor(req.method, req.url);
    if (!operation) throw new AuthError(404, 'NOT_FOUND');
    if ((operation.live && !config.live) || (operation.upload && !config.uploadOrigin)) throw new AuthError(503, 'POSE_FEATURE_DISABLED');
    let body, operationKey;
    if (operation.input) {
      operationKey = req.headers['idempotency-key'];
      if (typeof operationKey !== 'string' || !/^[A-Za-z0-9._-]{16,128}$/.test(operationKey)) throw new AuthError(400, 'INVALID_IDEMPOTENCY_KEY');
      if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) throw new AuthError(400, 'BAD_REQUEST');
      body = await readJson(req);
      if (!valid(operation.input, body)) throw new AuthError(422, 'VALIDATION_ERROR');
    } else if (req.method === 'POST' && (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0)) {
      throw new AuthError(422, 'VALIDATION_ERROR');
    }
    const assertion = await verify(req.headers.cookie ?? '');
    const { status, data } = await callPose(config, req.url, req.method, assertion, body, operationKey);
    if (status !== operation.status) {
      const safeStatus = [400,401,403,404,409,410,422,429,503].includes(status) ? status : 503;
      return problem(res, safeStatus, codes.has(data?.code) ? data.code : 'POSE_REQUEST_REJECTED');
    }
    if (!valid(operation.output, data) || (operation.id && data.id !== operation.id)) throw Error('Invalid Pose response');
    if (operation.output === 'PoseLiveSession' && data.streamPath !== `${root}/${data.id}/stream`) throw Error('Invalid stream path');
    if (operation.output === 'PoseUpload' && !validGrant(data, config, body)) throw Error('Invalid upload grant');
    if (operation.output === 'PoseCapabilityList') for (const capability of data.items) {
      capability.uploadEnabled &&= Boolean(config.uploadOrigin);
      capability.uploadRepCounting &&= capability.uploadEnabled;
      capability.liveEnabled &&= config.live;
      capability.liveRepCounting &&= config.live;
    }
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', ...(operation.location ? { Location: `${operation.location}/${data.id}` } : {}) });
    res.end(JSON.stringify(data));
  } catch (error) {
    problem(res, error instanceof AuthError ? error.status : 503, error instanceof AuthError ? error.code : 'POSE_UNAVAILABLE');
  }
}

export function relayPoseSocket(peer, upstream, cookie, initial, verify, refreshMs) {
  let closed = false, refreshing = false, expiry;
  function close(code = 1011) {
    if (closed) return;
    closed = true;
    clearTimeout(expiry); clearInterval(refresh);
    for (const socket of [peer, upstream]) {
      if (socket.readyState === WebSocket.OPEN) socket.close(code);
      else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
    }
  }
  function expires(assertion) {
    clearTimeout(expiry);
    expiry = setTimeout(() => close(1008), Math.max(0, Date.parse(assertion.expiresAt) - Date.now()));
  }
  const refresh = setInterval(async () => {
    if (refreshing || closed) return;
    refreshing = true;
    try {
      const assertion = await verify(cookie);
      if (closed) return;
      if (assertion.userId !== initial.userId) return close(1008);
      expires(assertion);
    } catch { close(1008); }
    finally { refreshing = false; }
  }, refreshMs);
  expires(initial);
  function forward(target, data, binary) {
    if (closed || target.readyState !== WebSocket.OPEN) return;
    if (target.bufferedAmount > LIMIT) return close(1008);
    target.send(data, { binary }, error => { if (error) close(); });
  }
  for (const [from, to] of [[peer, upstream], [upstream, peer]]) {
    from.on('error', () => close());
    from.on('close', code => close([1000,1001,1008,1009,1011].includes(code) ? code : 1011));
    from.on('message', (data, binary) => forward(to, data, binary));
  }
  return () => close(1001);
}

export function attachPoseLiveBff(server, webOrigin, config, { verify = assertionForSession, refreshMs = config.refreshMs ?? 30000, fallback } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMIT, maxFragments: 64, maxBufferedChunks: 128, perMessageDeflate: false,
    handleProtocols: offered => offered.has(PROTOCOL) ? PROTOCOL : false });
  const sessions = new Set();
  let pending = 0, closing = false;
  const upgrade = (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const deny = code => { if (!socket.destroyed) socket.end(`HTTP/1.1 ${code} Upgrade Rejected\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`); };
    if (!req.url?.startsWith(root + '/')) { if (fallback) fallback(req, socket, head); else deny(404); return; }
    if (!req.url.endsWith('/stream') || !idPath.test(req.url.slice(0, -7)) || req.method !== 'GET' || head.length ||
        req.headers['sec-websocket-protocol'] !== PROTOCOL || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
        req.headers['sec-websocket-version'] !== '13' || !/^[A-Za-z0-9+/]{22}==$/.test(String(req.headers['sec-websocket-key'] ?? ''))) return deny(400);
    if (!req.socket.encrypted || req.headers.host !== new URL(webOrigin).host || req.headers.origin !== webOrigin ||
        ['cross-site','same-site'].includes(req.headers['sec-fetch-site'])) return deny(403);
    if (closing || pending >= 32 || sessions.size >= 32) return deny(429);
    socket.pause(); pending++;
    void (async () => {
      let upstream;
      try {
        const cookie = req.headers.cookie ?? '';
        const assertion = await verify(cookie);
        if (closing || socket.destroyed) return;
        upstream = new WebSocket(new URL(req.url, config.origin.replace(/^https:/, 'wss:')), PROTOCOL, {
          ...config.tls, headers: { authorization: 'Bearer ' + assertion.accessToken }, maxPayload: LIMIT, maxFragments: 64, maxBufferedChunks: 128,
          handshakeTimeout: 10000, perMessageDeflate: false, followRedirects: false,
        });
        // Keep an error listener across handshake/relay ownership changes.
        upstream.on('error', () => {});
        await new Promise((resolve, reject) => {
          upstream.once('open', resolve);
          upstream.once('error', reject);
          upstream.once('unexpected-response', (_, response) => {
            response.destroy();
            const status = response.statusCode;
            reject(new AuthError([400,401,403,404,409,410,429,503].includes(status) ? status : 503));
          });
        });
        if (closing || socket.destroyed || sessions.size >= 32) { upstream.terminate(); return deny(503); }
        wss.handleUpgrade(req, socket, head, peer => {
          const stop = relayPoseSocket(peer, upstream, cookie, assertion, verify, refreshMs);
          sessions.add(stop); peer.once('close', () => sessions.delete(stop)); socket.resume();
        });
      } catch (error) { upstream?.terminate(); deny(error instanceof AuthError ? error.status : 503); }
      finally { pending--; }
    })().catch(() => socket.destroy());
  };
  server.on('upgrade', upgrade);
  return () => { closing = true; for (const stop of sessions) stop(); wss.close(); };
}
