/**
 * MIME real desde magic bytes — no usar file.type ni extensión del nombre para seguridad.
 * Tipos de imagen permitidos en uploads (JPG, PNG, WEBP, GIF).
 */
export type DetectedImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Comprobantes de pago: solo tipos permitidos públicos (sin GIF). */
const PROOF_ALLOWED = new Set<DetectedImageMime>(['image/jpeg', 'image/png', 'image/webp']);

/** Upload admin / assets: JPG, PNG, WEBP, GIF. */
const ADMIN_UPLOAD_ALLOWED = new Set<DetectedImageMime>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function detectImageMimeFromBuffer(buf: Buffer): DetectedImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  // GIF87a / GIF89a
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x39 || buf[4] === 0x37) && buf[5] === 0x61
  ) {
    return 'image/gif';
  }
  return null;
}

export function isAllowedProofMime(mime: DetectedImageMime): boolean {
  return PROOF_ALLOWED.has(mime);
}

export function isAllowedAdminUploadMime(mime: DetectedImageMime): boolean {
  return ADMIN_UPLOAD_ALLOWED.has(mime);
}
