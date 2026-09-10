import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { isE2eMode } from '@/lib/e2e-mode';
import { slugify } from '@/lib/slugify';

/** URL pública determinista en E2E (sin red). */
const E2E_PUBLIC_BASE_URL = 'https://cdn.e2e.test';
/** Data URL PNG 1×1 para lecturas prefirmadas simuladas en E2E. */
const E2E_PROOF_READ_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const R2_FOLDERS = ['products', 'banners', 'proofs', 'assets', 'reviews'] as const;
export type R2Folder = (typeof R2_FOLDERS)[number];

const REQUIRED_ENV = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
] as const;

let envChecked = false;

function assertR2Env(): void {
  // PRD-E2E: en pruebas E2E (E2E_MODE=1) no se hacen llamadas externas a R2.
  if (isE2eMode() || (process.env.NODE_ENV ?? '').trim() === 'test') {
    return;
  }
  if (envChecked) return;
  envChecked = true;

  const missing = REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[r2] Faltan variables de entorno: ${missing.join(', ')}. ` +
        'Configura R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME y R2_PUBLIC_BASE_URL.',
    );
  }
}

type PrivateR2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function getPrivateConfig(): PrivateR2Config {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.R2_PRIVATE_SECRET_ACCESS_KEY?.trim();

  const missing: string[] = [];

  if (!endpoint) missing.push('R2_ENDPOINT');
  if (!bucket) missing.push('R2_PRIVATE_BUCKET_NAME');
  if (!accessKeyId) missing.push('R2_PRIVATE_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_PRIVATE_SECRET_ACCESS_KEY');

  if (missing.length > 0) {
    throw new Error(
      `[r2-private] Faltan variables requeridas: ${missing.join(', ')}.`,
    );
  }

  // TypeScript no estrecha los tipos a través del array `missing`.
  // Tras el early return, todas las variables son definitivamente string.
  const resolvedEndpoint = endpoint!;
  const resolvedBucket = bucket!;
  const resolvedAccessKeyId = accessKeyId!;
  const resolvedSecretAccessKey = secretAccessKey!;

  let parsedEndpoint: URL;

  try {
    parsedEndpoint = new URL(resolvedEndpoint);
  } catch {
    throw new Error('[r2-private] R2_ENDPOINT no es una URL válida.');
  }

  if (parsedEndpoint.protocol !== 'https:') {
    throw new Error('[r2-private] R2_ENDPOINT debe usar HTTPS.');
  }

  if (
    !parsedEndpoint.hostname.endsWith('.r2.cloudflarestorage.com')
  ) {
    throw new Error(
      '[r2-private] R2_ENDPOINT no pertenece a un endpoint S3 válido de Cloudflare R2.',
    );
  }

  return {
    endpoint: parsedEndpoint.origin,
    bucket: resolvedBucket,
    accessKeyId: resolvedAccessKeyId,
    secretAccessKey: resolvedSecretAccessKey,
  };
}

function getConfig() {
  assertR2Env();
  return {
    endpoint: process.env.R2_ENDPOINT!.trim(),
    accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: process.env.R2_BUCKET_NAME!.trim(),
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL!.trim().replace(/\/$/, ''),
  };
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const { endpoint, accessKeyId, secretAccessKey } = getConfig();
    s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? '';
export const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

let privateS3Client: S3Client | null = null;

function getPrivateS3Client(): S3Client {
  if (!privateS3Client) {
    const config = getPrivateConfig();

    privateS3Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  return privateS3Client;
}

export function buildKey(folder: R2Folder, ext: string, descriptiveName?: string): string {
  assertR2Env();
  if (!R2_FOLDERS.includes(folder)) {
    throw new Error(`[r2] Carpeta no permitida: ${folder}`);
  }
  const safeExt = ext.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!safeExt) {
    throw new Error('[r2] Extensión de archivo inválida.');
  }

  const trimmedName = descriptiveName?.trim();
  if (trimmedName) {
    const slug = slugify(trimmedName).slice(0, 60).replace(/-+$/g, '');
    if (slug) {
      const shortId = uuidv4().replace(/-/g, '').slice(0, 8);
      return `${folder}/${slug}-${shortId}.${safeExt}`;
    }
  }

  return `${folder}/${uuidv4()}.${safeExt}`;
}

export async function uploadToR2({
  buffer,
  key,
  contentType,
  cacheControl = 'public, max-age=31536000, immutable',
}: {
  buffer: Buffer;
  key: string;
  contentType: string;
  cacheControl?: string;
}): Promise<string> {
  if (isE2eMode()) {
    void buffer;
    void contentType;
    void cacheControl;
    return `${E2E_PUBLIC_BASE_URL}/${key}`;
  }
  const { bucket, publicBaseUrl } = getConfig();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
  return `${publicBaseUrl}/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  if (isE2eMode()) {
    void key;
    return;
  }
  const { bucket } = getConfig();
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

/** Hostname del dominio público de R2 (para CSP, validación de URLs, next/image). */
export function getR2PublicHostname(): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!base) return null;
  try {
    return new URL(base).hostname;
  } catch {
    return null;
  }
}

/** true si la URL apunta al dominio público configurado en R2_PUBLIC_BASE_URL. */
export function isR2PublicUrl(url: string): boolean {
  const hostname = getR2PublicHostname();
  if (!hostname) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === hostname;
  } catch {
    return false;
  }
}

/** Extrae la object key de una URL pública de R2, o null si no pertenece al bucket. */
export function keyFromR2PublicUrl(url: string): string | null {
  if (!isR2PublicUrl(url)) return null;
  const base = R2_PUBLIC_BASE_URL || getConfig().publicBaseUrl;
  const prefix = `${base}/`;
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}

// ─────────────────────────────────────────────────────────────
// OPERACIONES CON BUCKET PRIVADO (comprobantes de pago)
// ─────────────────────────────────────────────────────────────

/** Patrón de clave válida para comprobante privado: proofs/<uuid o slug seguro>.(jpg|jpeg|png|webp) */
const PROOF_KEY_RE = /^proofs\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.(jpg|jpeg|png|webp)$/;

/**
 * Valida que `key` sea una object key segura para el bucket privado.
 * Rechaza `..`, `/` extra, query params, URLs completas y cualquier patrón
 * que pueda usarse para path traversal.
 * Lanza Error si la key es inválida.
 */
export function assertProofKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new Error('[r2] La clave del comprobante es requerida.');
  }
  if (key.length > 180) {
    throw new Error('[r2-private] La clave del comprobante es demasiado larga.');
  }
  // Rechazar URLs completas
  if (key.startsWith('https://') || key.startsWith('http://')) {
    throw new Error('[r2] La clave no puede ser una URL completa.');
  }
  // Rechazar path traversal: .., doble slash, inicio con /
  if (key.includes('..')) {
    throw new Error('[r2] La clave contiene ".." (posible path traversal).');
  }
  if (key.includes('//')) {
    throw new Error('[r2] La clave contiene slashes dobles.');
  }
  if (key.startsWith('/')) {
    throw new Error('[r2] La clave no debe comenzar con slash.');
  }
  // Rechazar query params o fragmentos
  if (key.includes('?') || key.includes('#')) {
    throw new Error('[r2] La clave no debe contener query params ni fragmentos.');
  }
  if (!PROOF_KEY_RE.test(key)) {
    throw new Error(
      '[r2] Formato de clave inválido. Debe ser proofs/<nombre>.(jpg|jpeg|png|webp)',
    );
  }
}

/**
 * Sube un comprobante al bucket privado. No devuelve URL pública.
 * El caller debe persistir la `key` en Order.paymentProofKey.
 */
export async function uploadPrivateProof({
  buffer,
  key,
  contentType,
}: {
  buffer: Buffer;
  key: string;
  contentType: string;
}): Promise<{ key: string }> {
  assertProofKey(key);
  if (isE2eMode()) {
    void buffer;
    void contentType;
    return { key };
  }
  const { bucket } = getPrivateConfig();
  const client = getPrivateS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'private, no-store',
    }),
  );
  return { key };
}

/**
 * Genera una URL prefirmada de lectura con expiración controlada.
 * Idealmente 180 segundos (valor por defecto) para visualización admin.
 */
export async function getPrivateProofReadUrl(
  key: string,
  expiresInSeconds = 180,
): Promise<string> {
  assertProofKey(key);
  if (isE2eMode()) {
    void expiresInSeconds;
    return E2E_PROOF_READ_DATA_URL;
  }
  const { bucket } = getPrivateConfig();
  const client = getPrivateS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Elimina un comprobante del bucket privado.
 */
export async function deletePrivateProof(key: string): Promise<void> {
  assertProofKey(key);
  if (isE2eMode()) {
    return;
  }
  const { bucket } = getPrivateConfig();
  const client = getPrivateS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}
