import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaStorage, ObjectInfo, UploadRequest } from './media-types.js';

function expiresIn(expiresAt: Date) {
  const seconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  if (seconds < 1) throw new Error('Media URL lifetime exhausted');
  return seconds;
}
const missing = (error: unknown) => error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
function objectInfo(object: { VersionId?: string; ContentType?: string; ContentLength?: number }): ObjectInfo {
  if (!object.VersionId || object.VersionId === 'null' || !object.ContentType || !Number.isSafeInteger(object.ContentLength)) {
    throw new Error('Versioned S3 media metadata is required');
  }
  return { version: object.VersionId, mime: object.ContentType, size: object.ContentLength! };
}

export class S3MediaStorage implements MediaStorage {
  constructor(private readonly client: S3Client, private readonly bucket: string, private readonly signer = client) {}

  async putUrl(key: string, input: UploadRequest, expiresAt: Date) {
    const checksum = Buffer.from(input.sha256, 'hex').toString('base64');
    const headers = { 'content-type': input.mime, 'x-amz-checksum-sha256': checksum, 'if-none-match': '*' };
    const required = [...Object.keys(headers), 'content-length'];
    const url = await getSignedUrl(this.signer, new PutObjectCommand({ Bucket: this.bucket, Key: key,
      ContentType: input.mime, ContentLength: input.sizeBytes, ChecksumSHA256: checksum, IfNoneMatch: '*' }), {
      expiresIn: expiresIn(expiresAt), signableHeaders: new Set(required), unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
    });
    const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    if (!required.every(name => signed.includes(name))) throw new Error('S3 did not sign all media upload constraints');
    // The browser supplies the signed Content-Length from the raw Blob body.
    return { url, headers };
  }

  previewUrl(key: string, version: string, expiresAt: Date) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: version,
      ResponseCacheControl: 'no-store' }), { expiresIn: expiresIn(expiresAt) });
  }

  async head(key: string, signal: AbortSignal) {
    try {
      return objectInfo(await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: signal }));
    } catch (error) { if (missing(error)) return null; throw error; }
  }

  async read(key: string, version: string, signal: AbortSignal, range?: string) {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: version, Range: range }), { abortSignal: signal });
      const body = object.Body;
      if (!(body instanceof Readable)) throw new Error('Missing S3 response stream');
      try {
        const info = objectInfo(object);
        if (info.version !== version) throw new Error('Object version mismatch');
        return { ...info, body, contentRange: object.ContentRange };
      } catch (error) { body.destroy(); throw error; }
    } catch (error) { if (missing(error)) return null; throw error; }
  }

  async remove(key: string, version: string, signal: AbortSignal) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key, VersionId: version }), { abortSignal: signal });
  }
}

function origin(name: string) {
  const value = process.env[name];
  if (!value) throw new Error('Missing ' + name);
  const url = new URL(value);
  const localHttp = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.origin !== value || (url.protocol !== 'https:' && !localHttp)) throw new Error('Invalid ' + name);
  return value;
}

export function loadMediaConfig() {
  if (process.env.CATALOG_MEDIA_ENABLED !== 'true') return;
  const publicOrigin = origin('CATALOG_MEDIA_PUBLIC_ORIGIN');
  const endpoint = process.env.CATALOG_MEDIA_S3_ENDPOINT ? origin('CATALOG_MEDIA_S3_ENDPOINT') : undefined;
  const bucket = process.env.CATALOG_MEDIA_BUCKET, region = process.env.CATALOG_MEDIA_REGION;
  const prefix = process.env.CATALOG_MEDIA_PREFIX ?? 'catalog/media';
  if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !region || !/^[a-z0-9-]+$/.test(region) ||
      !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(prefix)) throw new Error('Invalid Catalog media storage configuration');
  const client = new S3Client({ region, endpoint, forcePathStyle: Boolean(endpoint), maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const signer = process.env.CATALOG_MEDIA_S3_SIGNING_ORIGIN ? new S3Client({
    region, endpoint: origin('CATALOG_MEDIA_S3_SIGNING_ORIGIN'), forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  }) : client;
  return { publicOrigin, prefix, storage: new S3MediaStorage(client, bucket, signer),
    close: () => { client.destroy(); if (signer !== client) signer.destroy(); } };
}
