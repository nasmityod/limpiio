import { sanitizeOrderItemImageUrl } from '@/lib/r2-public-url';
/**
 * safe-link.ts — validación de enlaces e imágenes editables desde el admin
 * (PRD-212 / PRD-257 / PRD-283 / PRD-259).
 *
 * Un admin comprometido (o un XSS en el panel) no debe poder convertir la
 * barra de anuncios, el popup o el hero en un open redirect / phishing
 * (`javascript:`, `data:`, dominios externos arbitrarios).
 *
 * Sin dependencias de servidor: usable en schemas Zod y Client Components.
 */

/** Ruta interna del sitio: empieza con "/" único (no "//host" ni esquemas). */
export function isInternalPath(value: string): boolean {
  const v = value.trim();
  if (!v.startsWith('/')) return false;
  if (v.startsWith('//')) return false; // protocol-relative → dominio externo
  if (v.includes('\\')) return false;
  return true;
}

/**
 * Enlace permitido en contenido editable: vacío, ruta interna o https
 * absoluto (para campañas que apuntan a Instagram/WhatsApp).
 * Bloquea javascript:, data:, vbscript:, http: y URLs malformadas.
 */
export function isSafeEditableLink(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  if (isInternalPath(v)) return true;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Enlace ESTRICTAMENTE interno (popup y hero fallback): vacío o ruta `/...`.
 * Estos CTAs navegan con <Link> y nunca deben salir del sitio (PRD-212/257).
 */
export function isInternalEditableLink(value: string): boolean {
  const v = value.trim();
  return v === '' || isInternalPath(v);
}

/**
 * SEC-2026-09 (#4): href para atributos `href`/`src` de contenido editable en
 * RENDER. Devuelve la URL si es ruta interna o https absoluta; `null` en
 * cualquier otro caso (`javascript:`, `data:`, http:, basura). Úsalo en cada
 * `<a href={settings.x}>` / `<iframe src>` además de validar al guardar: las
 * páginas cacheadas llevan CSP con `unsafe-inline` y un `javascript:` ahí
 * ejecuta en la sesión de quien haga clic (incluido el superadmin).
 */
export function safeHref(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return isSafeEditableLink(v) ? v : null;
}

/** Solo embeds de Google Maps (https://www.google.com/maps/embed…) para el iframe de la tienda. */
export function isGoogleMapsEmbedUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'www.google.com' || u.hostname === 'maps.google.com') &&
      u.pathname.startsWith('/maps')
    );
  } catch {
    return false;
  }
}

/**
 * Imagen editable: vacía, ruta interna (`/...`) o URL https válida.
 * Evita strings basura que rompen next/image en runtime (PRD-259).
 */
export function isSafeEditableImageUrl(value: string): boolean {
  return value.trim() === '' || sanitizeOrderItemImageUrl(value) !== null;
}
