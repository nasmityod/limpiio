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

export function isR2PublicHttpsUrl(url: string, configuredBase = readR2PublicBaseUrl()): boolean {
  if (!configuredBase) return false;
  try {
    const base = new URL(configuredBase.replace(/\/$/, ''));
    const parsed = new URL(url);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash ||
        parsed.protocol !== 'https:' || parsed.origin !== base.origin || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.href !== url) return false;
    const prefix = `${base.href.replace(/\/$/, '')}/`;
    if (!url.startsWith(prefix)) return false;
    const key = url.slice(prefix.length);
    // Generated keys are ASCII. Reject aliases (query strings, encoding, dot
    // segments or duplicated separators) so reference checks use one identity.
    return /^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(key) && key.split('/').every(part => part && part !== '.' && part !== '..');
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
