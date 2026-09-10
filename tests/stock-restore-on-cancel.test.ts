import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyOrderCancellationEffectsInTransaction,
  shouldRestoreStockOnCancel,
} from '@/lib/checkout-order';

vi.mock('@/lib/safe-logger', () => ({
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

type FakeTx = {
  order: { updateMany: ReturnType<typeof vi.fn> };
  product: { updateMany: ReturnType<typeof vi.fn> };
  couponRedemption: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  coupon: { updateMany: ReturnType<typeof vi.fn> };
};

function makeTx(overrides: Partial<FakeTx> = {}): FakeTx {
  return {
    order: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    product: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    couponRedemption: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    coupon: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  };
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    status: 'Pendiente',
    stockDeducted: true as boolean | null,
    items: [{ productId: 'p1', quantity: 2 }],
    ...overrides,
  };
}

describe('shouldRestoreStockOnCancel matriz', () => {
  it.each([
    ['Pendiente', true],
    ['En Proceso', true],
    ['Pendiente verificación Binance', true],
    ['Enviado', false],
    ['Entregado', false],
    ['Cancelado', false],
  ] as const)('from=%s → %s', (from, expected) => {
    expect(shouldRestoreStockOnCancel(from, 'Cancelado')).toBe(expected);
  });
});

describe('applyOrderCancellationEffectsInTransaction (claim atómico)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Pendiente + stockDeducted=true: claim.count=1 → incrementa y stockDeducted=false', async () => {
    const tx = makeTx();
    const order = baseOrder({ status: 'Pendiente', stockDeducted: true });

    const result = await applyOrderCancellationEffectsInTransaction(tx as never, order);

    expect(result.stockRestored).toBe(true);
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'Pendiente', stockDeducted: true },
      data: { stockDeducted: false },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stock: { increment: 2 } },
    });
  });

  it('2. En Proceso + true: restaura', async () => {
    const tx = makeTx();
    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'En Proceso', stockDeducted: true }),
    );
    expect(result.stockRestored).toBe(true);
    expect(tx.product.updateMany).toHaveBeenCalled();
  });

  it('3. Pendiente verificación Binance + true: restaura', async () => {
    const tx = makeTx();
    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Pendiente verificación Binance', stockDeducted: true }),
    );
    expect(result.stockRestored).toBe(true);
    expect(tx.product.updateMany).toHaveBeenCalled();
  });

  it('4. Pendiente + stockDeducted=false: no llama product.updateMany', async () => {
    const tx = makeTx();
    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Pendiente', stockDeducted: false }),
    );
    expect(result.stockRestored).toBe(false);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.couponRedemption.findUnique).toHaveBeenCalled();
  });

  it('5. Enviado + true: no restaura', async () => {
    const tx = makeTx();
    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Enviado', stockDeducted: true }),
    );
    expect(result.stockRestored).toBe(false);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('6. Entregado + true: no restaura', async () => {
    const tx = makeTx();
    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Entregado', stockDeducted: true }),
    );
    expect(result.stockRestored).toBe(false);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('7. Cancelado: no restaura', async () => {
    const tx = makeTx();
    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Cancelado', stockDeducted: true }),
    );
    expect(result.stockRestored).toBe(false);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('8. Reintento claim.count=0 → no incrementa stock', async () => {
    const tx = makeTx();
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Pendiente', stockDeducted: true }),
    );

    expect(result.stockRestored).toBe(false);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('9. Dos cancelaciones simuladas: solo la primera restaura', async () => {
    const claim = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const productUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const tx1 = makeTx({
      order: { updateMany: claim },
      product: { updateMany: productUpdateMany },
    });
    const tx2 = makeTx({
      order: { updateMany: claim },
      product: { updateMany: productUpdateMany },
    });

    const order = baseOrder({ status: 'Pendiente', stockDeducted: true });
    const r1 = await applyOrderCancellationEffectsInTransaction(tx1 as never, order);
    const r2 = await applyOrderCancellationEffectsInTransaction(tx2 as never, order);

    expect(r1.stockRestored).toBe(true);
    expect(r2.stockRestored).toBe(false);
    expect(productUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('10. Dos items del mismo productId: incremento = suma de cantidades', async () => {
    const tx = makeTx();
    await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({
        items: [
          { productId: 'p1', quantity: 2 },
          { productId: 'p1', quantity: 3 },
        ],
      }),
    );

    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'p1' },
      data: { stock: { increment: 2 } },
    });
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'p1' },
      data: { stock: { increment: 3 } },
    });
  });

  it('11. Producto inexistente: no convierte en doble reposición (log + continúa)', async () => {
    const { logWarn } = await import('@/lib/safe-logger');
    const tx = makeTx();
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ items: [{ productId: 'gone', quantity: 1 }] }),
    );

    expect(result.stockRestored).toBe(true);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith(
      'checkout_restore_stock_product_missing',
      expect.objectContaining({ operation: 'restore_stock_on_cancel', count: 1 }),
    );
  });

  it('12. Si restore lanza tras el claim, el error se propaga (rollback de la tx)', async () => {
    const tx = makeTx();
    tx.product.updateMany.mockRejectedValue(new Error('db boom'));

    await expect(
      applyOrderCancellationEffectsInTransaction(
        tx as never,
        baseOrder({ status: 'Pendiente', stockDeducted: true }),
      ),
    ).rejects.toThrow('db boom');

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stockDeducted: false } }),
    );
  });

  it('13. WhatsApp stockDeducted=false: sin cambios de inventario', async () => {
    const tx = makeTx();
    const result = await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Pendiente', stockDeducted: false }),
    );
    expect(result.stockRestored).toBe(false);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('cron: stockClaimStatus=Cancelado reclama con status Cancelado en BD', async () => {
    const tx = makeTx();
    await applyOrderCancellationEffectsInTransaction(
      tx as never,
      baseOrder({ status: 'Pendiente', stockDeducted: true }),
      { stockClaimStatus: 'Cancelado' },
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'Cancelado', stockDeducted: true },
      data: { stockDeducted: false },
    });
  });
});
