/**
 * brand.ts — fuente única de identidad de marca.
 *
 * Todo texto visible, metadato, asunto de correo y dato de contacto debe
 * leerse desde aquí. Los valores por defecto son NEUTROS a propósito: nunca
 * se hardcodea un dominio ni una marca real como fallback, para que una tienda
 * derivada mal configurada falle de forma visible en vez de apuntar en
 * silencio a la identidad de otra.
 *
 * Reglas de uso:
 *  - Se importa desde componentes de servidor y de cliente, así que solo
 *    admite variables `NEXT_PUBLIC_*`. Nunca metas secretos aquí.
 *  - Si un texto ya se resuelve desde `StoreSettings` (editable en
 *    Admin → Configuración, p. ej. `app/manifest.ts`), NO lo migres a BRAND:
 *    esa capa manda sobre esta. BRAND cubre lo que no vive en base de datos
 *    (metadatos de build, asuntos de correo, textos de plantilla).
 *  - `NEXT_PUBLIC_SITE_URL` es obligatoria en producción; la exige
 *    `lib/env-validation.ts` al arrancar el servidor.
 */

/** Normaliza una variable de entorno: ausente o en blanco → cadena vacía. */
function envValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

/** URL de desarrollo. Fallback deliberadamente local: jamás un dominio real. */
const FALLBACK_SITE_URL = 'http://localhost:3000';

/** Nombre de respaldo cuando la tienda derivada aún no configuró el suyo. */
const FALLBACK_BRAND_NAME = 'Tienda';

const brandName = envValue(process.env.NEXT_PUBLIC_BRAND_NAME) || FALLBACK_BRAND_NAME;
const contactEmail = envValue(process.env.NEXT_PUBLIC_CONTACT_EMAIL);

export const BRAND = {
  /** Nombre comercial visible (cabeceras, asuntos, metadatos). */
  name: brandName,
  /** Razón social para textos legales. Cae al nombre comercial si no se define. */
  legalName: envValue(process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME) || brandName,
  /** Descriptor corto para metadatos y correos. Vacío = se omite. */
  tagline: envValue(process.env.NEXT_PUBLIC_BRAND_TAGLINE),
  /** URL pública sin `/` final. Obligatoria en producción. */
  siteUrl: envValue(process.env.NEXT_PUBLIC_SITE_URL) || FALLBACK_SITE_URL,
  /** Correo de atención público, usado también como Reply-To. */
  contactEmail,
  /** Correo de soporte técnico. Cae al de contacto si no se define. */
  supportEmail: envValue(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) || contactEmail,
  /** Teléfonos de contacto, ya formateados para mostrar. */
  phones: envValue(process.env.NEXT_PUBLIC_CONTACT_PHONES),
  /** Dirección física de la tienda, en una línea. */
  address: envValue(process.env.NEXT_PUBLIC_STORE_ADDRESS),
  /** Handle de Instagram con `@` incluido (p. ej. `@mitienda`). */
  instagramHandle: envValue(process.env.NEXT_PUBLIC_INSTAGRAM_HANDLE),
  social: {
    instagram: envValue(process.env.NEXT_PUBLIC_INSTAGRAM_URL),
    facebook: envValue(process.env.NEXT_PUBLIC_FACEBOOK_URL),
    tiktok: envValue(process.env.NEXT_PUBLIC_TIKTOK_URL),
    whatsapp: envValue(process.env.NEXT_PUBLIC_WHATSAPP_URL),
  },
} as const;

/**
 * Prefijo estándar de asuntos de correo: `${BRAND.name} · ...`.
 * Centralizarlo evita que cada plantilla reinvente el separador.
 */
export function brandSubject(rest: string): string {
  return `${BRAND.name} · ${rest}`;
}
