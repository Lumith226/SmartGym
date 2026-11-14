import type { Readable } from 'node:stream';

export const mediaMime = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'] as const;
export type MediaMime = typeof mediaMime[number];
export const mediaSize = (mime: string) => (mime.startsWith('image/') ? 10 : 100) * 1024 * 1024;
export type UploadRequest = { mime: MediaMime; sizeBytes: number; sha256: string };
export type UploadState = 'RESERVED' | 'VERIFYING' | 'READY' | 'REJECTED' | 'EXPIRED';
export type Upload = Record<string, unknown> & {
  id: string; object_key: string; actor_id: string; object_version: string | null;
  expected_mime: MediaMime; expected_bytes: number; expected_sha256: string;
  status: UploadState; expires_at: Date; error_code: string | null;
  attempts: number; lease_token: string | null; revoked_at: Date | null; verified_at: Date | null;
};
export type ObjectInfo = { version: string; mime: string; size: number };
export type ObjectBody = ObjectInfo & { body: Readable; contentRange?: string };
export interface MediaStorage {
  putUrl(key: string, input: UploadRequest, expiresAt: Date): Promise<{ url: string; headers: Record<string, string> }>;
  previewUrl(key: string, version: string, expiresAt: Date): Promise<string>;
  head(key: string, signal: AbortSignal): Promise<ObjectInfo | null>;
  read(key: string, version: string, signal: AbortSignal, range?: string): Promise<ObjectBody | null>;
  remove(key: string, version: string, signal: AbortSignal): Promise<void>;
}
export class InvalidMedia extends Error {
  constructor(readonly code: string) { super(code); }
}
