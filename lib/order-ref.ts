/**
 * Identificador legible de pedidos para URLs y correos.
 *
 * Cada pedido tiene dos identificadores: `id` (cuid opaco, ej.
 * "cmomd79d5000004lb19a2cd04") y `orderNumber` (entero correlativo único). Las
 * URLs públicas del cliente deben usar SIEMPRE el número legible (#0042) en
 * lugar del cuid. Por compatibilidad con enlaces ya enviados (correos antiguos),
 * el parser sigue aceptando el cuid heredado.
 *
 * Nota de seguridad: solo se debe exponer el número correlativo en rutas que ya
 * validan la propiedad del pedido (sesión + customerId). En páginas sin sesión
 * (ej. confirmación de invitado) se mantiene el cuid como token de capacidad.
 */

const ORDER_NUMBER_MIN_DIGITS = 4;

/** 42 -> "0042". Para mostrar (#0042) y como segmento de URL. */
export function formatOrderNumber(orderNumber: number): string {
  return String(orderNumber).padStart(ORDER_NUMBER_MIN_DIGITS, '0');
}

/** Segmento de URL canónico de un pedido (usa el número, nunca el cuid). */
export function orderPathSegment(orderNumber: number): string {
  return formatOrderNumber(orderNumber);
}

export type OrderRef = { orderNumber: number } | { id: string };

/**
 * Interpreta el segmento `[id]` de la URL de un pedido. Solo-dígitos => número
 * de pedido (acepta ceros a la izquierda, ej. "0042"); cualquier otro valor se
 * trata como el cuid heredado. Devuelve null si el valor es inválido.
 */
export function parseOrderRef(segment: string): OrderRef | null {
  let raw = segment?.trim() ?? '';
  try {
    raw = decodeURIComponent(raw).trim();
  } catch {
    // El segmento ya venía decodificado o mal formado: se usa tal cual.
  }
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    if (Number.isSafeInteger(n) && n > 0) return { orderNumber: n };
    return null;
  }

  return { id: raw };
}
