import {
  detectImageMimeFromBuffer,
  type DetectedImageMime,
} from '@/lib/detect-image-mime';
import { logError, logWarn } from '@/lib/safe-logger';

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
  width: number;
  height: number;
}

type SharpFactory = typeof import('sharp').default;

const MIME_TO_EXT: Record<DetectedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** undefined = no intentado; null = falló la carga nativa (p. ej. libvips en Vercel). */
let sharpCache: SharpFactory | null | undefined;

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpCache !== undefined) return sharpCache;
  try {
    const mod = await import('sharp');
    sharpCache = mod.default;
  } catch (err) {
    logError('image_processing_sharp_load_failed', err, { operation: 'load_sharp' });
    sharpCache = null;
  }
  return sharpCache;
}

function originalImagePayload(buffer: Buffer, mime: DetectedImageMime): ProcessedImage {
  return {
    buffer,
    contentType: mime,
    ext: MIME_TO_EXT[mime],
    width: 0,
    height: 0,
  };
}

async function processImageWithSharp(
  sharp: SharpFactory,
  buffer: Buffer,
  { maxWidth }: { maxWidth: number },
): Promise<ProcessedImage> {
  const detectedMime = detectImageMimeFromBuffer(buffer);
  if (!detectedMime) {
    throw new Error('Tipo de imagen no reconocido.');
  }

  if (detectedMime === 'image/gif') {
    const meta = await sharp(buffer, { animated: true }).metadata();
    return {
      buffer,
      contentType: 'image/gif',
      ext: 'gif',
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  }

  const processed = await sharp(buffer)
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processed.data,
    contentType: 'image/webp',
    ext: 'webp',
    width: processed.info.width,
    height: processed.info.height,
  };
}

/**
 * Igual que processImage, pero si sharp no carga (p. ej. binario nativo ausente en
 * el runtime) guarda el buffer original sin convertir — evita 500 en comprobantes.
 */
export async function processImageWithFallback(
  buffer: Buffer,
  options: { maxWidth: number },
): Promise<ProcessedImage> {
  const detectedMime = detectImageMimeFromBuffer(buffer);
  if (!detectedMime) {
    throw new Error('Tipo de imagen no reconocido.');
  }

  const sharp = await loadSharp();
  if (!sharp) {
    logWarn('upload_proof_sharp_unavailable', { operation: 'process_image_fallback' });
    return originalImagePayload(buffer, detectedMime);
  }

  try {
    return await processImageWithSharp(sharp, buffer, options);
  } catch (err) {
    logError('upload_proof_sharp_failed', err, { operation: 'process_image_fallback' });
    return originalImagePayload(buffer, detectedMime);
  }
}

/**
 * Redimensiona y convierte a WebP (quality 80), salvo GIF animados que se
 * conservan tal cual para no perder frames.
 */
export async function processImage(
  buffer: Buffer,
  options: { maxWidth: number },
): Promise<ProcessedImage> {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error('El procesador de imágenes no está disponible.');
  }
  return processImageWithSharp(sharp, buffer, options);
}

/** Para migración: conserva GIF; el resto pasa por processImage. */
export async function processImageForMigration(
  buffer: Buffer,
  mime: DetectedImageMime,
  maxWidth: number,
): Promise<ProcessedImage> {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error('El procesador de imágenes no está disponible.');
  }

  if (mime === 'image/gif') {
    const meta = await sharp(buffer, { animated: true }).metadata();
    return {
      buffer,
      contentType: mime,
      ext: MIME_TO_EXT[mime],
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  }
  return processImageWithSharp(sharp, buffer, { maxWidth });
}
