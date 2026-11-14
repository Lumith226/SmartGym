import { identifier, reject, valid } from './admin-contract.js';

export type ResponseHeaders = { setHeader(name: string, value: string): void };
export function exerciseId(value: string) {
  if (!identifier.test(value)) reject(400, 'BAD_REQUEST');
  return value;
}
export function idempotencyKey(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{16,128}$/.test(value)) reject(400, 'INVALID_IDEMPOTENCY_KEY');
  return value;
}
export function matchVersion(value: unknown) {
  if (value === undefined) reject(428, 'PRECONDITION_REQUIRED');
  if (typeof value !== 'string' || !/^"v[1-9][0-9]{0,9}"$/.test(value)) reject(400, 'INVALID_ETAG');
  const version = Number(value.slice(2, -1));
  if (version > 2147483647) reject(400, 'INVALID_ETAG');
  return version;
}
export function bodyOf<T>(name: string, body: unknown) {
  if (!valid(name, body)) reject(422, 'VALIDATION_ERROR');
  return body as T;
}
export function noBody(body: unknown) {
  if (body != null && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) reject(422, 'VALIDATION_ERROR');
}
export function reasonOf(value: string) {
  const reason = value.trim();
  if (!reason || reason.includes('\u0000')) reject(422, 'VALIDATION_ERROR');
  return reason;
}
export function respond<T extends { version: number; detail: unknown }>(res: ResponseHeaders, result: T): T['detail'] {
  res.setHeader('ETag', '"v' + result.version + '"');
  return result.detail;
}
