import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePermissionMock = vi.fn();
vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: requirePermissionMock,
}));

const rejectInvalidMutationOriginMock = vi.fn();
vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: rejectInvalidMutationOriginMock,
}));

const findUniqueMock = vi.fn();
const updateMock = vi.fn();
const transactionMock = vi.fn();
const txFindUniqueMock = vi.fn();
const txUpdateMock = vi.fn();
const txUpdateManyMock = vi.fn();
const txProductUpdateManyMock = vi.fn();
const txCouponRedemptionFindUniqueMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
    $transaction: transactionMock,
  },
}));

const sendOrderCancelledEmailMock = vi.fn();
vi.mock('@/lib/resend', () => ({
  sendOrderCancelledEmail: sendOrderCancelledEmailMock,
  sendShippingEmail: vi.fn(),
  sendOrderDeliveredEmail: vi.fn(),
}));

const logInfoMock = vi.fn();
vi.mock('@/lib/safe-logger', () => ({
  logInfo: logInfoMock,
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

const { PUT } = await import('@/app/api/orders/[id]/status/route');

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/orders/order-1/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeTx() {
  return {
    order: {
      findUnique: txFindUniqueMock,
      update: txUpdateMock,
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

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 100,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    customerId: null,
    status: 'Pendiente',
    stockDeducted: true,
    total: 100,
    exchangeRateUsdBs: 36,
    paymentMethod: 'Binance',
    paymentMethodId: 'binancepay',
    subtotalBeforeDiscount: 100,
    paymentDiscountPercent: null,
    paymentDiscount: null,
    paymentCurrency: null,
    paymentBank: null,
    paymentHolderIdNumber: null,
    paymentHolderPhone: null,
    paymentReference: null,
    paymentProofUrl: null,
    paymentProofKey: null,
    shippedAt: null,
    trackingNumber: null,
    trackingCarrier: null,
    trackingPhotoUrl: null,
    trackingUrl: null,
    deliveredAt: null,
    paidAt: null,
    couponCode: null,
    couponDiscount: null,
    paymentVerifiedBy: null,
    paymentRejectionReason: null,
    notes: null,
    channel: 'web',
    freeShipping: false,
    customerName: 'Ana',
    customerEmail: 'ana@example.com',
    customerPhone: null,
    customerIdNumber: null,
    items: [
      {
        id: 'i1',
        productId: 'p1',
        productName: 'X',
        quantity: 2,
        price: 10,
        imageUrl: null,
        freeShipping: false,
      },
    ],
    customer: { email: null, name: null },
    ...overrides,
  };
}

function mockSuccessfulCancelTransition(current: ReturnType<typeof orderRow>) {
  const cancelled = { ...current, status: 'Cancelado', stockDeducted: false };
  txFindUniqueMock
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce(cancelled);
  // 1) claim stockDeducted  2) status transition
  txUpdateManyMock
    .mockResolvedValueOnce({ count: 1 })
    .mockResolvedValueOnce({ count: 1 });
  return cancelled;
}

beforeEach(() => {
  vi.clearAllMocks();
  rejectInvalidMutationOriginMock.mockReturnValue(null);
  requirePermissionMock.mockResolvedValue({ authorized: true });
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(makeTx()));
  txCouponRedemptionFindUniqueMock.mockResolvedValue(null);
  txProductUpdateManyMock.mockResolvedValue({ count: 1 });
});

describe('PUT /api/orders/[id]/status Cancelado', () => {
  it('restaura stock cuando Pendiente + stockDeducted=true', async () => {
    findUniqueMock.mockResolvedValue({
      status: 'Pendiente',
      shippedAt: null,
      trackingNumber: null,
      deliveredAt: null,
      stockDeducted: true,
      channel: 'web',
    });
    const current = orderRow({ status: 'Pendiente', stockDeducted: true });
    mockSuccessfulCancelTransition(current);

    const res = await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });

    expect(res.status).toBe(200);
    expect(txUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'Pendiente', stockDeducted: true },
      data: { stockDeducted: false },
    });
    expect(txUpdateManyMock).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'Pendiente' },
      data: { status: 'Cancelado' },
    });
    expect(txProductUpdateManyMock).toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
    expect(logInfoMock).toHaveBeenCalledWith(
      'order_cancelled_stock_reverted',
      expect.objectContaining({ orderId: 'order-1' }),
    );
    expect(sendOrderCancelledEmailMock).toHaveBeenCalledTimes(1);
  });

  it('ya Cancelado: no restaura, no email, no log de transición (idempotente)', async () => {
    findUniqueMock.mockResolvedValue({
      status: 'Cancelado',
      shippedAt: null,
      trackingNumber: null,
      deliveredAt: null,
      stockDeducted: false,
      channel: 'web',
    });
    txFindUniqueMock.mockResolvedValue(orderRow({ status: 'Cancelado', stockDeducted: false }));

    const res = await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });

    expect(res.status).toBe(200);
    expect(txUpdateManyMock).not.toHaveBeenCalled();
    expect(txProductUpdateManyMock).not.toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
    expect(sendOrderCancelledEmailMock).not.toHaveBeenCalled();
    expect(logInfoMock).not.toHaveBeenCalledWith(
      'order_cancelled_stock_reverted',
      expect.anything(),
    );
    expect(logInfoMock).not.toHaveBeenCalledWith(
      'order_cancelled_no_stock_restore',
      expect.anything(),
    );
  });

  it('WhatsApp stockDeducted=false: cancela sin reponer', async () => {
    findUniqueMock.mockResolvedValue({
      status: 'Pendiente',
      shippedAt: null,
      trackingNumber: null,
      deliveredAt: null,
      stockDeducted: false,
      channel: 'whatsapp',
    });
    const current = orderRow({ status: 'Pendiente', stockDeducted: false, channel: 'whatsapp' });
    // sin claim de stock → solo transition updateMany
    txFindUniqueMock
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, status: 'Cancelado' });
    txUpdateManyMock.mockResolvedValueOnce({ count: 1 });

    const res = await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });

    expect(res.status).toBe(200);
    expect(txProductUpdateManyMock).not.toHaveBeenCalled();
    expect(logInfoMock).toHaveBeenCalledWith(
      'order_cancelled_no_stock_restore',
      expect.objectContaining({ orderId: 'order-1' }),
    );
    expect(sendOrderCancelledEmailMock).toHaveBeenCalledTimes(1);
  });

  it('Enviado: no restaura', async () => {
    findUniqueMock.mockResolvedValue({
      status: 'Enviado',
      shippedAt: new Date(),
      trackingNumber: 'T1',
      deliveredAt: null,
      stockDeducted: true,
      channel: 'web',
    });
    const current = orderRow({ status: 'Enviado', stockDeducted: true });
    txFindUniqueMock
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce({ ...current, status: 'Cancelado' });
    // sin claim (estado no restaurable) → solo transition
    txUpdateManyMock.mockResolvedValueOnce({ count: 1 });

    await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });

    expect(txProductUpdateManyMock).not.toHaveBeenCalled();
    expect(logInfoMock).toHaveBeenCalledWith(
      'order_cancelled_no_stock_restore',
      expect.objectContaining({ orderId: 'order-1' }),
    );
  });

  it('404 si la orden desaparece dentro de la tx', async () => {
    findUniqueMock.mockResolvedValue({
      status: 'Pendiente',
      shippedAt: null,
      trackingNumber: null,
      deliveredAt: null,
      stockDeducted: true,
      channel: 'web',
    });
    txFindUniqueMock.mockResolvedValue(null);

    const res = await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });

    expect(res.status).toBe(404);
  });

  it('dos cancelaciones concurrentes: stock, transición y email una sola vez', async () => {
    findUniqueMock.mockResolvedValue({
      status: 'Pendiente',
      shippedAt: null,
      trackingNumber: null,
      deliveredAt: null,
      stockDeducted: true,
      channel: 'web',
    });

    const current = orderRow({ status: 'Pendiente', stockDeducted: true });
    const cancelled = { ...current, status: 'Cancelado', stockDeducted: false };

    // Primera petición: gana claim + transición
    txFindUniqueMock
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(cancelled);
    txUpdateManyMock
      .mockResolvedValueOnce({ count: 1 }) // stock claim
      .mockResolvedValueOnce({ count: 1 }); // status transition

    const res1 = await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    expect(res1.status).toBe(200);

    // Segunda petición: claim pierde, transición pierde → idempotente
    txFindUniqueMock
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(cancelled); // re-read tras transition.count=0
    txUpdateManyMock
      .mockResolvedValueOnce({ count: 0 }) // stock claim lost
      .mockResolvedValueOnce({ count: 0 }); // status transition lost

    const res2 = await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });
    expect(res2.status).toBe(200);

    expect(txProductUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(sendOrderCancelledEmailMock).toHaveBeenCalledTimes(1);
    expect(logInfoMock).toHaveBeenCalledTimes(1);
    expect(logInfoMock).toHaveBeenCalledWith(
      'order_cancelled_stock_reverted',
      expect.objectContaining({ orderId: 'order-1' }),
    );
  });

  it('transición perdida con orden ya Cancelado: no email ni log', async () => {
    findUniqueMock.mockResolvedValue({
      status: 'Pendiente',
      shippedAt: null,
      trackingNumber: null,
      deliveredAt: null,
      stockDeducted: true,
      channel: 'web',
    });
    const current = orderRow({ status: 'Pendiente', stockDeducted: true });
    const cancelled = { ...current, status: 'Cancelado', stockDeducted: false };

    txFindUniqueMock
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(cancelled);
    txUpdateManyMock
      .mockResolvedValueOnce({ count: 0 }) // claim perdido
      .mockResolvedValueOnce({ count: 0 }); // transición perdida

    const res = await PUT(buildRequest({ status: 'Cancelado' }), {
      params: Promise.resolve({ id: 'order-1' }),
    });

    expect(res.status).toBe(200);
    expect(sendOrderCancelledEmailMock).not.toHaveBeenCalled();
    expect(logInfoMock).not.toHaveBeenCalled();
    expect(txProductUpdateManyMock).not.toHaveBeenCalled();
  });
});
