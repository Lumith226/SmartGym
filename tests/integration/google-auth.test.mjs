import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { authenticatePassword, createGoogleHandler } from '../../frontend/server/auth-js.mjs';

const identityProfile = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@gmail.com',
  displayName: 'Demo', timeZone: 'Asia/Bangkok', roles: ['USER'], emailVerified: true, createdAt: new Date().toISOString() };
const webOrigin = 'https://web.test';
const secret = randomBytes(32).toString('base64url');

test('Auth.js Credentials uses Identity and preserves login results', async () => {
  process.env.AUTH_SECRET = secret;
  const config = { webOrigin };
  const body = { email: 'demo@gmail.com', password: 'password123' };
  for (const status of [200, 401, 429]) {
    const upstream = { status, body: status === 200 ? identityProfile : {}, cookies: [], retryAfter: '30' };
    const result = await authenticatePassword(config, { method: 'POST', body, ip: '127.0.0.1' }, async (options, path, request) => {
      assert.equal(options, config);
      assert.equal(path, '/api/v1/auth/login');
      assert.deepEqual(request.body, body);
      assert.equal(request.ip, '127.0.0.1');
      return upstream;
    });
    assert.equal(result, upstream);
  }
});

test('Google callback verifies state, PKCE and signed claims before requesting a SmartGym session', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const clientId = 'demo.apps.googleusercontent.com';
  const claims = { iss: 'https://accounts.google.com', aud: clientId, sub: 'demo-subject', email: 'demo@gmail.com', email_verified: true, name: 'Demo' };
  let nonce, altered = {}, badSignature = false, exchanges = 0, identityCalls = 0, identityStatus = 200;
  function jwt(payload) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = encode({ alg: 'RS256', kid: 'demo' }) + '.' + encode(payload);
    return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  }
  let exchange;
  const session = `__Host-sg_session=${'a'.repeat(43)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
  const handler = createGoogleHandler({
    configuration: async () => ({ secret, google: { clientId, clientSecret: 'test-only' } }),
    keys: publicKey,
    fetchGoogle: async (url, options) => {
      if (String(url).endsWith('/.well-known/openid-configuration')) return Response.json({
        issuer: 'https://accounts.google.com',
        authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_endpoint: 'https://oauth2.googleapis.com/token',
        userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
        code_challenge_methods_supported: ['S256'],
      });
      assert.equal(String(url), 'https://oauth2.googleapis.com/token');
      exchange = options.body;
      exchanges++;
      const iat = Math.floor(Date.now() / 1000);
      const token = jwt({ ...claims, iat, exp: iat + 600, nonce, ...altered });
      return Response.json({ access_token: 'fake', token_type: 'Bearer',
        id_token: badSignature ? token.slice(0, token.lastIndexOf('.') + 1) + 'AA' : token });
    },
    requestIdentity: async (_config, path, request) => {
      identityCalls++;
      assert.equal(path, '/internal/v1/identity/google-login');
      assert.deepEqual(request.body, { subject: 'demo-subject', email: 'demo@gmail.com', displayName: 'Demo' });
      return { status: identityStatus, cookies: [session], body: identityProfile };
    },
  });
  async function call(path, cookie = '', body, origin = webOrigin) {
    return handler(new Request(webOrigin + path, { method: body ? 'POST' : 'GET', headers: { cookie, origin }, body }),
      { webOrigin }, '127.0.0.1');
  }
  const cookies = response => response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
  const location = response => response.headers.get('location');
  const csrf = await call('/api/auth/csrf');
  const csrfToken = (await csrf.json()).csrfToken;
  const form = new URLSearchParams({ csrfToken, callbackUrl: '/app' });
  assert.equal((await call('/api/auth/signin/google', cookies(csrf), form, 'https://other.test')).status, 403);
  assert.equal((await call('/api/auth/session')).status, 404);
  const start = await call('/api/auth/signin/google', cookies(csrf), form);
  const redirect = new URL(location(start));
  assert.equal(redirect.origin, 'https://accounts.google.com');
  assert.equal(redirect.searchParams.get('redirect_uri'), webOrigin + '/api/auth/callback/google');
  const state = redirect.searchParams.get('state');
  nonce = redirect.searchParams.get('nonce');
  const cookie = [cookies(csrf), cookies(start)].filter(Boolean).join('; ');
  assert.ok(start.headers.getSetCookie().some(value => /state=.*HttpOnly; Secure; SameSite=Lax/.test(value)));
  const callback = '/api/auth/callback/google?code=test-code&state=';
  assert.equal(location(await call(callback + 'wrong-state', cookie)), webOrigin + '/dang-nhap?google=failed');
  assert.equal(exchanges, 0);
  for (const invalid of [{ nonce: 'wrong' }, { aud: 'wrong' }, { exp: 0 }, { email_verified: false }, { email: 'external@example.org' }]) {
    altered = invalid;
    assert.equal(location(await call(callback + state, cookie)), webOrigin + '/dang-nhap?google=failed');
  }
  badSignature = true;
  assert.equal(location(await call(callback + state, cookie)), webOrigin + '/dang-nhap?google=failed');
  assert.equal(identityCalls, 0);
  altered = {};
  badSignature = false;
  const success = await call(callback + state, cookie);
  assert.equal(location(success), webOrigin + '/app');
  assert.ok(success.headers.getSetCookie().includes(session));
  assert.ok(success.headers.getSetCookie().some(value => /state=.*Max-Age=0/.test(value)));
  assert.ok(success.headers.getSetCookie().every(value => !value.includes('authjs.session-token')));
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'), redirect.searchParams.get('code_challenge'));
  identityStatus = 409;
  assert.equal(location(await call(callback + state, cookie)), webOrigin + '/dang-nhap?google=link-conflict');
  identityStatus = 429;
  const limited = await call(callback + state, cookie);
  assert.equal(location(limited), webOrigin + '/dang-nhap?google=rate-limited');
  assert.ok(!limited.headers.getSetCookie().includes(session));
  assert.equal(identityCalls, 3);
});
