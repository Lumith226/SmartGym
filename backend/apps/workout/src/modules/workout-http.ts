import { reject, uuid } from '../contract.js';

export type Response = { status(code: number): Response; json(value: unknown): void; setHeader(name: string, value: string): void };
export function id(value: string) { if (!uuid.test(value)) reject(400, 'BAD_REQUEST'); return value; }
export function match(value: unknown) {
  if (value === undefined) reject(428, 'PRECONDITION_REQUIRED');
  if (typeof value !== 'string' || !/^"v[1-9][0-9]{0,9}"$/.test(value)) reject(400, 'INVALID_ETAG');
  const version = Number(value.slice(2, -1));
  if (version > 2147483647) reject(400, 'INVALID_ETAG');
  return version;
}
