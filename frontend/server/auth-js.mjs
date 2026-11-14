import { Auth, customFetch, raw, skipCSRFCheck } from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import Google from '@auth/core/providers/google';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { valid } from './contracts.mjs';
import { AuthError, clearLegacySessionCookie, hasLegacySessionCookie, identityRequest, identitySessionCookie, sessionCookie } from './identity-client.mjs';

const googleIssuer = 'https://accounts.google.com';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 6000 });
const loginPage = '/dang-nhap';
const loginFailed = loginPage + '?google=failed';
let configuration;

export function loadAuthJsConfig() {
  return configuration ??= readConfiguration();
}

async function readConfiguration() {
  const secret = process.env.AUTH_SECRET?.trim() ||
    (process.env.BFF_AUTHJS_SECRET_FILE && (await readFile(process.env.BFF_AUTHJS_SECRET_FILE, 'utf8')).trim());
  if (!secret || secret.length < 32) throw new Error('Configure AUTH_SECRET or BFF_AUTHJS_SECRET_FILE for SmartGym Web');
  const clientId = process.env.BFF_GOOGLE_CLIENT_ID;
  const file = process.env.BFF_GOOGLE_CLIENT_SECRET_FILE;
  const direct = process.env.BFF_GOOGLE_CLIENT_SECRET;
  if (!clientId || (!file && !direct)) return { secret };
  const clientSecret = direct?.trim() || (file && (await readFile(file, 'utf8')).trim());
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret) throw new Error('Invalid Google OAuth configuration');
  return { secret, google: { clientId, clientSecret } };
}

function authConfig(secret, providers) {
  return {
    secret, providers, basePath: '/api/auth', trustHost: true, useSecureCookies: true,
    session: { strategy: 'jwt' }, pages: { signIn: loginPage, error: loginPage },
    // Avoid logging provider responses or credentials from callback errors.
    logger: { error: error => {
      if (error.type !== 'CredentialsSignin') console.warn('[Auth.js]', error.type ?? error.name);
    } },
  };
}

export async function authenticatePassword(config, request, requestIdentity = identityRequest) {
  const { secret } = await loadAuthJsConfig();
  let upstream;
  const auth = authConfig(secret, [Credentials({
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      upstream = await requestIdentity(config, '/api/v1/auth/login', {
        ...request, body: { email: credentials.email, password: credentials.password },
      });
      return upstream.status === 200 && valid('Profile', upstream.body) ? { id: upstream.body.id } : null;
    },
  })]);
  // This request is created only after the public JSON endpoint verifies TLS,
  // same-origin CSRF headers and the complete Login contract.
  auth.skipCSRFCheck = skipCSRFCheck;
  auth.raw = raw;
  auth.callbacks = { signIn: () => '/app' };
  try {
    const result = await Auth(new Request(config.webOrigin + '/api/auth/callback/credentials', {
      method: 'POST',
      body: new URLSearchParams({ email: request.body.email, password: request.body.password }),
    }), auth);
    if (result.redirect !== config.webOrigin + '/app') throw new AuthError();
    return upstream;
  } catch (error) {
    if (error?.type === 'CredentialsSignin' && upstream && upstream.status !== 200) return upstream;
    throw new AuthError();
  }
}

async function verifiedGoogleIdentity(account, profile, clientId, keys) {
  if (!account?.id_token) throw new AuthError();
  // Auth.js verifies the protocol and nonce. Verify the ID token signature
  // with Google's public keys before Identity trusts the email for recovery.
  const { payload: claims } = await jwtVerify(account.id_token, keys, {
    issuer: googleIssuer, audience: clientId, algorithms: ['RS256'],
    requiredClaims: ['sub', 'iat', 'exp', 'nonce'], maxTokenAge: '15m', clockTolerance: 10,
  });
  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  const domain = email.split('@')[1];
  if (claims.sub !== profile?.sub || !/^[\x21-\x7e]{1,255}$/.test(claims.sub) ||
      (claims.azp !== undefined && claims.azp !== clientId) || claims.email_verified !== true ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email) ||
      (domain !== 'gmail.com' && (typeof claims.hd !== 'string' || claims.hd.toLowerCase() !== domain))) throw new AuthError();
  const name = typeof claims.name === 'string' ? claims.name.trim() : '';
  const displayName = Array.from(name.replace(/\p{Cc}/gu, '')).slice(0, 120).join('').trim() || 'Người dùng SmartGym';
  return { subject: claims.sub, email, displayName };
}

const routes = new Set(['GET /api/auth/providers', 'GET /api/auth/csrf', 'POST /api/auth/signin/google', 'GET /api/auth/callback/google']);

export function createGoogleHandler({
  configuration = loadAuthJsConfig, requestIdentity = identityRequest, keys = googleKeys, fetchGoogle = fetch,
} = {}) {
  return async function googleAuth(request, config, ip) {
    const { origin, pathname, search } = new URL(request.url);
    if (origin !== config.webOrigin || !routes.has(request.method + ' ' + pathname)) return new Response(null, { status: 404 });
    if (request.method === 'POST' && (search || request.headers.get('origin') !== origin)) return new Response(null, { status: 403 });
    const { google, secret } = await configuration();
    if (!google) return new Response(null, { status: 503 });
    let identityCookie;
    const auth = authConfig(secret, [Google({
      ...google,
      checks: ['state', 'pkce', 'nonce'],
      [customFetch]: (url, options) => fetchGoogle(url, { ...options, signal: AbortSignal.timeout(6000) }),
    })]);
    auth.callbacks = {
      async signIn({ account, profile }) {
        if (account?.provider !== 'google' || !isIP(ip)) return loginFailed;
        try {
          const body = await verifiedGoogleIdentity(account, profile, google.clientId, keys);
          const result = await requestIdentity(config, '/internal/v1/identity/google-login', {
            method: 'POST', body, ip, cookie: sessionCookie(request.headers.get('cookie') ?? ''),
          });
          if (result.status === 409) return loginPage + '?google=link-conflict';
          if (result.status === 429) return loginPage + '?google=rate-limited';
          if (result.status === 403 && result.body?.code === 'EMAIL_UNVERIFIED') return loginPage + '?google=verify-email';
          if (result.status !== 200 || !valid('Profile', result.body) || !result.body.emailVerified ||
              result.cookies.length !== 1 || !identitySessionCookie.test(result.cookies[0])) return loginFailed;
          identityCookie = result.cookies[0];
          // Returning a redirect ends the Auth.js callback before issuing its JWT.
          return '/app';
        } catch {
          return loginFailed;
        }
      },
    };
    const response = await Auth(request, auth);
    const headers = new Headers(response.headers);
    const location = headers.get('location');
    if (pathname === '/api/auth/callback/google' && !identityCookie && location) {
      const target = new URL(location, origin);
      if (target.pathname !== loginPage || !target.searchParams.has('google')) headers.set('location', origin + loginFailed);
    }
    if (identityCookie && location === origin + '/app') {
      headers.append('set-cookie', identityCookie);
      if (hasLegacySessionCookie(request.headers.get('cookie') ?? '')) headers.append('set-cookie', clearLegacySessionCookie);
    }
    headers.set('cache-control', 'no-store');
    headers.set('referrer-policy', 'no-referrer');
    return new Response(response.body, { status: response.status, headers });
  };
}

export const handleGoogleAuth = createGoogleHandler();
