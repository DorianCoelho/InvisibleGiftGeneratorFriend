import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PreconditionError, isPrecondition } from './preconditionError.js';

const isMissing = (err) => err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404;

/**
 * Cliente mínimo sobre la API S3 de Cloudflare R2.
 * `etag` se conserva tal cual lo devuelve el servicio para poder usarlo en If-Match.
 */
export function createS3ObjectClient({ accountId, bucket, accessKeyId, secretAccessKey }) {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    async headBucket() {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    },

    async get(key) {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { body: await out.Body.transformToString(), etag: out.ETag };
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },

    async put(key, body, cond = {}) {
      try {
        const out = await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'application/json; charset=utf-8',
            ...(cond.ifNoneMatch ? { IfNoneMatch: cond.ifNoneMatch } : {}),
            ...(cond.ifMatch ? { IfMatch: cond.ifMatch } : {}),
          }),
        );
        return { etag: out.ETag };
      } catch (err) {
        if (isPrecondition(err)) throw new PreconditionError();
        throw err;
      }
    },

    async delete(key, cond = {}) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
            ...(cond.ifMatch ? { IfMatch: cond.ifMatch } : {}),
          }),
        );
      } catch (err) {
        if (isMissing(err)) return;
        if (isPrecondition(err)) throw new PreconditionError();
        throw err;
      }
    },

    async list(prefix) {
      const keys = [];
      let token;
      do {
        const out = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const item of out.Contents ?? []) keys.push(item.Key);
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (token);
      return keys.sort();
    },

    async copy(from, to) {
      const source = `${bucket}/${from.split('/').map(encodeURIComponent).join('/')}`;
      await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: source }));
    },
  };
}
