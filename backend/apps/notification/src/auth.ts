import { createPublicKey, verify } from 'node:crypto';
import { request } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { reject, uuid, valid } from './contracts.js';

type Certificates = { key: string; cert: string; ca: string };
export interface AuthConfig {
  tls: Certificates;
  bffFingerprints: string[];
  identity: Certificates & { origin: string; issuer: string };
}

function readJwks(config: AuthConfig['identity']): Promise<unknown> {
  const { origin, issuer: _issuer, ...tls } = config;
  return new Promise((resolve, rejectRead) => {
    const req = request(new URL('/internal/v1/identity/jwks', origin), { ...tls, agent: false, signal: AbortSignal.timeout(3000) }, res => {
      let size = 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 16384) req.destroy(new Error('JWKS too large'));
        else chunks.push(chunk);
      });
      res.on('error', rejectRead);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200 || !res.headers['content-type']?.startsWith('application/json')) throw new Error('JWKS unavailable');
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) { rejectRead(error); }
      });
    });
    req.on('error', rejectRead);
    req.end();
  });
}

export interface NotificationRequest { socket: TLSSocket; headers: Record<string, string | string[] | undefined>; actor?: string }
type Jwk = { kid: string; kty: string; alg: string; use: string; n: string; e: string };

export async function authenticate(req: NotificationRequest, config: AuthConfig): Promise<string> {
  if (!req.socket.encrypted || !req.socket.authorized) reject(401, 'SERVICE_UNAUTHENTICATED');
  const allowed = config.bffFingerprints;
  if (!allowed.includes(req.socket.getPeerCertificate().fingerprint256)) reject(403, 'SERVICE_FORBIDDEN');
  const bearer = req.headers.authorization;
  if (typeof bearer !== 'string' || bearer.length > 4103 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)) {
    reject(401, 'UNAUTHENTICATED');
  }
  const [headerPart, payloadPart, signature] = bearer.slice(7).split('.');
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
  } catch { reject(401, 'UNAUTHENTICATED'); }
  const now = Math.floor(Date.now() / 1000);
  if (!header || header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string' ||
      !/^[A-Za-z0-9._-]{1,80}$/.test(header.kid) || Object.keys(header).some(key => !['alg', 'typ', 'kid'].includes(key)) ||
      !claims || claims.iss !== config.identity.issuer || claims.aud !== 'smartgym-api' ||
      typeof claims.sub !== 'string' || !uuid.test(claims.sub) ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat > now + 5 || claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > 300 ||
      (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) ||
      !Array.isArray(claims.roles) || !claims.roles.length || claims.roles.some((role: unknown) => role !== 'USER' && role !== 'ADMIN')) {
    reject(401, 'UNAUTHENTICATED');
  }
  let jwks;
  try { jwks = await readJwks(config.identity); } catch { reject(503, 'IDENTITY_UNAVAILABLE'); }
  if (!valid('Jwks', jwks)) reject(503, 'IDENTITY_UNAVAILABLE');
  const matching = (jwks as { keys: Jwk[] }).keys.filter(key => key.kid === header.kid);
  if (matching.length !== 1) reject(401, 'UNAUTHENTICATED');
  try {
    const key = createPublicKey({ key: matching[0], format: 'jwk' });
    if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
        !verify('RSA-SHA256', Buffer.from(headerPart + '.' + payloadPart), key, Buffer.from(signature, 'base64url'))) {
      reject(401, 'UNAUTHENTICATED');
    }
  } catch { reject(401, 'UNAUTHENTICATED'); }
  if (claims.emailVerified !== true) reject(403, 'VERIFIED_ACCOUNT_REQUIRED');
  return claims.sub;
}
