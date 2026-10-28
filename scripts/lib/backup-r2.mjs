#!/usr/bin/env node
/**
 * FASE 4.7 (MEJORA 4.2) — sube un dump de PostgreSQL a Cloudflare R2 y aplica
 * retención de 30 días sobre el prefijo backups/.
 *
 * Uso (lo invoca scripts/backup-postgres.sh):
 *   node scripts/lib/backup-r2.mjs /ruta/al/dump.dump
 *
 * SEC-2026-09 (#1): los dumps van al bucket PRIVADO (R2_PRIVATE_BUCKET_NAME,
 * credenciales R2_PRIVATE_*). Antes se subían a R2_BUCKET_NAME — el mismo
 * bucket que sirve las imágenes por R2_PUBLIC_BASE_URL — y R2 no tiene ACL por
 * prefijo: un dump completo de la BD (usuarios, hashes, pedidos, cuentas
 * bancarias) quedaba descargable en https://cdn.<dominio>/backups/<slug>_<fecha>.dump
 * con nombre predecible. Nunca volver a usar el bucket público aquí.
 * Al terminar con éxito registra la marca en AppConfig (backup_last_success_at)
 * para que el dashboard admin muestre "último backup".
 */
import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import pg from 'pg';
import { applyBackupRetention } from './backup-retention.mjs';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

const RETENTION_DAYS = 30;
const instance = process.env.APP_SLUG || 'storefront';
if (!/^[a-zA-Z0-9_-]+$/.test(instance)) throw new Error('Invalid backup instance');
// Retain only this instance: other stores may share the private bucket.
const PREFIX = `backups/${instance}_`;

const {
  R2_ENDPOINT,
  R2_PRIVATE_ACCESS_KEY_ID,
  R2_PRIVATE_SECRET_ACCESS_KEY,
  R2_PRIVATE_BUCKET_NAME,
  R2_BUCKET_NAME,
} = process.env;

function fail(msg) {
  console.error(`[backup-r2] ${msg}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail('falta la ruta del dump. Uso: node backup-r2.mjs <dump>');
if (
  !R2_ENDPOINT ||
  !R2_PRIVATE_ACCESS_KEY_ID ||
  !R2_PRIVATE_SECRET_ACCESS_KEY ||
  !R2_PRIVATE_BUCKET_NAME
) {
  fail('faltan variables R2_PRIVATE_* en el entorno (los backups SOLO van al bucket privado).');
}
if (R2_BUCKET_NAME && R2_BUCKET_NAME === R2_PRIVATE_BUCKET_NAME) {
  fail('R2_PRIVATE_BUCKET_NAME no puede ser el mismo bucket público de R2_BUCKET_NAME.');
}

/** Bucket de destino: SIEMPRE el privado. */
const BACKUP_BUCKET = R2_PRIVATE_BUCKET_NAME;

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_PRIVATE_ACCESS_KEY_ID,
    secretAccessKey: R2_PRIVATE_SECRET_ACCESS_KEY,
  },
  maxAttempts: 3,
  requestHandler: { connectionTimeout: 5_000, requestTimeout: 180_000 },
});

async function upload() {
  const size = statSync(file).size;
  if (size < 1024) fail(`dump sospechosamente pequeño (${size} bytes) — no se sube.`);

  const fileName = basename(file);
  if (!fileName.startsWith(`${instance}_`) || !/^\d{8}_\d{6}\.dump$/.test(fileName.slice(instance.length + 1))) fail('dump fuera del formato de esta instancia');
  const key = `backups/${basename(file)}`;
  // Multipart keeps memory bounded and supports dumps beyond a single PUT.
  await new Upload({
    client: s3, queueSize: 2, partSize: Math.max(16 * 1024 * 1024, Math.ceil(size / 10_000)), leavePartsOnError: false,
    params: {
      Bucket: BACKUP_BUCKET,
      Key: key,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: 'application/octet-stream',
    },
  }).done();
  console.log(`[backup-r2] subido: ${key} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  return key;
}

async function applyRetention() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const deleted = await applyBackupRetention(s3, { bucket: BACKUP_BUCKET, prefix: PREFIX, cutoff });
  console.log(`[backup-r2] retención: eliminados ${deleted} backup(s) > ${RETENTION_DAYS} días.`);
}

async function recordSuccess() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) return;
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5_000, query_timeout: 10_000 });
  pool.on('error', () => console.error('[backup-r2] error de conexión al registrar backup.'));
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
