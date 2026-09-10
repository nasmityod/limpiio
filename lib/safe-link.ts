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
 * Imagen editable: vacía, ruta interna (`/...`) o URL https válida.
 * Evita strings basura que rompen next/image en runtime (PRD-259).
 */
export function isSafeEditableImageUrl(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  if (isInternalPath(v)) return true;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}
