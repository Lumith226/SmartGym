import { readFile } from 'node:fs/promises';
import { IdentityKeys } from './modules/accounts/crypto.js';

export interface Config {
  webOrigin: string; keys: IdentityKeys;
  tls: { key: string; cert: string; ca: string };
  callers: Record<string, string[]>;
}
export function validateConfig(config: Config): Config {
  const origin = new URL(config.webOrigin);
  if (origin.origin !== config.webOrigin || (origin.protocol !== 'https:' && !['http://localhost','http://127.0.0.1'].includes(origin.protocol + '//' + origin.hostname))) throw new Error('Invalid web origin');
  const fingerprints = new Set<string>();
  for (const [caller, values] of Object.entries(config.callers)) {
    if (!['bff','notification','catalog','workout','progress','pose','rag'].includes(caller) || !Array.isArray(values) || !values.length) throw new Error('Invalid caller allowlist');
    for (const value of values) {
      if (!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value) || fingerprints.has(value)) throw new Error('Invalid or duplicate certificate fingerprint');
      fingerprints.add(value);
    }
  }
  if (!config.callers.bff?.length || !config.callers.notification?.length) throw new Error('BFF and Notification fingerprints required');
  return config;
}
export async function loadConfig(): Promise<Config> {
  const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error('Missing Identity configuration'); return value; };
  const secret = async (name: string) => {
    const value = (await readFile(required(name), 'utf8')).trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('Invalid Identity secret file');
    return Buffer.from(value, 'base64url');
  };
  const previous = process.env.IDENTITY_PREVIOUS_JWKS_FILE ? JSON.parse(await readFile(process.env.IDENTITY_PREVIOUS_JWKS_FILE, 'utf8')).keys : [];
  if (!Array.isArray(previous)) throw new Error('Invalid previous JWKS file');
  const keys = new IdentityKeys(await readFile(required('IDENTITY_SIGNING_KEY_FILE'), 'utf8'), required('IDENTITY_SIGNING_KID'), required('IDENTITY_ISSUER'),
    await secret('IDENTITY_DELIVERY_KEY_FILE'), await secret('IDENTITY_LIMITER_KEY_FILE'), previous);
  return validateConfig({ keys, webOrigin: required('IDENTITY_WEB_ORIGIN'), callers: JSON.parse(required('IDENTITY_CALLER_FINGERPRINTS')),
    tls: { key: await readFile(required('IDENTITY_TLS_KEY_FILE'), 'utf8'), cert: await readFile(required('IDENTITY_TLS_CERT_FILE'), 'utf8'), ca: await readFile(required('IDENTITY_TLS_CA_FILE'), 'utf8') } });
}
