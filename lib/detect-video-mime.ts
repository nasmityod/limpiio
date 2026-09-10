/** Contenedores de video permitidos (magic bytes del inicio del archivo). */

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'webm',
  'avi',
  'mkv',
  '3gp',
]);

export function isAllowedVideoExtension(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = filename.slice(dot + 1).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Detecta contenedor de video por magic bytes (primeros ~12 bytes).
 * No confiar en file.type del navegador.
 */
export function detectVideoContainerFromBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;

  // ISO BMFF (MP4, MOV, M4V, 3GP): ....ftyp
  if (
    buf[4] === 0x66 &&
    buf[5] === 0x74 &&
    buf[6] === 0x79 &&
    buf[7] === 0x70
  ) {
    return true;
  }

  // EBML (WebM, MKV)
  if (
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    return true;
  }

  // RIFF....AVI
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x41 &&
    buf[9] === 0x56 &&
    buf[10] === 0x49
  ) {
    return true;
  }

  return false;
}
