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
