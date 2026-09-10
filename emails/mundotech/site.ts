/**
 * URL pública usada en enlaces de correo (productos, cuenta, CTA).
 * PRD-111: el fallback hardcodeado a producción puede desalinear entornos.
 * Si NEXT_PUBLIC_SITE_URL no está definida, se usa localhost en desarrollo
 * y la URL de producción en producción. En staging DEBE definirse la variable.
 */
export function emailSiteBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit;
  return process.env.NODE_ENV === 'production'
    ? 'https://mundotechve.com'
    : 'http://localhost:3000';
}

export function emailContactAddress(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || 'ventas@mundotechve.com';
}

/** Datos verificables de la tienda física (overrideables por env). */
export function emailStoreAddress(): string {
  return (
    process.env.NEXT_PUBLIC_STORE_ADDRESS?.trim() ||
    'Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001, estado Lara'
  );
}

export function emailStorePhones(): string {
  return process.env.NEXT_PUBLIC_CONTACT_PHONES?.trim() || '0412-1471338 · 0414-5709470';
}

export function emailInstagramHandle(): string {
  return process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE?.trim() || '@Mundotech39';
}

/** Versión del logo en correos — incrementar al reemplazar public/logo-dark.png. */
export const EMAIL_LOGO_VERSION = '1';

/** Dimensiones nativas de public/logo-dark.png (variante para fondo navy). */
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
