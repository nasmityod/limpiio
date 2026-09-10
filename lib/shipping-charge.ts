/**
 * Regla única y compartida del beneficio `Product.freeShipping`.
 *
 * Significado del flag de producto: elegible para envío gratis
 * EXCLUSIVAMENTE por MRW. ZOOM y TEALCA son siempre cobro a destino.
 * Retiro en tienda no es envío (STORE_PICKUP).
 *
 * Sin dependencias de servidor: no importa Prisma, React, `next/*` ni módulos
 * `server-only`. Se usa tanto desde componentes cliente (checkout Full y
 * WhatsApp) como desde `lib/checkout-order.ts` (cálculo autoritativo).
 *
 * Reutiliza el `ShippingMethod` ya definido en `lib/definitions.ts` para no
 * duplicar el tipo — este archivo no importa ese módulo (evita ciclos), pero
 * el tipo local es estructuralmente idéntico.
 */
export type ShippingMethod = 'tienda' | 'mrw' | 'zoom' | 'tealca' | null | undefined;

export type ShippingChargeType = 'STORE_PICKUP' | 'FREE' | 'DESTINATION_CHARGE';

/**
 * Resuelve el tipo de cobro de envío para un carrito/pedido.
 *
 * - `tienda`: siempre STORE_PICKUP (retiro; no es envío). No inspecciona productos.
 * - `mrw` + carrito no vacío + TODOS los flags exactamente `true` → FREE
 *   (beneficio MRW únicamente).
 * - Cualquier otro caso → DESTINATION_CHARGE, incluyendo:
 *   MRW con carrito vacío o mixto; ZOOM/TEALCA aunque todos sean true;
 *   null; undefined; valores inesperados.
 */
export function resolveShippingChargeType(
  shippingMethod: ShippingMethod,
  productFreeShippingFlags: readonly boolean[],
): ShippingChargeType {
  if (shippingMethod === 'tienda') {
    return 'STORE_PICKUP';
  }

  if (
    shippingMethod === 'mrw' &&
    productFreeShippingFlags.length > 0 &&
    productFreeShippingFlags.every((flag) => flag === true)
  ) {
    return 'FREE';
  }

  return 'DESTINATION_CHARGE';
}

/**
 * Texto visible (español) para cada tipo de cobro.
 * FREE = envío gratis por MRW; STORE_PICKUP = retiro (sin envío).
 */
export function shippingChargeLabel(type: ShippingChargeType): string {
  if (type === 'STORE_PICKUP') {
    return 'Retiro en tienda';
  }
  if (type === 'FREE') {
    return 'Envío gratis por MRW';
  }
  return 'Cobro a destino';
}

/**
 * Detecta si la dirección de un pedido ya creado corresponde a retiro en
 * tienda. `Order` no persiste `shippingMethod` como columna propia — el
 * checkout resuelve la dirección de retiro desde la configuración de la
 * tienda y la guarda como texto (`shippingAddress`) con este prefijo fijo
 * (ver `app/api/orders/route.ts`). Se usa SOLO para mostrar la UI correcta
 * en pedidos ya creados; nunca para recalcular el beneficio.
 */
export function isStorePickupOrderAddress(shippingAddress: string | null | undefined): boolean {
  return !!shippingAddress?.trim().toLowerCase().startsWith('retiro en tienda');
}

/**
 * Etiqueta visible para un pedido ya creado, usando solo snapshots
 * (`Order.freeShipping` + texto de dirección). Nunca consulta el producto actual.
 * Prioriza retiro en tienda; luego `Order.freeShipping` (FREE = MRW).
 */
export function orderShippingChargeLabelFromSnapshot(order: {
  freeShipping?: boolean | null;
  shippingAddress?: string | null;
}): string {
  if (isStorePickupOrderAddress(order.shippingAddress)) {
    return shippingChargeLabel('STORE_PICKUP');
  }
  return shippingChargeLabel(order.freeShipping === true ? 'FREE' : 'DESTINATION_CHARGE');
}
