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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

const logInfoMock = vi.fn();
vi.mock('@/lib/safe-logger', () => ({
  logInfo: logInfoMock,
  logError: vi.fn(),
}));

vi.mock('@/lib/definitions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/definitions')>();
  return {
    ...actual,
    prismaOrderToOrder: (o: unknown) => o,
  };
});

const { POST } = await import('@/app/api/orders/[id]/revert-divisa-discount/route');

function buildRequest(): Request {
  return new Request('http://localhost/api/orders/order-1/revert-divisa-discount', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rejectInvalidMutationOriginMock.mockReturnValue(null);
  requirePermissionMock.mockResolvedValue({ authorized: true });
});

describe('POST /api/orders/[id]/revert-divisa-discount', () => {
  it('exige permiso PAYMENTS', async () => {
    requirePermissionMock.mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
    });

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });
    expect(res.status).toBe(403);
  });

  it('revierte descuento y recalcula total', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'order-1',
      paymentDiscount: 10,
      paymentDiscountPercent: 10,
      subtotalBeforeDiscount: 100,
      couponDiscount: 5,
      total: 85,
    });
    updateMock.mockResolvedValue({
      id: 'order-1',
      orderNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      customerId: null,
      customerName: 'Ana',
      customerEmail: null,
      customerPhone: null,
      customerIdNumber: null,
      paymentDiscount: null,
      paymentDiscountPercent: null,
      subtotalBeforeDiscount: 100,
      couponDiscount: 5,
      total: 95,
      exchangeRateUsdBs: 36,
      status: 'Pendiente',
      paymentMethod: 'Binance',
      paymentMethodId: 'binancepay',
      paymentCurrency: null,
      paymentBank: null,
      paymentHolderIdNumber: null,
      paymentHolderPhone: null,
      paymentReference: null,
      paymentProofUrl: null,
      paymentProofKey: null,
      trackingNumber: null,
      trackingCarrier: null,
      trackingPhotoUrl: null,
      trackingUrl: null,
      shippedAt: null,
      paidAt: null,
      couponCode: null,
      paymentVerifiedBy: null,
      paymentRejectionReason: null,
      notes: null,
      channel: 'web',
      stockDeducted: true,
      freeShipping: false,
      items: [],
    });

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        paymentDiscount: null,
        paymentDiscountPercent: null,
        total: 95,
      },
      include: { items: true },
    });
    expect(logInfoMock).toHaveBeenCalledWith(
      'payment_divisa_discount_reverted',
      expect.objectContaining({ orderId: 'order-1' }),
    );
  });

  it('24. Revertir dos veces: el segundo intento no altera el total', async () => {
    const afterRevert = {
      id: 'order-1',
      orderNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      customerId: null,
      customerName: 'Ana',
      customerEmail: null,
      customerPhone: null,
      customerIdNumber: null,
      paymentDiscount: null,
      paymentDiscountPercent: null,
      subtotalBeforeDiscount: 100,
      couponDiscount: 0,
      total: 100,
      exchangeRateUsdBs: 36,
      status: 'Pendiente',
      paymentMethod: 'Binance',
      paymentMethodId: 'binancepay',
      paymentCurrency: null,
      paymentBank: null,
      paymentHolderIdNumber: null,
      paymentHolderPhone: null,
      paymentReference: null,
      paymentProofUrl: null,
      paymentProofKey: null,
      trackingNumber: null,
      trackingCarrier: null,
      trackingPhotoUrl: null,
      trackingUrl: null,
      shippedAt: null,
      paidAt: null,
      couponCode: null,
      paymentVerifiedBy: null,
      paymentRejectionReason: null,
      notes: null,
      channel: 'web',
      stockDeducted: true,
      freeShipping: false,
      items: [],
    };

    findUniqueMock
      .mockResolvedValueOnce({
        id: 'order-1',
        paymentDiscount: 10,
        paymentDiscountPercent: 10,
        subtotalBeforeDiscount: 100,
        couponDiscount: 0,
        total: 90,
      })
      .mockResolvedValue(afterRevert);

    updateMock.mockResolvedValue(afterRevert);

    const first = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });
    expect(first.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);

    const second = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });
    expect(second.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
