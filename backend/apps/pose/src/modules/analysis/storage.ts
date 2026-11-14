// S3 transport follows the verified Catalog pattern, with a Pose-owned prefix/credential.
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, GetBucketVersioningCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export type UploadInput = { mimeType: string; sizeBytes: number; sha256: string; consentVersion: string };
export interface Storage {
  ready(): Promise<void>;
  grant(key: string, input: UploadInput, expires: Date): Promise<{ putUrl: string; headers: Record<string, string> }>;
  head(key: string): Promise<{ version: string; size: number; mime: string } | null>;
  read(key: string, version: string, signal: AbortSignal): Promise<Readable>;
  remove(key: string, version: string, signal: AbortSignal): Promise<void>;
}
export class PoseStorage implements Storage {
  constructor(readonly client: S3Client, readonly bucket: string, private readonly signer = client) {}
  async ready() {
    const result = await this.client.send(new GetBucketVersioningCommand({ Bucket: this.bucket }), { abortSignal: AbortSignal.timeout(3000) });
    if (result.Status !== 'Enabled') throw new Error('Pose bucket must be versioned');
  }
  async grant(key: string, input: UploadInput, expires: Date) {
    const seconds = Math.floor((expires.getTime() - Date.now()) / 1000);
    if (seconds < 1) throw new Error('Grant expired');
    const headers = { 'content-type': input.mimeType, 'if-none-match': '*', 'x-amz-checksum-sha256': Buffer.from(input.sha256, 'hex').toString('base64') };
    const signed = [...Object.keys(headers), 'content-length'];
    const putUrl = await getSignedUrl(this.signer, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: input.mimeType,
      ContentLength: input.sizeBytes, ChecksumSHA256: headers['x-amz-checksum-sha256'], IfNoneMatch: '*' }), {
      expiresIn: seconds, signableHeaders: new Set(signed), unhoistableHeaders: new Set(['x-amz-checksum-sha256']) });
    const actual = new URL(putUrl).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];
    if (!signed.every(h => actual.includes(h))) throw new Error('Missing signed upload constraint');
    return { putUrl, headers };
  }
  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(5000) });
      if (!r.VersionId || r.VersionId === 'null' || !r.ContentType || !Number.isSafeInteger(r.ContentLength)) throw new Error('Invalid versioned object');
      return { version: r.VersionId, size: r.ContentLength!, mime: r.ContentType };
    } catch (error) { if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null; throw error; }
  }
  async read(key: string, version: string, signal: AbortSignal) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, VersionId: version }), { abortSignal: signal });
    if (!(r.Body instanceof Readable) || r.VersionId !== version) { (r.Body as Readable | undefined)?.destroy(); throw new Error('Invalid object stream'); }
    return r.Body;
  }
  async remove(key: string, version: string, signal: AbortSignal) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key, VersionId: version }), { abortSignal: signal });
  }
}
export function loadStorage() {
  const bucket = process.env.POSE_S3_BUCKET, region = process.env.POSE_S3_REGION, endpoint = process.env.POSE_S3_ENDPOINT;
  if (!bucket || !region) throw new Error('Pose object storage is required');
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.origin !== endpoint || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname)))) throw new Error('Invalid object storage endpoint');
  }
  const client = new S3Client({ endpoint, region, forcePathStyle: !!endpoint, maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const signingOrigin = process.env.POSE_S3_SIGNING_ORIGIN;
  if (signingOrigin) {
    const url = new URL(signingOrigin);
    if (url.origin !== signingOrigin || url.protocol !== 'https:') throw new Error('Invalid Pose signing origin');
  }
  const signer = signingOrigin ? new S3Client({ endpoint: signingOrigin, region, forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }) : client;
  return { storage: new PoseStorage(client, bucket, signer),
    close: () => { client.destroy(); if (signer !== client) signer.destroy(); } };
}
