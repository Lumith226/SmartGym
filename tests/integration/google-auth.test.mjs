import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createGoogleAuth } from '../../frontend/server/google-auth.mjs';

test('Google callback verifies state, PKCE and signed claims before requesting a SmartGym session', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const clientId = 'demo.apps.googleusercontent.com';
  const webOrigin = 'https://web.test';
  const keys = [{ ...publicKey.export({ format: 'jwk' }), kid: 'demo', alg: 'RS256', use: 'sig' }];
  const claims = { iss: 'https://accounts.google.com', aud: clientId, sub: 'demo-subject', email: 'demo@gmail.com', email_verified: true, name: 'Demo' };
  let nonce, altered = {}, badSignature = false, exchanges = 0, identityCalls = 0, identityStatus = 200;
  function jwt(payload) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = encode({ alg: 'RS256', kid: 'demo' }) + '.' + encode(payload);
    return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  }
  let exchange;
  const session = `__Host-sg_session=${'a'.repeat(43)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
  const handler = createGoogleAuth({
    configuration: async () => ({ clientId, clientSecret: 'test-only' }),
    fetchGoogle: async (url, options) => {
      if (url.endsWith('/certs')) return Response.json({ keys });
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      exchange = options.body;
      exchanges++;
      const iat = Math.floor(Date.now() / 1000);
      const token = jwt({ ...claims, iat, exp: iat + 600, nonce, ...altered });
      return Response.json({ id_token: badSignature ? token.slice(0, token.lastIndexOf('.') + 1) + 'AA' : token });
    },
    requestIdentity: async (_config, path, request) => {
      identityCalls++;
      assert.equal(path, '/internal/v1/identity/google-login');
      assert.deepEqual(request.body, { subject: 'demo-subject', email: 'demo@gmail.com', displayName: 'Demo' });
      return { status: identityStatus, cookies: [session], body: { id: '00000000-0000-4000-8000-000000000001', email: 'demo@gmail.com',
        displayName: 'Demo', timeZone: 'Asia/Bangkok', roles: ['USER'], emailVerified: true, createdAt: new Date().toISOString() } };
    },
  });
  async function call(url, cookie = '') {
    const response = {};
    await handler({ url, method: 'GET', headers: { host: 'web.test', cookie }, socket: { encrypted: true, remoteAddress: '127.0.0.1' } }, {
      writeHead(status, headers) { Object.assign(response, { status, headers }); }, end() {},
    }, { webOrigin });
    return response.headers;
  }
  const start = await call('/api/v1/auth/google');
  const redirect = new URL(start.location);
  assert.equal(redirect.origin, 'https://accounts.google.com');
  assert.equal(redirect.searchParams.get('scope'), 'openid email profile');
  const state = redirect.searchParams.get('state');
  nonce = redirect.searchParams.get('nonce');
  const cookie = start['set-cookie'][0].split(';')[0];
  assert.match(start['set-cookie'][0], /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  const callback = '/api/v1/auth/google/callback?code=test-code&state=';
  assert.equal((await call(callback + 'wrong-state', cookie)).location, '/dang-nhap?google=failed');
  assert.equal(exchanges, 0);
  for (const invalid of [{ nonce: 'wrong' }, { aud: 'wrong' }, { exp: 0 }, { email_verified: false }, { email: 'external@example.org' }]) {
    altered = invalid;
    assert.equal((await call(callback + state, cookie)).location, '/dang-nhap?google=failed');
  }
  badSignature = true;
  assert.equal((await call(callback + state, cookie)).location, '/dang-nhap?google=failed');
  assert.equal(identityCalls, 0);
  altered = {};
  badSignature = false;
  const success = await call(callback + state, cookie);
  assert.equal(success.location, '/app');
  assert.equal(success['set-cookie'][1], session);
  assert.match(success['set-cookie'][0], /Max-Age=0$/);
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'), redirect.searchParams.get('code_challenge'));
  identityStatus = 409;
  assert.equal((await call(callback + state, cookie)).location, '/dang-nhap?google=email-exists');
  assert.equal(identityCalls, 2);
});
