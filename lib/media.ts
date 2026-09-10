/**
 * Utilidades para detección y ordenamiento de medios (imágenes vs videos).
 *
 * `isVideo` entiende tres formas de tipo:
 *   - Enum de BD/galería: 'VIDEO' | 'IMAGE'
 *   - MIME type estándar: 'video/mp4', 'video/webm', …
 *   - Fallback por extensión de URL cuando no hay tipo explícito
 */
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|m4v|ogv|ogg|avi|mkv)$/i;

export function isVideo(media: {
  type?: string;
  mimeType?: string;
  url?: string;
}): boolean {
  const mime = media.mimeType ?? media.type;
  if (mime) return mime === 'VIDEO' || mime.startsWith('video/');
  if (media.url) return VIDEO_EXTENSIONS.test(media.url);
  return false;
}

/**
 * Ordena un arreglo de medios poniendo imágenes primero y videos al final.
 * Usa sort estable: conserva el orden relativo de imágenes entre sí y de
 * videos entre sí.
 */
export function sortMediaImagesFirst<
  T extends { type?: string; mimeType?: string; url?: string },
>(media: T[]): T[] {
  return [...media].sort((a, b) => Number(isVideo(a)) - Number(isVideo(b)));
}
