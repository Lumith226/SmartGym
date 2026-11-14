import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { allowedCookies, requireSameOrigin } from './auth.mjs';
import { valid } from './contracts.mjs';
import { identityRequest, sessionCookie, hasLegacySessionCookie, clearLegacySessionCookie } from './identity-client.mjs';

const callback = '/api/v1/auth/google/callback';
const contextCookie = '__Host-sg_google';
const cookieOptions = '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=';
const secret = () => randomBytes(32).toString('base64url');
const opaque = /^[A-Za-z0-9_-]{43}$/;

async function loadGoogleConfig() {
  const clientId = process.env.BFF_GOOGLE_CLIENT_ID;
  const file = process.env.BFF_GOOGLE_CLIENT_SECRET_FILE;
  const directSecret = process.env.BFF_GOOGLE_CLIENT_SECRET;
  if (!clientId || (!file && !directSecret)) return null;
  const clientSecret = directSecret ? directSecret.trim() : (await readFile(file, 'utf8')).trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret) throw new Error('Invalid Google OAuth config');
  return { clientId, clientSecret };
}

export function googleIdentity(idToken, jwks, clientId, nonce, now = Date.now() / 1000) {
  if (typeof idToken !== 'string' || idToken.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) throw new Error('Invalid ID token');
  const [header, payload, signature] = idToken.split('.');
  const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  const { alg, kid } = decode(header);
  const key = jwks.keys?.find(item => item.kid === kid && item.kty === 'RSA' && item.alg === 'RS256' && item.use === 'sig');
  if (alg !== 'RS256' || typeof kid !== 'string' || !key || !verify('RSA-SHA256', Buffer.from(header + '.' + payload), createPublicKey({ key, format: 'jwk' }), Buffer.from(signature, 'base64url'))) {
    throw new Error('Invalid Google signature');
  }
  const claims = decode(payload);
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== clientId ||
      (claims.azp !== undefined && claims.azp !== clientId) || claims.nonce !== nonce ||
      !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub) ||
      claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.length > 254) {
    throw new Error('Invalid Google claims');
  }
  const email = claims.email.toLowerCase();
  // For password recovery, accept only email domains where Google is authoritative.
  const domain = email.split('@')[1];
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || (domain !== 'gmail.com' && claims.hd?.toLowerCase?.() !== domain)) {
    throw new Error('Google is not authoritative for this email');
  }
  const name = typeof claims.name === 'string' ? claims.name.trim() : '';
  const displayName = Array.from(name.replace(/\p{Cc}/gu, '')).slice(0, 120).join('').trim() || 'Người dùng SmartGym';
  return { subject: claims.sub, email, displayName };
}

function redirect(res, location, cookies = []) {
  res.writeHead(303, { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'set-cookie': cookies });
  res.end();
}

export function createGoogleAuth({ configuration = loadGoogleConfig, fetchGoogle = fetch, requestIdentity = identityRequest } = {}) {
  return async function handleGoogleAuth(req, res, identity) {
    const clear = contextCookie + '=' + cookieOptions + '0';
    try {
      requireSameOrigin(req, identity.webOrigin);
      const url = new URL(req.url, identity.webOrigin);
      const config = await configuration();
      if (!config || req.method !== 'GET') return redirect(res, '/dang-nhap?google=unavailable', [clear]);
      const redirectUri = identity.webOrigin + callback;
      if (url.pathname !== callback) {
        const state = secret(), nonce = secret(), verifier = secret();
        const destination = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        destination.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code',
          scope: 'openid email profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
        return redirect(res, destination.href, [contextCookie + '=' + [state, nonce, verifier].join('.') + cookieOptions + '600']);
      }

      const contexts = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(contextCookie + '='));
      const [state, nonce, verifier, extra] = contexts[0]?.slice(contextCookie.length + 1).split('.') ?? [];
      const states = url.searchParams.getAll('state'), codes = url.searchParams.getAll('code');
      if (contexts.length !== 1 || extra !== undefined || ![state, nonce, verifier, states[0]].every(value => opaque.test(value ?? '')) ||
          states.length !== 1 || !timingSafeEqual(Buffer.from(state), Buffer.from(states[0])) || codes.length !== 1 ||
          !codes[0] || codes[0].length > 2048 || url.searchParams.has('error')) return redirect(res, '/dang-nhap?google=failed', [clear]);

      const options = { redirect: 'error', signal: AbortSignal.timeout(6000) };
      const tokens = await fetchGoogle('https://oauth2.googleapis.com/token', { ...options, method: 'POST',
        body: new URLSearchParams({ grant_type: 'authorization_code', code: codes[0], client_id: config.clientId,
          client_secret: config.clientSecret, redirect_uri: redirectUri, code_verifier: verifier }) });
      if (!tokens.ok) throw new Error('Google token exchange failed');
      const keyResponse = await fetchGoogle('https://www.googleapis.com/oauth2/v3/certs', options);
      if (!keyResponse.ok) throw new Error('Google key retrieval failed');
      const body = googleIdentity((await tokens.json()).id_token, await keyResponse.json(), config.clientId, nonce);
      const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
      if (!isIP(ip)) throw new Error('Invalid peer IP');
      const result = await requestIdentity(identity, '/internal/v1/identity/google-login', {
        method: 'POST', body, ip, cookie: sessionCookie(req.headers.cookie ?? ''),
      });
      if (result.status === 409) return redirect(res, '/dang-nhap?google=email-exists', [clear]);
      if (result.status !== 200 || !valid('Profile', result.body) || !result.body.emailVerified || result.cookies.length !== 1 ||
          !allowedCookies.session.test(result.cookies[0])) throw new Error('Google session could not be created');
      const cookies = [clear, result.cookies[0]];
      if (hasLegacySessionCookie(req.headers.cookie)) cookies.push(clearLegacySessionCookie);
      return redirect(res, '/app', cookies);
    } catch {
      return redirect(res, '/dang-nhap?google=failed', [clear]);
    }
  };
}

export const handleGoogleAuth = createGoogleAuth();
