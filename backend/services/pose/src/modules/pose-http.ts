import { type PoseRequest } from '../auth.js';
import { reject, uuid, valid } from '../contract.js';

export type Response = { status(code: number): Response; json(value: unknown): void; setHeader(name: string, value: string): void };
export type Request = PoseRequest & { actor: string; url?: string };
export function body<T>(schema: string, value: unknown): T { if (!valid(schema, value)) reject(422, 'VALIDATION_ERROR'); return value as T; }
export function id(value: string) { if (!uuid.test(value)) reject(400, 'INVALID_ID'); return value; }
export function key(value: unknown) { if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{16,128}$/.test(value)) reject(400, 'INVALID_IDEMPOTENCY_KEY'); return value; }
