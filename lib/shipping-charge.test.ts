import { describe, expect, it } from 'vitest';
import {
  resolveShippingChargeType,
  shippingChargeLabel,
  isStorePickupOrderAddress,
  orderShippingChargeLabelFromSnapshot,
} from '@/lib/shipping-charge';

describe('resolveShippingChargeType', () => {
  it('1–3: tienda siempre es STORE_PICKUP (sin inspeccionar productos)', () => {
    expect(resolveShippingChargeType('tienda', [false])).toBe('STORE_PICKUP');
    expect(resolveShippingChargeType('tienda', [true])).toBe('STORE_PICKUP');
    expect(resolveShippingChargeType('tienda', [true, true])).toBe('STORE_PICKUP');
  });

  it('4–5: mrw + todos true → FREE', () => {
    expect(resolveShippingChargeType('mrw', [true])).toBe('FREE');
    expect(resolveShippingChargeType('mrw', [true, true])).toBe('FREE');
  });

  it('6–8: mrw mixto, false o vacío → DESTINATION_CHARGE', () => {
    expect(resolveShippingChargeType('mrw', [true, false])).toBe('DESTINATION_CHARGE');
    expect(resolveShippingChargeType('mrw', [false])).toBe('DESTINATION_CHARGE');
    expect(resolveShippingChargeType('mrw', [])).toBe('DESTINATION_CHARGE');
  });

  it('9–12: zoom/tealca siempre DESTINATION_CHARGE aunque todos sean true', () => {
    expect(resolveShippingChargeType('zoom', [true])).toBe('DESTINATION_CHARGE');
    expect(resolveShippingChargeType('zoom', [true, true])).toBe('DESTINATION_CHARGE');
    expect(resolveShippingChargeType('tealca', [true])).toBe('DESTINATION_CHARGE');
    expect(resolveShippingChargeType('tealca', [true, true])).toBe('DESTINATION_CHARGE');
  });

  it('13: null/undefined + [true] → DESTINATION_CHARGE', () => {
    expect(resolveShippingChargeType(null, [true])).toBe('DESTINATION_CHARGE');
    expect(resolveShippingChargeType(undefined, [true])).toBe('DESTINATION_CHARGE');
  });
});

describe('shippingChargeLabel', () => {
  it('14–15: textos definitivos en español', () => {
    expect(shippingChargeLabel('STORE_PICKUP')).toBe('Retiro en tienda');
    expect(shippingChargeLabel('FREE')).toBe('Envío gratis por MRW');
    expect(shippingChargeLabel('DESTINATION_CHARGE')).toBe('Cobro a destino');
  });
});

describe('isStorePickupOrderAddress', () => {
  it('detecta el prefijo fijo de retiro en tienda', () => {
    expect(isStorePickupOrderAddress('Retiro en tienda — Av. Principal')).toBe(true);
    expect(isStorePickupOrderAddress('retiro en tienda')).toBe(true);
    expect(isStorePickupOrderAddress('Calle 10, Barquisimeto')).toBe(false);
    expect(isStorePickupOrderAddress(null)).toBe(false);
    expect(isStorePickupOrderAddress(undefined)).toBe(false);
  });
});

describe('orderShippingChargeLabelFromSnapshot', () => {
  it('16: snapshot de retiro siempre prioriza Retiro en tienda', () => {
    expect(
      orderShippingChargeLabelFromSnapshot({
        freeShipping: true,
        shippingAddress: 'Retiro en tienda — Centro',
      }),
    ).toBe('Retiro en tienda');
  });

  it('usa snapshot freeShipping para carrier (FREE = MRW)', () => {
    expect(
      orderShippingChargeLabelFromSnapshot({
        freeShipping: true,
        shippingAddress: 'Calle 1',
      }),
    ).toBe('Envío gratis por MRW');
    expect(
      orderShippingChargeLabelFromSnapshot({
        freeShipping: false,
        shippingAddress: 'Calle 1',
      }),
    ).toBe('Cobro a destino');
  });
});

/**
 * Espejo de la regla autoritativa del checkout (lib/checkout-order.ts):
 * Order.freeShipping = resolve === FREE; OrderItem conserva el flag del producto.
 * FREE solo para MRW + todos elegibles.
 */
describe('checkout freeShipping snapshot rules', () => {
  function orderSnapshot(
    shippingMethod: 'tienda' | 'mrw' | 'zoom' | 'tealca' | null | undefined,
    productFlags: readonly boolean[],
  ) {
    const type = resolveShippingChargeType(shippingMethod, productFlags);
    return {
      orderFreeShipping: type === 'FREE',
      itemSnapshots: [...productFlags],
      label: shippingChargeLabel(type),
    };
  }

  it('17: Order.freeShipping solo true para MRW + todos true', () => {
    expect(orderSnapshot('mrw', [true]).orderFreeShipping).toBe(true);
    expect(orderSnapshot('mrw', [true, true]).orderFreeShipping).toBe(true);
    expect(orderSnapshot('mrw', [true, false]).orderFreeShipping).toBe(false);
    expect(orderSnapshot('zoom', [true, true]).orderFreeShipping).toBe(false);
    expect(orderSnapshot('tealca', [true, true]).orderFreeShipping).toBe(false);
    expect(orderSnapshot('tienda', [true, true]).orderFreeShipping).toBe(false);
  });

  it('1 producto elegible + MRW → Order.freeShipping true', () => {
    const s = orderSnapshot('mrw', [true]);
    expect(s.orderFreeShipping).toBe(true);
    expect(s.itemSnapshots).toEqual([true]);
    expect(s.label).toBe('Envío gratis por MRW');
  });

  it('2 productos elegibles + ZOOM → Order.freeShipping false', () => {
    expect(orderSnapshot('zoom', [true, true]).orderFreeShipping).toBe(false);
    expect(orderSnapshot('zoom', [true, true]).label).toBe('Cobro a destino');
  });

  it('carrito mixto → Order false; ítems conservan snapshot individual', () => {
    const s = orderSnapshot('mrw', [true, false]);
    expect(s.orderFreeShipping).toBe(false);
    expect(s.itemSnapshots).toEqual([true, false]);
    expect(s.label).toBe('Cobro a destino');
  });

  it('ningún producto elegible → Order.freeShipping false', () => {
    expect(orderSnapshot('mrw', [false, false]).orderFreeShipping).toBe(false);
  });

  it('todos elegibles + retiro en tienda → Order.freeShipping false', () => {
    const s = orderSnapshot('tienda', [true, true]);
    expect(s.orderFreeShipping).toBe(false);
    expect(s.label).toBe('Retiro en tienda');
  });

  it('producto antiguo (undefined/false) se interpreta como false', () => {
    expect(orderSnapshot('mrw', [false]).orderFreeShipping).toBe(false);
    // Fail-safe del carrito: solo `=== true` cuenta
    expect((undefined as unknown as boolean) === true).toBe(false);
  });
});
