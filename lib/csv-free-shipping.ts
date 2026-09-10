/**
 * Normalización de la columna `freeShipping` en import CSV de productos.
 * Pura: sin Prisma ni React — usable desde productActions y tests.
 */

const FREE_SHIPPING_TRUE_TOKENS = new Set(['true', '1', 'si', 'sí', 'yes', 'on']);
const FREE_SHIPPING_FALSE_TOKENS = new Set(['false', '0', 'no', '']);

/**
 * Normaliza el valor crudo de la columna `freeShipping` del CSV.
 * - `undefined` (columna ausente en la fila / no enviada): no sobrescribe
 *   productos existentes; `false` para nuevos (lo decide el importador).
 * - Valor vacío en una fila puntual: `false`.
 * - Valor desconocido: `{ ok: false }` — la fila se rechaza.
 */
export function normalizeCsvFreeShipping(
  raw: string | undefined,
): { ok: true; value: boolean | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined };
  const s = raw.trim().toLowerCase();
  if (FREE_SHIPPING_TRUE_TOKENS.has(s)) return { ok: true, value: true };
  if (FREE_SHIPPING_FALSE_TOKENS.has(s)) return { ok: true, value: false };
  return { ok: false };
}

/** Interpreta el valor del FormData del checkbox de envío gratis. */
export function parseFreeShippingFormValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === '1';
}
