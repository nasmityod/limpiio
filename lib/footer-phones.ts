/**
 * Helpers de teléfonos del footer: comparación y href tel: seguros.
 * No alteran el texto original guardado en settings.
 */

/** Elimina todo lo que no sea dígito. */
export function normalizePhoneDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Normaliza un teléfono venezolano para comparación:
 * - Solo dígitos
 * - Prefijo 00 → descartado
 * - 0 local → 58
 * - Si ya empieza por 58, se conserva
 * - Números nacionales de 10 dígitos (empezando en 0 ya procesado) o 11 sin 58
 *   se tratan de forma consistente.
 */
export function normalizePhoneForCompare(
  value: string | null | undefined,
): string {
  let digits = normalizePhoneDigits(value);
  if (!digits) return '';

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // 0XXXXXXXXX (local VE) → 58XXXXXXXXX
  if (digits.startsWith('0') && digits.length >= 10) {
    return `58${digits.slice(1)}`;
  }

  // Ya en formato internacional VE
  if (digits.startsWith('58')) {
    return digits;
  }

  // Nacional sin 0 (ej. 4121234567) → anteponer 58
  if (digits.length === 10 && digits.startsWith('4')) {
    return `58${digits}`;
  }

  return digits;
}

/** Construye href `tel:` E.164-ish para Venezuela cuando aplica. */
export function buildTelHref(value: string | null | undefined): string | null {
  const displayDigits = normalizePhoneDigits(value);
  if (!displayDigits) return null;

  const comparable = normalizePhoneForCompare(value);
  if (!comparable) return null;

  // Preferir forma con +58 cuando es VE; si no, + + dígitos crudos.
  if (comparable.startsWith('58')) {
    return `tel:+${comparable}`;
  }
  return `tel:+${comparable}`;
}

export type FooterPhoneLink = {
  display: string;
  href: string;
};

/**
 * Devuelve los teléfonos a mostrar en el footer sin duplicados normalizados.
 * Conserva el texto original de cada número distinto.
 */
export function resolveFooterPhoneLinks(
  phone: string | null | undefined,
  phone2: string | null | undefined,
): FooterPhoneLink[] {
  const primary = (phone ?? '').trim();
  const secondary = (phone2 ?? '').trim();
  const links: FooterPhoneLink[] = [];

  if (primary) {
    const href = buildTelHref(primary);
    if (href) links.push({ display: primary, href });
  }

  if (secondary) {
    const href = buildTelHref(secondary);
    if (!href) return links;

    const primaryNorm = normalizePhoneForCompare(primary);
    const secondaryNorm = normalizePhoneForCompare(secondary);
    if (primaryNorm && secondaryNorm && primaryNorm === secondaryNorm) {
      return links;
    }

    links.push({ display: secondary, href });
  }

  return links;
}
