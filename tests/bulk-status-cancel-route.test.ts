import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePermissionMock = vi.fn();
vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: requirePermissionMock,
}));

const rejectInvalidMutationOriginMock = vi.fn();
vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: rejectInvalidMutationOriginMock,
}));

const findManyMock = vi.fn();
const transactionMock = vi.fn();
const txFindManyMock = vi.fn();
const txUpdateManyMock = vi.fn();
const txProductUpdateManyMock = vi.fn();
const txCouponRedemptionFindUniqueMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: findManyMock },
    $transaction: transactionMock,
  },
}));

vi.mock('@/lib/resend', () => ({
  sendOrderCancelledEmail: vi.fn(),
}));

vi.mock('@/lib/safe-logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

const { POST } = await import('@/app/api/orders/bulk-status-update/route');

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/bulk-status-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeTx() {
  return {
    order: {
      findMany: txFindManyMock,
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
  txUpdateManyMock
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 1 });
});

describe('POST /api/orders/bulk-status-update Cancelado', () => {
  it('17. IDs duplicados: una sola restauración por pedido', async () => {
    findManyMock.mockResolvedValue([
      { id: 'order-a', status: 'Pendiente', stockDeducted: true, channel: 'web' },
    ]);
    txFindManyMock.mockResolvedValue([
      {
        id: 'order-a',
        orderNumber: 1,
        status: 'Pendiente',
        stockDeducted: true,
        customerEmail: null,
        customerName: 'A',
        items: [{ productId: 'p1', quantity: 1 }],
      },
    ]);

    const res = await POST(
      buildRequest({
        orderIds: ['order-a', 'order-a', 'order-a'],
        status: 'Cancelado',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updatedCount).toBe(1);
    expect(txUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(txProductUpdateManyMock).toHaveBeenCalledTimes(1);
  });

  it('excluye ya Cancelados y procesa en orden estable', async () => {
    findManyMock.mockResolvedValue([
      { id: 'order-b', status: 'Pendiente', stockDeducted: true, channel: 'web' },
      { id: 'order-a', status: 'En Proceso', stockDeducted: true, channel: 'web' },
      { id: 'order-c', status: 'Cancelado', stockDeducted: false, channel: 'web' },
    ]);
    txFindManyMock.mockResolvedValue([
      {
        id: 'order-b',
        orderNumber: 2,
        status: 'Pendiente',
        stockDeducted: true,
        customerEmail: null,
        customerName: 'B',
        items: [{ productId: 'p1', quantity: 1 }],
      },
      {
        id: 'order-a',
        orderNumber: 1,
        status: 'En Proceso',
        stockDeducted: true,
        customerEmail: null,
        customerName: 'A',
        items: [{ productId: 'p2', quantity: 1 }],
      },
    ]);
    txUpdateManyMock.mockReset();
    txUpdateManyMock.mockResolvedValue({ count: 1 });

    await POST(
      buildRequest({
        orderIds: ['order-b', 'order-a', 'order-c'],
        status: 'Cancelado',
      }),
    );

    expect(txFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'Cancelado' },
        }),
      }),
    );

    const claimCalls = txUpdateManyMock.mock.calls.filter(
      (c) => c[0]?.data?.stockDeducted === false,
    );
    expect(claimCalls[0][0].where.id).toBe('order-a');
    expect(claimCalls[1][0].where.id).toBe('order-b');
  });
});
