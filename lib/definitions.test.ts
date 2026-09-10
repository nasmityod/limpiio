import { describe, expect, it } from 'vitest';
import {
  CASHEA_STATUS_CUSTOMER_COPY,
  prismaOrderToOrder,
  type CasheaOrderStatus,
} from '@/lib/definitions';

const ALL_CASHEA_STATUSES: CasheaOrderStatus[] = [
  'CREATED',
  'REDIRECTED',
  'RETURNED',
  'VERIFYING',
  'CONFIRMED',
  'CANCEL_PENDING',
  'CANCELLED',
  'FAILED',
  'EXPIRED',
];

function basePrismaOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 42,
    createdAt: new Date('2026-07-23T00:00:00.000Z'),
    customerId: 'user-1',
    customerName: 'Cliente Prueba',
    total: 100,
    status: 'Pendiente',
    paymentMethod: 'Cashea',
    shippingAddress: 'N/A',
    shippingCity: 'N/A',
    shippingState: 'N/A',
    shippingZipCode: 'N/A',
    shippingCountry: 'Venezuela',
    items: [],
    ...overrides,
  };
}

describe('prismaOrderToOrder — campos Cashea (Fase 7)', () => {
  it('pedido no-Cashea: todos los campos Cashea quedan null (sin romper pedidos existentes)', () => {
    const order = prismaOrderToOrder(basePrismaOrder());

    expect(order.casheaStatus).toBeNull();
    expect(order.casheaOrderId).toBeNull();
    expect(order.casheaInitialAmount).toBeNull();
    expect(order.casheaAttemptCount).toBeNull();
  });

  it('pedido Cashea confirmado: mapea estado, monto (Decimal→number) y timestamps', () => {
    const order = prismaOrderToOrder(
      basePrismaOrder({
        casheaStatus: 'CONFIRMED',
        casheaOrderId: 'CASHEA-999',
        casheaInitialAmount: { toNumber: () => 25.5 },
        casheaCurrency: 'USD',
        casheaConfirmedAt: new Date('2026-07-23T01:00:00.000Z'),
        casheaAttemptCount: 2,
        casheaLastResponseCode: 'CONFIRMED',
      }),
    );

    expect(order.casheaStatus).toBe('CONFIRMED');
    expect(order.casheaOrderId).toBe('CASHEA-999');
    expect(order.casheaInitialAmount).toBe(25.5);
    expect(order.casheaCurrency).toBe('USD');
    expect(order.casheaConfirmedAt).toBe('2026-07-23T01:00:00.000Z');
    expect(order.casheaAttemptCount).toBe(2);
    expect(order.casheaLastResponseCode).toBe('CONFIRMED');
  });
});

describe('CASHEA_STATUS_CUSTOMER_COPY — Sección 7: nunca afirmar "pagado" salvo CONFIRMED', () => {
  it('ningún estado distinto de CONFIRMED usa la palabra "pagado"/"pago confirmado" en tono success', () => {
    for (const status of ALL_CASHEA_STATUSES) {
      const copy = CASHEA_STATUS_CUSTOMER_COPY[status];
      if (status === 'CONFIRMED') {
        expect(copy.tone).toBe('success');
      } else {
        expect(copy.tone).not.toBe('success');
      }
    }
  });

  it('todos los estados de la máquina (Sección 6) tienen copy definido', () => {
    for (const status of ALL_CASHEA_STATUSES) {
      expect(CASHEA_STATUS_CUSTOMER_COPY[status]).toBeDefined();
      expect(CASHEA_STATUS_CUSTOMER_COPY[status].title.length).toBeGreaterThan(0);
    }
  });
});
