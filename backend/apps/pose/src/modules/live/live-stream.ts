import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { randomInt } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { authenticate, type AuthConfig, type PoseRequest } from '../../auth.js';
import { modelOf, validateRaw } from '../../contract.js';
import type { EngineHttp } from '../../engine.js';
import { LIVE, LiveStore, type LiveRow, type Rep } from './live-store.js';

const MAX_CONTROL = 4096;
const PATH = /^\/api\/v1\/pose\/live-sessions\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/stream$/i;
function bytes(value: RawData) { return Buffer.isBuffer(value) ? value : Array.isArray(value) ? Buffer.concat(value) : Buffer.from(value); }
function object(value: RawData) {
  const buffer = bytes(value);
  if (buffer.length > MAX_CONTROL) throw new Error('Invalid control size');
  const json: unknown = JSON.parse(buffer.toString('utf8'));
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Invalid control');
  return json as Record<string, unknown>;
}

// Bound dimensions before the engine decoder sees the JPEG. Accept baseline and progressive JPEG.
export function boundedJpeg(jpeg: Buffer) {
  if (jpeg.length < 12 || jpeg.readUInt16BE(0) !== 0xffd8 || jpeg.readUInt16BE(jpeg.length - 2) !== 0xffd9) return false;
  let offset = 2, sizeSeen = false;
  while (offset < jpeg.length - 3) {
    if (jpeg[offset++] !== 0xff) return false;
    while (jpeg[offset] === 0xff) offset++;
    const marker = jpeg[offset++];
    if (offset + 2 > jpeg.length || marker === 0 || marker === 0xd8 || marker === 0xd9) return false;
    const length = jpeg.readUInt16BE(offset);
    if (length < 2 || offset + length > jpeg.length - 2) return false;
    if (marker === 0xda) return sizeSeen && length >= 6;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (sizeSeen || ![0xc0,0xc2].includes(marker) || length < 11 || jpeg[offset + 2] !== 8) return false;
      const height = jpeg.readUInt16BE(offset + 3), width = jpeg.readUInt16BE(offset + 5);
      if (!width || !height || width > LIVE.maxWidth || height > LIVE.maxHeight) return false;
      sizeSeen = true;
    }
    offset += length;
  }
  return false;
}

type Frame = { seq: number; ms: number; jpeg: Buffer };
function packet(frame: Frame, generation: number) {
  const meta = Buffer.from(JSON.stringify({ frame_id: frame.seq, timestamp: frame.ms / 1000, generation }));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(meta.length);
  return Buffer.concat([length, meta, frame.jpeg]);
}

function activeSession(peer: WebSocket, engine: EngineHttp, store: LiveStore, row: LiveRow) {
  const model = modelOf(row.exercise_id), generation = randomInt(1, 2 ** 31);
  const upstream = new WebSocket(new URL('/ws/live', engine.origin.replace(/^https:/, 'wss:')), {
    ...engine.tls, handshakeTimeout: 5000, maxPayload: 524288, maxFragments: 64, maxBufferedChunks: 128,
    perMessageDeflate: false, followRedirects: false,
  });
  let phase: 'connecting' | 'configuring' | 'streaming' = 'connecting';
  let inflight: Frame | undefined, pending: Frame | undefined;
  let latestRaw: Record<string, unknown> | null = null;
  let finishing = false, persisting = false, stopped = false, completed = false, observed = false;
  let lastSeq = 0, lastCapture = -1, lastProcessed = -1, segmentCount = 0, total = 0, invalid = 0;
  let credits = 2, refill = performance.now(), lastWarning = -Infinity;
  const reps: Rep[] = [];
  let timer = setTimeout(() => stop(1011, 'ENGINE_TIMEOUT'), 8000);
  const deadline = setTimeout(() => stop(1008, 'LIVE_SESSION_EXPIRED'), Math.max(0, +new Date(row.expires_at) - Date.now()));
  const send = (message: object) => {
    if (peer.readyState !== WebSocket.OPEN) return;
    if (peer.bufferedAmount > 65536) { stop(1008, 'CLIENT_TOO_SLOW'); return; }
    peer.send(JSON.stringify(message), error => { if (error) stop(1011, 'LIVE_TRANSPORT_ERROR'); });
  };
  const leases = setInterval(() => {
    void store.heartbeat(row).then(ok => { if (!ok) stop(1008, 'LIVE_SESSION_EXPIRED'); }, () => stop(1011, 'LIVE_UNAVAILABLE'));
  }, 10000);
  function resetTimer(ms: number, code: number, reason: string) {
    clearTimeout(timer);
    timer = setTimeout(() => stop(code, reason), ms);
  }
  function stop(code: number, reason?: string) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer); clearTimeout(deadline); clearInterval(leases);
    inflight = undefined; pending = undefined;
    upstream.terminate();
    if (!completed && !persisting) void store.fail(row).catch(() => {});
    if (peer.readyState === WebSocket.OPEN) {
      if (reason && peer.bufferedAmount <= 65536) peer.send(JSON.stringify({ type: 'error', code: reason }));
      peer.close(code);
    }
  }
  function warn(code: string) {
    if (performance.now() - lastWarning < 500) return;
    lastWarning = performance.now();
    send({ type: 'warning', code });
  }
  function badFrame(code: string) { if (++invalid >= 8) stop(1008, code); else warn(code); }
  function dispatch(frame: Frame) {
    inflight = frame;
    if (lastProcessed >= 0 && frame.ms - lastProcessed > 2000) segmentCount = 0;
    resetTimer(15000, 1011, 'ENGINE_TIMEOUT');
    upstream.send(packet(frame, generation), { binary: true }, error => { if (error) stop(1011, 'ENGINE_UNAVAILABLE'); });
  }
  async function finish() {
    if (persisting || stopped || !finishing || inflight) return;
    persisting = true;
    try {
      const id = await store.finish(row, observed ? total : null, reps, latestRaw);
      completed = true;
      send({ type: 'finished', resultId: id });
      stop(1000);
    } catch {
      persisting = false;
      void store.fail(row).catch(() => {});
      stop(1011, 'LIVE_UNAVAILABLE');
    }
  }
  upstream.on('error', () => stop(1011, 'ENGINE_UNAVAILABLE'));
  upstream.on('close', () => stop(1011, 'ENGINE_DISCONNECTED'));
  peer.on('error', () => stop(1011, 'LIVE_TRANSPORT_ERROR'));
  peer.on('close', () => stop(1000));
  upstream.on('message', (value, binary) => {
    if (stopped) return;
    try {
      if (binary) throw new Error('Unexpected binary reply');
      const message = JSON.parse(bytes(value).toString('utf8'));
      if (phase === 'connecting' && message.type === 'connected') {
        phase = 'configuring';
        upstream.send(JSON.stringify({ type: 'configure', exercise: model.poseId, source: 'camera', generation }));
        return;
      }
      if (message.generation !== generation && ['ready', 'result'].includes(message.type)) return;
      if (phase === 'configuring' && message.type === 'ready' && message.exercise === model.poseId && message.source === 'camera') {
        phase = 'streaming';
        resetTimer(15000, 1008, 'LIVE_IDLE');
        send({ type: 'ready', maxFps: LIVE.maxFps, maxFrameBytes: LIVE.maxFrameBytes, maxWidth: LIVE.maxWidth, maxHeight: LIVE.maxHeight });
        return;
      }
      if (phase !== 'streaming' || message.type !== 'result' || !inflight || message.frame_id !== inflight.seq ||
          message.exercise !== model.poseId || message.timestamp !== inflight.ms / 1000 || typeof message.found !== 'boolean') throw new Error('Unexpected engine reply');
      const count = message.rep_count;
      if (!Number.isInteger(count) || count < segmentCount || count > segmentCount + 1 || total + count - segmentCount > 500 || (!message.found && count > segmentCount)) throw new Error('Invalid repetition count');
      observed ||= message.found;
      if (count > segmentCount) {
        total++;
        const rep = { sequence: total, endedAtMs: inflight.ms };
        reps.push(rep); send({ type: 'rep', ...rep });
      }
      segmentCount = count;
      if (message.found) for (const [raw, scope] of [[message.result, 'window'], [message.rep_result, 'rep']] as const) {
        // A retained rep is only current on the frame where the engine completed it.
        if (!raw || (scope === 'rep' && message.just_finished_rep !== true)) continue;
        validateRaw(model, raw, scope);
        if (raw.quality.usable && raw.status !== 'insufficient_data') {
          const { comparison: _comparison, source: _source, ...safe } = raw;
          latestRaw = safe; break;
        }
      }
      lastProcessed = inflight.ms; inflight = undefined;
      if (finishing) { void finish(); return; }
      if (pending) { const frame = pending; pending = undefined; dispatch(frame); }
      else resetTimer(15000, 1008, 'LIVE_IDLE');
    } catch { stop(1011, 'ENGINE_PROTOCOL_ERROR'); }
  });
  peer.on('message', (value, binary) => {
    if (stopped || finishing) return;
    if (phase !== 'streaming') { badFrame('LIVE_NOT_READY'); return; }
    try {
      if (!binary) {
        const message = object(value);
        if (Object.keys(message).length !== 1 || message.type !== 'finish') { badFrame('LIVE_INVALID_MESSAGE'); return; }
        finishing = true; pending = undefined; void finish(); return;
      }
      const buffer = bytes(value);
      if (buffer.length <= 12 || buffer.length > LIVE.maxFrameBytes) { badFrame('LIVE_INVALID_FRAME'); return; }
      const seq = buffer.readUInt32BE(), timestamp = buffer.readBigUInt64BE(4);
      if (seq <= lastSeq || timestamp > 900000n || Number(timestamp) <= lastCapture) { badFrame('LIVE_STALE_FRAME'); return; }
      const now = performance.now();
      credits = Math.min(2, credits + (now - refill) / 100);
      refill = now;
      if (credits < 1 || (lastCapture >= 0 && Number(timestamp) - lastCapture < 90)) { badFrame('LIVE_RATE_LIMIT'); return; }
      credits--;
      const jpeg = buffer.subarray(12);
      if (!boundedJpeg(jpeg)) { badFrame('LIVE_INVALID_FRAME'); return; }
      invalid = 0; lastSeq = seq; lastCapture = Number(timestamp);
      send({ type: 'ack', frameSeq: seq });
      const frame = { seq, ms: lastCapture, jpeg };
      if (inflight) { if (pending) warn('LIVE_FRAME_DROPPED'); pending = frame; }
      else dispatch(frame);
    } catch { badFrame('LIVE_INVALID_MESSAGE'); }
  });
  return () => stop(1001);
}

export function attachPoseLive(server: Server, store: LiveStore, auth: AuthConfig, engine?: EngineHttp) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIVE.maxFrameBytes, maxFragments: 64, maxBufferedChunks: 128,
    perMessageDeflate: false, handleProtocols: offered => offered.has(LIVE.protocol) ? LIVE.protocol : false });
  const sessions = new Set<() => void>();
  let pending = 0, closing = false;
  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    void (async () => {
      const deny = (status: number) => { if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Upgrade Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
      const match = PATH.exec(request.url ?? '');
      if (!match) return deny(404);
      if (request.method !== 'GET' || request.headers['sec-websocket-protocol'] !== LIVE.protocol || head.length ||
          request.headers.upgrade?.toLowerCase() !== 'websocket' || request.headers['sec-websocket-version'] !== '13' ||
          !/^[A-Za-z0-9+/]{22}==$/.test(String(request.headers['sec-websocket-key'] ?? ''))) return deny(400);
      if (!engine || closing) return deny(503);
      if (pending >= 32 || sessions.size >= 4) return deny(429);
      socket.pause(); pending++;
      let row: LiveRow | undefined, upgraded = false;
      try {
        const owner = await authenticate(request as unknown as PoseRequest, auth);
        await engine.ready(AbortSignal.timeout(3000));
        if (closing || socket.destroyed || sessions.size >= 4) return deny(503);
        row = await store.claim(owner, match[1]);
        if (closing || socket.destroyed || sessions.size >= 4) return deny(503);
        wss.handleUpgrade(request, socket, head, peer => {
          const stop = activeSession(peer, engine, store, row!);
          sessions.add(stop); peer.once('close', () => sessions.delete(stop));
          upgraded = true; socket.resume();
        });
      } catch (error) { deny(error instanceof HttpException ? error.getStatus() : 503); }
      finally { pending--; if (row && !upgraded) await store.fail(row).catch(() => {}); }
    })().catch(() => socket.destroy());
  };
  server.on('upgrade', onUpgrade);
  return () => { if (closing) return; closing = true; server.off('upgrade', onUpgrade); for (const stop of sessions) stop(); wss.close(); };
}
