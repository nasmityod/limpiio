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
const txPaymentUploadUpdateManyMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
    paymentUpload: { updateMany: txPaymentUploadUpdateManyMock },
  },
}));

const deletePrivateProofMock = vi.fn();
vi.mock('@/lib/r2', () => ({
  deletePrivateProof: deletePrivateProofMock,
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
    paymentUpload: { updateMany: txPaymentUploadUpdateManyMock, upsert: vi.fn().mockResolvedValue({}) },
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
  txPaymentUploadUpdateManyMock.mockResolvedValue({ count: 0 });
  deletePrivateProofMock.mockResolvedValue(undefined);
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
      where: { id: 'order-1', status: 'Cancelado', stockDeducted: true },
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

describe('SEC-2026-09 (#22): retención del comprobante al borrar', () => {
  it('marca el PaymentUpload como DELETED y borra el objeto privado de R2', async () => {
    txFindUniqueMock.mockResolvedValue({
      id: 'order-9',
      status: 'Cancelado',
      stockDeducted: false,
      paymentProofKey: 'proofs/abc-123.webp',
      items: [],
    });

    const res = await DELETE(
      new Request('http://localhost/api/orders/order-9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'order-9' }) },
    );

    expect(res.status).toBe(200);
    expect(txPaymentUploadUpdateManyMock).toHaveBeenCalledWith({
      where: { orderId: 'order-9' },
      data: { status: 'DELETING' },
    });
    expect(deletePrivateProofMock).toHaveBeenCalledWith('proofs/abc-123.webp');
  });

  it('sin comprobante no toca R2', async () => {
    txFindUniqueMock.mockResolvedValue({
      id: 'order-10',
      status: 'Cancelado',
      stockDeducted: false,
      paymentProofKey: null,
      items: [],
    });

    await DELETE(
      new Request('http://localhost/api/orders/order-10', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'order-10' }) },
    );

    expect(deletePrivateProofMock).not.toHaveBeenCalled();
  });
});
