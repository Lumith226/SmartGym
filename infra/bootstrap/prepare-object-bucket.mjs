import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire('/app/backend/apps/catalog/package.json');
const { S3Client, HeadBucketCommand, CreateBucketCommand, GetBucketVersioningCommand, PutBucketVersioningCommand } = require('@aws-sdk/client-s3');
const endpoint = process.env.S3_BOOTSTRAP_ENDPOINT;
const Bucket = process.env.S3_BOOTSTRAP_BUCKET;
if (!endpoint || !Bucket) throw new Error('Missing object storage configuration');
const s3 = new S3Client({ endpoint, forcePathStyle: true, region: 'us-east-1', maxAttempts: 1,
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
try {
  for (let attempt = 0; ; attempt++) {
    try {
      try {
        await s3.send(new HeadBucketCommand({ Bucket }), { abortSignal: AbortSignal.timeout(3000) });
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 404) throw error;
        await s3.send(new CreateBucketCommand({ Bucket }), { abortSignal: AbortSignal.timeout(5000) });
      }
      const version = await s3.send(new GetBucketVersioningCommand({ Bucket }), { abortSignal: AbortSignal.timeout(5000) });
      if (version.Status !== 'Enabled') {
        await s3.send(new PutBucketVersioningCommand({ Bucket, VersioningConfiguration: { Status: 'Enabled' } }), { abortSignal: AbortSignal.timeout(5000) });
      }
      if ((await s3.send(new GetBucketVersioningCommand({ Bucket }), { abortSignal: AbortSignal.timeout(5000) })).Status !== 'Enabled') {
        throw new Error('Bucket versioning is not enabled');
      }
      break;
    } catch (error) {
      if (attempt === 29) throw error;
      await delay(2000);
    }
  }
  console.log('Private bucket ready with versioning: ' + Bucket);
} finally {
  s3.destroy();
}
