import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePermissionMock = vi.fn();
vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: requirePermissionMock,
}));

const rejectInvalidMutationOriginMock = vi.fn();
vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: rejectInvalidMutationOriginMock,
}));

const transactionMock = vi.fn();
const txFindUniqueMock = vi.fn();
const txDeleteMock = vi.fn();
const txUpdateManyMock = vi.fn();
const txProductUpdateManyMock = vi.fn();
const txCouponRedemptionFindUniqueMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
  },
}));

vi.mock('@/lib/safe-logger', () => ({
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

const { DELETE } = await import('@/app/api/orders/[id]/route');

function makeTx() {
  return {
    order: {
      findUnique: txFindUniqueMock,
      delete: txDeleteMock,
      updateMany: txUpdateManyMock,
    },
    product: { updateMany: txProductUpdateManyMock },
    couponRedemption: {
      findUnique: txCouponRedemptionFindUniqueMock,
      update: vi.fn(),
    },
    coupon: { updateMany: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rejectInvalidMutationOriginMock.mockReturnValue(null);
  requirePermissionMock.mockResolvedValue({ authorized: true });
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(makeTx()));
  txCouponRedemptionFindUniqueMock.mockResolvedValue(null);
  txProductUpdateManyMock.mockResolvedValue({ count: 1 });
  txUpdateManyMock.mockResolvedValue({ count: 1 });
  txDeleteMock.mockResolvedValue({});
});

describe('DELETE /api/orders/[id]', () => {
  it('restaura stock una vez al borrar Pendiente con stockDeducted=true', async () => {
    txFindUniqueMock.mockResolvedValue({
      id: 'order-1',
      status: 'Pendiente',
      stockDeducted: true,
      items: [{ productId: 'p1', quantity: 2 }],
    });

    const res = await DELETE(
      new Request('http://localhost/api/orders/order-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'order-1' }) },
    );

    expect(res.status).toBe(200);
    expect(txUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'Pendiente', stockDeducted: true },
      data: { stockDeducted: false },
    });
    expect(txProductUpdateManyMock).toHaveBeenCalled();
    expect(txDeleteMock).toHaveBeenCalledWith({ where: { id: 'order-1' } });
  });

  it('18. Cancelar y luego borrar: no restaura dos veces', async () => {
    txFindUniqueMock.mockResolvedValue({
      id: 'order-1',
      status: 'Cancelado',
      stockDeducted: false,
      items: [{ productId: 'p1', quantity: 2 }],
    });

    const res = await DELETE(
      new Request('http://localhost/api/orders/order-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'order-1' }) },
    );

    expect(res.status).toBe(200);
    expect(txProductUpdateManyMock).not.toHaveBeenCalled();
    expect(txDeleteMock).toHaveBeenCalled();
  });

  it('404 si no existe', async () => {
    txFindUniqueMock.mockResolvedValue(null);

    const res = await DELETE(
      new Request('http://localhost/api/orders/missing', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'missing' }) },
    );

    expect(res.status).toBe(404);
    expect(txDeleteMock).not.toHaveBeenCalled();
  });

  it('si el delete falla, el error se propaga (rollback de la tx)', async () => {
    txFindUniqueMock.mockResolvedValue({
      id: 'order-1',
      status: 'Pendiente',
      stockDeducted: true,
      items: [{ productId: 'p1', quantity: 1 }],
    });
    txDeleteMock.mockRejectedValue(new Error('delete failed'));

    await expect(
      DELETE(new Request('http://localhost/api/orders/order-1', { method: 'DELETE' }), {
        params: Promise.resolve({ id: 'order-1' }),
      }),
    ).rejects.toThrow('delete failed');
  });
});
