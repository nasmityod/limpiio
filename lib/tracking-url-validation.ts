/**
 * tracking-url-validation.ts (PRD-267 / PRD-268 / PRD-251)
 * Validadores Zod compartidos por las rutas admin que guardan tracking
 * (`PATCH /api/orders/[id]` y `PUT /api/orders/[id]/status`).
 *
 * - PRD-267: `trackingUrl` solo https.
 * - PRD-268: `trackingPhotoUrl` restringida al CDN público de R2.
 * - PRD-251: `trackingUrl` allowlist de dominios de transportistas conocidos —
 *   evita que un admin almacene una URL arbitraria que llega al cliente como
 *   enlace de tracking (vector de phishing). Para agregar un transportista
 *   nuevo, añadirlo a ALLOWED_TRACKING_HOSTS.
 */
import { z } from 'zod';
import { isR2PublicHttpsUrl } from '@/lib/r2-public-url';

/**
 * PRD-251: Transportistas venezolanos y globales conocidos cuyos dominios
 * se aceptan como URLs de seguimiento. La allowlist cubre el hostname exacto
 * (sin subdominios arbitrarios) para minimizar la superficie de phishing.
 */
const ALLOWED_TRACKING_HOSTS = new Set([
  // MRW Venezuela
  'mrw.com.ve',
  'mrwvenezuela.com',
  // Zoom Delivery
  'zoom.com.ve',
  // Domesa
  'domesa.com.ve',
  // Tealca
  'tealca.com',
  'tealca.com.ve',
  // AeroCav / Aeroexpress
  'aerocav.com',
  'aeroexpressonline.com',
  // Correos de Venezuela (postal estatal)
  'correosdevenezuela.com',
  // DHL, FedEx, UPS (envíos internacionales)
  'dhl.com',
  'fedex.com',
  'ups.com',
  // 17track (agregador de tracking global usado con MRW y otros)
  '17track.net',
]);

function isAllowedTrackingUrl(value: string): boolean {
  try {
    const { protocol, hostname } = new URL(value);
    if (protocol !== 'https:') return false;
    const host = hostname.toLowerCase().replace(/^www\./, '');
    return ALLOWED_TRACKING_HOSTS.has(host);
  } catch {
    return false;
  }
}

/** URL de seguimiento del transportista (https + dominio de transportista conocido). */
export const trackingUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    isAllowedTrackingUrl,
    `La URL de seguimiento debe ser https:// de un transportista conocido (MRW, Zoom, Tealca, Domesa, DHL, FedEx, UPS…). ` +
      `Si tu transportista no aparece en la lista, escríbenos para agregarlo.`,
  );

/** Foto de la guía/paquete (https + alojada en R2). */
export const trackingPhotoUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    isR2PublicHttpsUrl,
    'La foto de tracking debe estar alojada en el CDN de imágenes de la tienda (R2).',
  );
