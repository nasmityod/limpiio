#!/usr/bin/env node
/**
 * FASE 4.7 (MEJORA 4.2) — sube un dump de PostgreSQL a Cloudflare R2 y aplica
 * retención de 30 días sobre el prefijo backups/.
 *
 * Uso (lo invoca scripts/backup-postgres.sh):
 *   node scripts/lib/backup-r2.mjs /ruta/al/dump.dump
 *
 * Credenciales: usa las mismas R2_* del .env del repo (ya existentes).
 * Al terminar con éxito registra la marca en AppConfig (backup_last_success_at)
 * para que el dashboard admin muestre "último backup".
 */
import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import pg from 'pg';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

const RETENTION_DAYS = 30;
const PREFIX = 'backups/';

const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

function fail(msg) {
  console.error(`[backup-r2] ${msg}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail('falta la ruta del dump. Uso: node backup-r2.mjs <dump>');
if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  fail('faltan variables R2_* en el .env del repo.');
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function upload() {
  const size = statSync(file).size;
  if (size < 1024) fail(`dump sospechosamente pequeño (${size} bytes) — no se sube.`);

  const key = `${PREFIX}${basename(file)}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: 'application/octet-stream',
    }),
  );
  console.log(`[backup-r2] subido: ${key} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return key;
}

async function applyRetention() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let continuationToken;
  const stale = [];
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key && obj.LastModified && obj.LastModified.getTime() < cutoff) {
        stale.push({ Key: obj.Key });
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  if (stale.length === 0) {
    console.log('[backup-r2] retención: nada que borrar (< 30 días).');
    return;
  }
  // DeleteObjects acepta máx. 1000 llaves por request.
  for (let i = 0; i < stale.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: { Objects: stale.slice(i, i + 1000) },
      }),
    );
  }
  console.log(`[backup-r2] retención: eliminados ${stale.length} backup(s) > ${RETENTION_DAYS} días.`);
}

async function recordSuccess() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) return;
  const pool = new pg.Pool({ connectionString: url });
  try {
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO "AppConfig" (id, key, value, "updatedAt")
       VALUES (gen_random_uuid()::text, 'backup_last_success_at', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = now()`,
      [now],
    );
    console.log('[backup-r2] marca backup_last_success_at registrada.');
  } catch (err) {
    console.error('[backup-r2] no se pudo registrar la marca en AppConfig:', err.message);
  } finally {
    await pool.end();
  }
}

await upload();
await applyRetention();
await recordSuccess();
