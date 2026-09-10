#!/usr/bin/env node
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ENDPOINT   = process.env.R2_ENDPOINT?.trim();
const ACCESS_KEY = process.env.R2_PRIVATE_ACCESS_KEY_ID?.trim();
const SECRET_KEY = process.env.R2_PRIVATE_SECRET_ACCESS_KEY?.trim();
const BUCKET     = process.env.R2_PRIVATE_BUCKET_NAME?.trim();

console.log('=== DIAGNÓSTICO ===');
console.log(`R2_ENDPOINT:                ${ENDPOINT ? '✓ definido' : '✗ FALTA'}`);
console.log(`R2_PRIVATE_ACCESS_KEY_ID:   ${ACCESS_KEY ? ACCESS_KEY.slice(0, 8) + '…' : '✗ FALTA'}`);
console.log(`R2_PRIVATE_SECRET_ACCESS_KEY: ${SECRET_KEY ? SECRET_KEY.slice(0, 8) + '…' : '✗ FALTA'}`);
console.log(`R2_PRIVATE_BUCKET_NAME:     ${BUCKET || '✗ FALTA'}`);

if (!ENDPOINT || !ACCESS_KEY || !SECRET_KEY || !BUCKET) {
  console.error('\n❌ Faltan variables. Asegúrate de correr desde el directorio del proyecto.');
  process.exit(1);
}

console.log(`\nEndpoint: ${ENDPOINT}`);
console.log(`Bucket:   ${BUCKET}`);
console.log(`Key ID:   ${ACCESS_KEY}`);
console.log('');

const client = new S3Client({
  region: 'auto',
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true,
});

async function main() {
  // 1. Probar HeadBucket (verifica que el bucket existe y tenemos acceso)
  console.log('📡 1. HeadBucket…');
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log('   ✅ Bucket existe y tenemos acceso');
  } catch (err) {
    console.log(`   ❌ ${err.name}: ${err.message}`);
    console.log('\n📋 Posibles causas:');
    console.log('   - El bucket no existe (confirma que se llama exactamente "mundotech-proofs")');
    console.log('   - El token no está vinculado a este bucket');
    console.log('   - El Account ID en el endpoint no coincide');
    process.exit(1);
  }

  // 2. Subir
  const TEST_KEY = `proofs/test-${Date.now()}.webp`;
  console.log(`\n📤 2. PutObject ${TEST_KEY}…`);
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: TEST_KEY,
    Body: Buffer.from('ok'),
    ContentType: 'image/webp',
    CacheControl: 'private, no-store',
  }));
  console.log('   ✅ Subido');

  // 3. URL firmada
  console.log('🔗 3. GetObject con presigned URL…');
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: TEST_KEY }),
    { expiresIn: 180 },
  );
  console.log(`   ✅ ${url}`);

  // 4. GET con fetch
  console.log('🌐 4. Fetch…');
  const resp = await fetch(url);
  const text = await resp.text();
  console.log(`   ✅ HTTP ${resp.status}: "${text}"`);

  // 5. Limpiar
  console.log('🧹 5. DeleteObject…');
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: TEST_KEY }));
  console.log('   ✅ Eliminado');

  console.log('\n🎉 Todo funciona correctamente.');
}

main().catch((err) => {
  console.error(`\n❌ ${err.name}: ${err.message}`);
  process.exitCode = 1;
});
