/**
 * Límites de subida de imágenes — fuente única de verdad para cliente y servidor.
 *
 * Todos los límites son **POR ARCHIVO**. En ningún punto del flujo existe un
 * límite agregado sobre el conjunto seleccionado: dos fotos de 3 MB cada una
 * (6 MB en total) son dos subidas independientes, y ambas son válidas.
 *
 * Cadena de validación
 * ────────────────────
 *   origen (≤ MAX_SOURCE_IMAGE_BYTES)
 *     → normalización en cliente (HEIC→JPEG, EXIF, reescalado, compresión)
 *       objetivo ≤ CLIENT_IMAGE_TARGET_BYTES
 *     → POST /api/upload  (rechaza > MAX_UPLOAD_IMAGE_BYTES por archivo)
 *     → magic bytes (lib/detect-image-mime.ts) — la extensión y el MIME del
 *       navegador NO se consideran confiables
 *     → sharp: reescalado + WebP (GIF se conserva tal cual)
 *
 * El límite de vídeo es otra infraestructura (POST /api/upload-video) y no se
 * mezcla con éste: ver MAX_VIDEO_BYTES en app/api/upload-video/route.ts.
 */

const MB = 1024 * 1024;

/**
 * Máximo del archivo ORIGEN aceptado por el normalizador del cliente.
 * Cubre de sobra una foto de cámara/iPhone a máxima resolución.
 */
export const MAX_SOURCE_IMAGE_BYTES = 20 * MB;

/**
 * Objetivo de la normalización en cliente. Una foto que llegue por encima se
 * reescala y recomprime en pasos sucesivos antes de subirla; sólo si aun así
 * no baja de aquí se rechaza ESE archivo (los demás de la selección siguen).
 */
export const CLIENT_IMAGE_TARGET_BYTES = 5 * MB;

/**
 * Máximo por archivo que acepta el servidor en POST /api/upload.
 *
 * Antes eran 5 MB y era el límite efectivo del panel: cualquier foto de cámara
 * moderna (7–12 MB) se rechazaba de plano porque el modal de producto subía el
 * File original sin normalizar. Ahora el cliente normaliza a ≤5 MB y este
 * margen cubre los casos en que la normalización no aplica —GIF animado, que
 * NO se rasteriza para no perder los fotogramas, o navegadores donde
 * `createImageBitmap` falla y se sube el original—, sin dejar de ser una
 * barrera real del lado servidor.
 */
export const MAX_UPLOAD_IMAGE_BYTES = 10 * MB;

/** Formato humano para mensajes de error ("7,4 MB"). */
export function formatBytesMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}
