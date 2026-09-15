/**
 * Helpers de URL pública de R2 — sin AWS SDK, importables en Client Components.
 * En el cliente usa NEXT_PUBLIC_R2_PUBLIC_BASE_URL; en servidor cae a R2_PUBLIC_BASE_URL.
 */

export function readR2PublicBaseUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim() ||
    process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export function readR2PublicHostname(): string | null {
  const base = readR2PublicBaseUrl();
  if (!base) return null;
  try {
    const u = new URL(base);
    return u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
}

export function isR2PublicHttpsUrl(url: string): boolean {
  const hostname = readR2PublicHostname();
  if (!hostname) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === hostname;
  } catch {
    return false;
  }
}

/** Ruta interna del sitio: `/...` sin `//` ni backslashes (misma regla que lib/safe-link.ts). */
function isInternalSitePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

/**
 * SEC-2026-09 (#11): URL de imagen que `next/image` puede renderizar sin
 * lanzar: ruta interna o URL https del CDN R2 configurado. Cualquier otra cosa
 * → `null`. La imagen de cada línea de pedido la manda el CLIENTE en el
 * checkout; con un host ajeno `next/image` rompía /account/orders/[id] y
 * /checkout/success. Se aplica al guardar (checkoutSchema) y al leer
 * (prismaOrderToOrder) para cubrir filas legacy.
 */
export function sanitizeOrderItemImageUrl(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v || v.length > 600) return null;
  if (isInternalSitePath(v)) return v;
  return isR2PublicHttpsUrl(v) ? v : null;
}
