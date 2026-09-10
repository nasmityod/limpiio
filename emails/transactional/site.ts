import { BRAND } from '@/config/brand';

/**
 * URL pública usada en enlaces de correo (productos, cuenta, CTA).
 * PRD-111: antes había un fallback hardcodeado a un dominio de producción
 * concreto, que desalineaba entornos en silencio. Ahora la única fuente es
 * `config/brand.ts`: si NEXT_PUBLIC_SITE_URL no está definida se usa
 * localhost, y `lib/env-validation.ts` exige la variable en producción.
 */
export function emailSiteBaseUrl(): string {
  return BRAND.siteUrl;
}

/**
 * Correo de atención (Reply-To y contacto del pie).
 * Cadena vacía si no se configuró: quien envía debe omitir el Reply-To en vez
 * de mandar uno inválido — ver lib/resend.tsx.
 */
export function emailContactAddress(): string {
  return BRAND.contactEmail;
}

/** Datos verificables de la tienda física (vacíos hasta configurarlos). */
export function emailStoreAddress(): string {
  return BRAND.address;
}

export function emailStorePhones(): string {
  return BRAND.phones;
}

export function emailInstagramHandle(): string {
  return BRAND.instagramHandle;
}

/** Versión del logo en correos — incrementar al reemplazar public/logo-dark.png. */
export const EMAIL_LOGO_VERSION = '1';

/**
 * Dimensiones nativas de public/logo-dark.png (variante para fondo navy).
 * OJO: si sustituyes el logo por uno con otra relación de aspecto, actualiza
 * estos dos valores o la cabecera del correo saldrá deformada.
 */
export const EMAIL_LOGO_NATURAL_WIDTH = 480;
export const EMAIL_LOGO_NATURAL_HEIGHT = 151;

/** Ancho mostrado en la cabecera del correo (altura escala proporcional). */
export const EMAIL_LOGO_DISPLAY_WIDTH = 280;
export const EMAIL_LOGO_DISPLAY_HEIGHT = Math.round(
  EMAIL_LOGO_DISPLAY_WIDTH * (EMAIL_LOGO_NATURAL_HEIGHT / EMAIL_LOGO_NATURAL_WIDTH),
);

/** URL absoluta del logo de marca para cabeceras de correo. */
export function emailLogoUrl(): string {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  return `${base}/logo-dark.png?v=${EMAIL_LOGO_VERSION}`;
}

/** Convierte rutas relativas en absolutas para clientes de correo. */
export function absoluteEmailUrl(pathOrUrl: string | null | undefined): string | null {
  const raw = pathOrUrl?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${raw}`;
}
