import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { operations, valid } from './contracts.mjs';
import { AuthError, sessionCookie, identityRequest, hasLegacySessionCookie, clearLegacySessionCookie } from './identity-client.mjs';

export const allowedCookies = {
  session: /^__Host-sg_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/,
  clear: /^__Host-sg_session=; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0$/,
};

const publicErrorCodes = new Set(['INVALID_CREDENTIALS', 'EMAIL_UNVERIFIED', 'ACTION_EXPIRED', 'VALIDATION_ERROR', 'RATE_LIMITED', 'UNAUTHENTICATED', 'CSRF_REJECTED', 'BAD_REQUEST', 'NOT_FOUND', 'SERVICE_UNAVAILABLE']);

export function problem(res, status, code, detail) {
  res.writeHead(status, { 'content-type': 'application/problem+json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'connection': 'close' });
  res.end(JSON.stringify({ type: 'about:blank', title: 'Không thể thực hiện yêu cầu', status, code, requestId: randomUUID(), ...(detail ? { detail } : {}) }));
}

export function readJson(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    let text = '', size = 0, settled = false;
    const timer = setTimeout(() => fail(new AuthError(400, 'BAD_REQUEST')), 5000);
    const fail = error => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
    req.setEncoding('utf8');
    req.on('data', chunk => {
      if (settled) return;
      size += Buffer.byteLength(chunk);
      if (size > limit) { fail(new AuthError(400, 'BAD_REQUEST')); return; }
      text += chunk;
    });
    req.on('error', () => fail(new AuthError(400, 'BAD_REQUEST')));
    req.on('aborted', () => fail(new AuthError(400, 'BAD_REQUEST')));
    req.on('end', () => {
      if (settled) return;
      try {
        const body = text ? JSON.parse(text) : {};
        settled = true;
        clearTimeout(timer);
        resolve(body);
      } catch {
        fail(new AuthError(400, 'BAD_REQUEST'));
      }
    });
  });
}

export function requireSameOrigin(req, webOrigin) {
  if (!req.socket.encrypted || req.headers.host !== new URL(webOrigin).host) throw new AuthError(403, 'ORIGIN_REJECTED');
  if (req.method !== 'GET' && (req.headers.origin !== webOrigin || req.headers['x-smartgym-csrf'] !== '1' || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']))) throw new AuthError(403, 'CSRF_REJECTED');
}

export async function handleAuth(req, res, config) {
  if (!config) { problem(res, 503, 'AUTH_UNAVAILABLE'); return; }
  try {
    const url = new URL(req.url, config.webOrigin), operation = operations[req.method + ' ' + url.pathname];
    if (!operation) throw new AuthError(404, 'NOT_FOUND');
    if (url.search) throw new AuthError(400, 'BAD_REQUEST');
    requireSameOrigin(req, config.webOrigin);
    const mutation = req.method !== 'GET';
    if (mutation && req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new AuthError(400, 'BAD_REQUEST');
    let body;
    if (mutation) {
      body = await readJson(req);
      if (operation.request ? !valid(operation.request, body) : !body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) throw new AuthError(422, 'VALIDATION_ERROR');
    }
    let ip = req.socket.remoteAddress ?? ''; if (ip.startsWith('::ffff:')) ip = ip.slice(7); if (!isIP(ip)) throw new AuthError();
    let cookie;
    if (url.pathname === '/api/v1/me' || ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(url.pathname)) {
      try { cookie = sessionCookie(req.headers.cookie ?? ''); } catch (error) { throw operation.errors.includes(401) ? error : new AuthError(400, 'BAD_REQUEST'); }
    }
    const upstream = await identityRequest(config, url.pathname, { method: req.method, body, cookie, ip, origin: req.headers.origin, csrf: req.headers['x-smartgym-csrf'] });
    if (upstream.status !== operation.success) {
      if (!operation.errors.includes(upstream.status) || !valid('Problem', upstream.body)) throw new AuthError();
      if (upstream.status === 429) res.setHeader('Retry-After', /^\d{1,5}$/.test(upstream.retryAfter ?? '') ? upstream.retryAfter : '900');
      throw new AuthError(upstream.status, publicErrorCodes.has(upstream.body.code) ? upstream.body.code : 'AUTH_REQUEST_FAILED');
    }
    if (operation.response ? !valid(operation.response, upstream.body) : upstream.body !== null) throw new AuthError();
    if (operation.response === 'Profile' && !upstream.body.emailVerified) throw new AuthError();
    if (operation.cookie) {
      if (upstream.cookies.length !== 1 || !allowedCookies[operation.cookie].test(upstream.cookies[0])) throw new AuthError();
      res.setHeader('Set-Cookie', hasLegacySessionCookie(req.headers.cookie)
        ? [upstream.cookies[0], clearLegacySessionCookie] : upstream.cookies[0]);
    } else if (upstream.cookies.length) throw new AuthError();
    res.writeHead(upstream.status, { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', ...(operation.response ? { 'content-type': 'application/json; charset=utf-8' } : {}) });
    res.end(operation.response ? JSON.stringify(upstream.body) : undefined);
  } catch (error) {
    const known = error instanceof AuthError;
    problem(res, known ? error.status : 503, known ? error.code : 'AUTH_UNAVAILABLE');
  }
}
