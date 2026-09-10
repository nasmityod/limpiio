/**
 * Normalización de imágenes en el cliente antes de subirlas.
 *
 * Los iPhone exportan fotos como HEIC/HEIF por defecto, formato que el
 * servidor NUNCA acepta (whitelist de magic bytes en lib/detect-image-mime.ts
 * solo permite JPEG/PNG/WEBP/GIF). Este helper convierte HEIC/HEIF a JPEG en el
 * cliente (import dinámico de `heic2any`, evita bundlear la lib para el resto
 * de usuarios) y comprime si el resultado sigue pesando demasiado. El límite
 * de salida real sigue validándolo el servidor — esto es solo UX.
 *
 * Reglas importantes
 * ──────────────────
 * • Todo es POR ARCHIVO. Esta función no conoce «la selección»; el llamador la
 *   invoca una vez por foto y trata cada resultado por separado.
 * • Los **GIF se devuelven intactos**: pasarlos por canvas los convertiría en
 *   un JPEG de un solo fotograma y destruiría la animación. Un GIF grande se
 *   sube tal cual y, si excede el límite del servidor, es ESE archivo el que
 *   falla — no la selección.
 * • La compresión es progresiva: si el primer reescalado no baja del objetivo,
 *   se reintenta con lado máximo y calidad menores antes de rendirse. Antes,
 *   una foto de cámara de 8 MB se rechazaba en el primer intento.
 */

import {
  CLIENT_IMAGE_TARGET_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  formatBytesMb,
} from '@/lib/upload-limits';

const MAX_SOURCE_BYTES = MAX_SOURCE_IMAGE_BYTES;
const DOWNSCALE_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const HEIC_JPEG_QUALITY = 0.82;

/**
 * Pasos sucesivos de reescalado/compresión. Se aplica el primero; si el
 * resultado sigue por encima del objetivo se prueba el siguiente. Los valores
 * están pensados para fotografía de producto en web: 2000 px de lado mayor ya
 * supera cualquier render del catálogo (el servidor reescala a 1200 px).
 */
const DOWNSCALE_STEPS: { maxSide: number; quality: number }[] = [
  { maxSide: 2000, quality: 0.82 },
  { maxSide: 1600, quality: 0.75 },
  { maxSide: 1280, quality: 0.7 },
  { maxSide: 1024, quality: 0.65 },
];

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_EXTENSION_RE = /\.(heic|heif)$/i;
const GIF_MIME = 'image/gif';
const GIF_EXTENSION_RE = /\.gif$/i;

declare global {
  interface Window {
    /**
     * Seam exclusivo para E2E (Playwright no puede fabricar un HEIC real ni
     * interceptar el chunk de `heic2any` de forma estable). Gateado también
     * por NODE_ENV !== 'production' — en producción esta rama nunca se toma
     * aunque alguien defina la propiedad en la consola del navegador.
     */
    __E2E_HEIC_DECODER__?: (file: File) => Promise<Blob>;
  }
}

/** Códigos estables para que la UI distinga el motivo del fallo por archivo. */
export type NormalizeImageErrorCode = 'source-too-large' | 'still-too-large';

export class NormalizeImageError extends Error {
  readonly code: NormalizeImageErrorCode;
  constructor(code: NormalizeImageErrorCode, message: string) {
    super(message);
    this.name = 'NormalizeImageError';
    this.code = code;
  }
}

export interface NormalizeImageOptions {
  /** Tamaño máximo del archivo resultante, en bytes. */
  maxOutputBytes?: number;
}

/** MIME HEIC/HEIF, o extensión .heic/.heif cuando el navegador no informa `type`. */
export function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (HEIC_MIME_TYPES.has(type)) return true;
  return HEIC_EXTENSION_RE.test(file.name);
}

/**
 * GIF por MIME o extensión. Se detecta para NO tocarlo: convertirlo a JPEG
 * perdería la animación (el `<canvas>` sólo captura el primer fotograma).
 */
export function isGifFile(file: File): boolean {
  if (file.type.toLowerCase() === GIF_MIME) return true;
  return GIF_EXTENSION_RE.test(file.name);
}

function toJpegFileName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, '').trim();
  return `${base || 'imagen'}.jpg`;
}

async function decodeHeicToJpegBlob(file: File): Promise<Blob> {
  const e2eDecoder =
    process.env.NODE_ENV !== 'production' && typeof window !== 'undefined'
      ? window.__E2E_HEIC_DECODER__
      : undefined;
  if (e2eDecoder) return e2eDecoder(file);

  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: HEIC_JPEG_QUALITY,
  });
  return Array.isArray(result) ? result[0] : result;
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const blob = await decodeHeicToJpegBlob(file);
  return new File([blob], toJpegFileName(file.name), { type: 'image/jpeg' });
}

/**
 * Reescala y recomprime a JPEG. `createImageBitmap` respeta la orientación EXIF
 * en los navegadores objetivo, así que la foto no queda girada.
 */
async function downscaleToJpeg(
  file: File,
  maxSide: number,
  quality: number,
): Promise<File> {
  let bitmap: ImageBitmap | null = null;
  try {
    // Si el navegador no puede decodificar la imagen (formato exótico, memoria,
    // archivo corrupto) devolvemos el original en vez de tumbar la subida: el
    // servidor tiene la última palabra por magic bytes y por tamaño. Antes una
    // excepción aquí hacía fallar ese archivo aunque fuera perfectamente válido.
    bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob) return file;

    return new File([blob], toJpegFileName(file.name), { type: 'image/jpeg' });
  } finally {
    bitmap?.close();
  }
}

/**
 * Convierte HEIC/HEIF a JPEG y/o comprime la imagen si supera el tamaño
 * máximo de salida. Si el archivo ya es un JPEG/PNG/WEBP pequeño, se
 * devuelve sin modificar (mismo File, mismo contenido). Los GIF se devuelven
 * siempre sin tocar para conservar la animación.
 *
 * Lanza `NormalizeImageError` — con `code` — cuando ese archivo concreto no se
 * puede subir. El llamador debe tratarlo como un fallo de UNA imagen.
 */
export async function normalizeImageForUpload(
  file: File,
  { maxOutputBytes = CLIENT_IMAGE_TARGET_BYTES }: NormalizeImageOptions = {},
): Promise<File> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new NormalizeImageError(
      'source-too-large',
      `La imagen de origen (${formatBytesMb(file.size)}) supera el máximo permitido ` +
        `(${formatBytesMb(MAX_SOURCE_BYTES)}).`,
    );
  }

  // GIF: se sube tal cual. `processImage` en servidor también lo conserva.
  if (isGifFile(file)) return file;

  let result = file;

  if (isHeicFile(result)) {
    result = await convertHeicToJpeg(result);
  }

  if (result.size > DOWNSCALE_THRESHOLD_BYTES) {
    for (const step of DOWNSCALE_STEPS) {
      const candidate = await downscaleToJpeg(result, step.maxSide, step.quality);
      // `downscaleToJpeg` devuelve el mismo File cuando el canvas no está
      // disponible: no tiene sentido reintentar con otra calidad.
      if (candidate === result) break;
      // Si el reescalado no reduce, conservamos el mejor de los dos.
      if (candidate.size < result.size) result = candidate;
      if (result.size <= maxOutputBytes) break;
    }
  }

  if (result.size > maxOutputBytes) {
    throw new NormalizeImageError(
      'still-too-large',
      `La imagen resultante (${formatBytesMb(result.size)}) supera el máximo permitido ` +
        `(${formatBytesMb(maxOutputBytes)}) aun tras comprimirla. Intenta con otra foto.`,
    );
  }

  return result;
}
