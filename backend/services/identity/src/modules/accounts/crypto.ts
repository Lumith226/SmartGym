import { argon2, scrypt, randomBytes, timingSafeEqual, createHash, createHmac, createCipheriv,
  createDecipheriv, createPrivateKey, createPublicKey, sign, KeyObject } from 'node:crypto';

export const hashSecret = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueSecret = () => randomBytes(32).toString('base64url');
export class BusyError extends Error {}
let hashesInFlight = 0;
async function withHashSlot<T>(work: () => Promise<T>): Promise<T> {
  if (hashesInFlight >= 4) throw new BusyError('Password hashing capacity reached');
  hashesInFlight++;
  try {
    return await work();
  } finally { hashesInFlight--; }
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return withHashSlot(() => new Promise((resolve, reject) => argon2('argon2id', {
    message: password, nonce: salt, memory: 19456, passes: 2, parallelism: 1, tagLength: 32,
  }, (error, key) => error ? reject(error) : resolve(key))));
}
const legacyHash = /^([a-f0-9]{32}):([A-Za-z0-9+/]{86}==)$/;
export const isLegacyPasswordHash = (encoded: string) => legacyHash.test(encoded);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const result = await derive(password, salt);
  return '$argon2id$v=19$m=19456,t=2,p=1$' + salt.toString('base64').replace(/=+$/, '') + '$' + result.toString('base64').replace(/=+$/, '');
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const legacy = legacyHash.exec(encoded);
  if (legacy) {
    const expected = Buffer.from(legacy[2], 'base64');
    const actual = await withHashSlot<Buffer>(() => new Promise((resolve, reject) => {
      scrypt(password, legacy[1], 64, (error, key) => error ? reject(error) : resolve(key));
    }));
    return timingSafeEqual(actual, expected);
  }
  const match = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/.exec(encoded);
  if (!match) throw new Error('Unsupported password hash parameters');
  const actual = await derive(password, Buffer.from(match[1], 'base64'));
  return timingSafeEqual(actual, Buffer.from(match[2], 'base64'));
}
export class IdentityKeys {
  private readonly signing: KeyObject;
  readonly jwks: { keys: Record<string, unknown>[] };
  constructor(privateKey: string, readonly kid: string, readonly issuer: string,
    private readonly deliveryKey: Buffer, private readonly limiterKey: Buffer,
    oldPublicKeys: Record<string, unknown>[] = []) {
    if (deliveryKey.length !== 32 || limiterKey.length !== 32 || timingSafeEqual(deliveryKey, limiterKey)) throw new Error('Independent 32-byte secret keys required');
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(kid)) throw new Error('Invalid signing key ID');
    if (new URL(issuer).protocol !== 'https:') throw new Error('HTTPS issuer required');
    this.signing = createPrivateKey(privateKey);
    if (this.signing.asymmetricKeyType !== 'rsa' || (this.signing.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('RSA key >=2048 bits required');
    const current = { ...createPublicKey(this.signing).export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
    for (const key of oldPublicKeys) {
      if (Object.keys(key).some(k => !['kty','kid','alg','use','n','e'].includes(k)) || key.kty !== 'RSA' || key.alg !== 'RS256' || key.use !== 'sig' ||
        typeof key.kid !== 'string' || key.kid === kid || typeof key.n !== 'string' || typeof key.e !== 'string' ||
        (createPublicKey({ key, format: 'jwk' }).asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('Invalid previous public signing key');
    }
    if (new Set(oldPublicKeys.map(key => key.kid)).size !== oldPublicKeys.length) throw new Error('Duplicate previous key IDs');
    this.jwks = { keys: [current, ...oldPublicKeys] };
  }
  bucket(value: string): string { return createHmac('sha256', this.limiterKey).update(value).digest('hex'); }
  encrypt(token: string, aad: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.deliveryKey, iv);
    cipher.setAAD(Buffer.from(aad));
    return Buffer.concat([iv, cipher.update(token, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }
  decrypt(encoded: string, aad: string): string {
    const value = Buffer.from(encoded, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.deliveryKey, value.subarray(0, 12));
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(value.subarray(-16));
    return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]).toString('utf8');
  }
  assertion(userId: string, role: string, now: Date, sessionExpiresAt: Date) {
    const issued = Math.floor(now.getTime() / 1000), expires = Math.min(issued + 300, Math.floor(sessionExpiresAt.getTime() / 1000));
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: this.kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: this.issuer, aud: 'smartgym-api', sub: userId,
      iat: issued, exp: expires, roles: [role], emailVerified: true })).toString('base64url');
    const input = header + '.' + payload;
    return { accessToken: input + '.' + sign('RSA-SHA256', Buffer.from(input), this.signing).toString('base64url'),
      expiresAt: new Date(expires * 1000).toISOString(), userId, roles: [role], emailVerified: true };
  }
}
