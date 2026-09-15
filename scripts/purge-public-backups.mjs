#!/usr/bin/env node
/**
 * SEC-2026-09 (#1) — purga de emergencia: borra TODOS los objetos `backups/*`
 * del bucket PÚBLICO (R2_BUCKET_NAME). Hasta esta corrección los dumps de
 * PostgreSQL se subían ahí y quedaban descargables por el CDN.
 *
 * Uso (una sola vez, tras desplegar la corrección):
 *   node scripts/purge-public-backups.mjs            # lista lo que borraría
 *   node scripts/purge-public-backups.mjs --execute  # borra de verdad
 *
 * Después de purgar: rota credenciales/secretos que estuvieran en la BD
 * (hashes de reset, tokens guest) y considera obligar reset de contraseña a
 * los usuarios si hubo ventana de exposición (ver docs/SECURITY-FIXES-2026-09.md).
 */
import process from 'node:process';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
const execute = process.argv.includes('--execute');
const PREFIX = 'backups/';

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('[purge-public-backups] faltan variables R2_* (bucket público).');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const keys = [];
let continuationToken;
do {
  const page = await s3.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: PREFIX, ContinuationToken: continuationToken }),
  );
  for (const obj of page.Contents ?? []) if (obj.Key) keys.push(obj.Key);
  continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (continuationToken);

if (keys.length === 0) {
  console.log(`[purge-public-backups] no hay objetos bajo ${PREFIX} en ${R2_BUCKET_NAME}. Nada que hacer.`);
  process.exit(0);
}

console.log(`[purge-public-backups] ${keys.length} objeto(s) bajo ${PREFIX} en el bucket público:`);
for (const k of keys) console.log(`  - ${k}`);

if (!execute) {
  console.log('\nDry-run. Repite con --execute para borrarlos.');
  process.exit(0);
}

for (let i = 0; i < keys.length; i += 1000) {
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: R2_BUCKET_NAME,
      Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
    }),
  );
}
console.log(`[purge-public-backups] eliminados ${keys.length} objeto(s). Purga también la caché de Cloudflare para /backups/*.`);
