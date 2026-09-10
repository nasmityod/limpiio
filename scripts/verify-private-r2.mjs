#!/usr/bin/env node

import 'dotenv/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

const required = {
  endpoint: process.env.R2_ENDPOINT?.trim(),
  bucket: process.env.R2_PRIVATE_BUCKET_NAME?.trim(),
  accessKeyId: process.env.R2_PRIVATE_ACCESS_KEY_ID?.trim(),
  secretAccessKey: process.env.R2_PRIVATE_SECRET_ACCESS_KEY?.trim(),
};

const configured = {
  endpointConfigured: Boolean(required.endpoint),
  bucketConfigured: Boolean(required.bucket),
  privateAccessKeyConfigured: Boolean(required.accessKeyId),
  privateSecretConfigured: Boolean(required.secretAccessKey),
};

console.log(JSON.stringify(configured));

if (Object.values(configured).some((value) => !value)) {
  process.exitCode = 1;
  throw new Error(
    'Faltan variables privadas de R2. No se ejecutó la prueba.',
  );
}

const client = new S3Client({
  region: 'auto',
  endpoint: required.endpoint,
  credentials: {
    accessKeyId: required.accessKeyId,
    secretAccessKey: required.secretAccessKey,
  },
  forcePathStyle: true,
});

const key = `proofs/integration-test-${randomUUID()}.webp`;
const body = Buffer.from('mundotech-r2-private-integration-test');

const results = {
  putObject: 'NOT_RUN',
  headObjectAfterPut: 'NOT_RUN',
  signedGet: 'NOT_RUN',
  signedGetStatus: null,
  deleteObject: 'NOT_RUN',
  headObjectAfterDelete: 'NOT_RUN',
};

let objectMayExist = false;

try {
  await client.send(
    new PutObjectCommand({
      Bucket: required.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/octet-stream',
      CacheControl: 'private, no-store',
    }),
  );

  objectMayExist = true;
  results.putObject = 'PASS';

  await client.send(
    new HeadObjectCommand({
      Bucket: required.bucket,
      Key: key,
    }),
  );

  results.headObjectAfterPut = 'PASS';

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: required.bucket,
      Key: key,
    }),
    { expiresIn: 60 },
  );

  const response = await fetch(signedUrl, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
  });

  results.signedGetStatus = response.status;
  results.signedGet = response.ok ? 'PASS' : 'FAIL';

  await client.send(
    new DeleteObjectCommand({
      Bucket: required.bucket,
      Key: key,
    }),
  );

  objectMayExist = false;
  results.deleteObject = 'PASS';

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: required.bucket,
        Key: key,
      }),
    );

    results.headObjectAfterDelete = 'FAIL';
  } catch (error) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      '$metadata' in error
        ? error.$metadata?.httpStatusCode
        : undefined;

    results.headObjectAfterDelete =
      status === 404 ? 'PASS' : 'FAIL';
  }
} catch (error) {
  const errorName =
    error instanceof Error ? error.name : 'UnknownError';

  console.error(
    JSON.stringify({
      integrationTest: 'FAIL',
      errorName,
    }),
  );

  process.exitCode = 1;
} finally {
  if (objectMayExist) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: required.bucket,
          Key: key,
        }),
      );

      results.deleteObject = 'PASS_CLEANUP';
    } catch {
      results.deleteObject = 'FAIL_CLEANUP';
      process.exitCode = 1;
    }
  }

  console.log(JSON.stringify(results, null, 2));
}
