import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { buildOrderConfirmationPayload } from '@/lib/order-confirmation-payload';
import { OrderConfirmationEmail } from '@/emails/transactional/OrderConfirmationEmail';
import { render } from '@react-email/render';
import { createElement } from 'react';

const m = vi.hoisted(() => ({
  order: vi.fn(), user: vi.fn(), products: vi.fn(), send: vi.fn(), permission: vi.fn(), origin: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { order: { findUnique: m.order }, user: { findUnique: m.user }, product: { findMany: m.products } } }));
vi.mock('@/lib/admin-access-server', () => ({ requirePermission: m.permission }));
vi.mock('@/lib/security', () => ({ rejectInvalidMutationOrigin: m.origin }));
vi.mock('@/lib/resend', () => ({ sendOrderConfirmationEmailResult: m.send }));
vi.mock('@/lib/safe-logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));
import { POST } from '@/app/api/orders/[id]/resend-confirmation/route';

function storedOrder(legacy = false) {
  return {
    id: 'fixture-order', orderNumber: 123, customerName: 'Fixture buyer', customerEmail: 'buyer@example.test', customerId: 'fixture-user',
    createdAt: new Date('2026-10-04T00:00:00Z'), status: 'Pendiente',
    total: new Prisma.Decimal(legacy ? 85 : 3102.5), exchangeRateUsdBs: legacy ? null : new Prisma.Decimal('36.5'),
    subtotalBeforeDiscount: new Prisma.Decimal(legacy ? 100 : 3650), couponDiscount: new Prisma.Decimal(legacy ? 10 : 365),
    paymentDiscount: new Prisma.Decimal(legacy ? 5 : 182.5), paymentDiscountPercent: new Prisma.Decimal(5), paymentCurrency: 'USD',
    paymentMethod: 'Efectivo', paymentBank: null, paymentReference: 'fixture-reference', customerPhone: '04140000000',
    shippingAddress: 'Oficina guardada', shippingCity: 'Ciudad guardada', shippingState: 'Estado guardado', shippingZipCode: 'N/A', shippingCountry: 'Venezuela',
    trackingCarrier: 'MRW', freeShipping: true,
    items: [{ productId: 'product-1', productName: 'Nombre guardado', imageUrl: 'https://cdn.vitest.example/snapshot.jpg', price: new Prisma.Decimal(legacy ? 50 : 1825), quantity: 2 }],
  } as unknown as Parameters<typeof buildOrderConfirmationPayload>[0];
}
const products = [{ id: 'product-1', slug: 'current-slug', images: ['https://cdn.vitest.example/current.jpg'], media: [] }];
const params = { params: Promise.resolve({ id: 'fixture-order' }) };
const request = (key: string | null = 'manual-request-0000000001') => new Request('http://localhost/api/orders/fixture-order/resend-confirmation', {
  method: 'POST', ...(key === null ? {} : { headers: { 'Idempotency-Key': key } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  m.order.mockResolvedValue(storedOrder()); m.products.mockResolvedValue(products); m.user.mockResolvedValue({ email: 'account@example.test' });
  m.permission.mockResolvedValue({ authorized: true }); m.origin.mockReturnValue(null);
  m.send.mockResolvedValue({ accepted: false, reason: 'queued', deliveryId: 'delivery-fixture' });
});

describe('Stored order confirmation amounts', () => {
  it('preserves both discounts and exact Bs snapshots instead of substituting total for subtotal', () => {
    const payload = buildOrderConfirmationPayload(storedOrder(), 'buyer@example.test', products);
    expect(payload).toMatchObject({ subtotalUsd: 100, totalUsd: 85, couponDiscountUsd: 10, paymentDiscountUsd: 5,
      subtotalBs: 3650, totalBs: 3102.5, couponDiscountBs: 365, paymentDiscountBs: 182.5, paymentDiscountPercent: 5, paymentCurrency: 'USD',
      shippingUsd: 0, shippingBs: 0, shippingAddress: 'Oficina guardada', freeShipping: true });
    expect(payload.items[0]).toMatchObject({ name: 'Nombre guardado', image: 'https://cdn.vitest.example/snapshot.jpg', priceUsd: 50, quantity: 2 });
  });
  it('does not falsely relabel legacy USD totals and discounts as Bs', () => {
    const payload = buildOrderConfirmationPayload(storedOrder(true), 'buyer@example.test', products);
    expect(payload).toMatchObject({ subtotalUsd: 100, totalUsd: 85, couponDiscountUsd: 10, paymentDiscountUsd: 5, exchangeRateUsdBs: null });
    for (const field of ['subtotalBs', 'totalBs', 'shippingBs', 'couponDiscountBs', 'paymentDiscountBs']) expect(payload).not.toHaveProperty(field);
  });
  it('reconstructs a missing historical subtotal from the recorded discounts without consulting current prices', () => {
    const order = storedOrder(); order.subtotalBeforeDiscount = null;
    expect(buildOrderConfirmationPayload(order, 'buyer@example.test', products).subtotalUsd).toBe(100);
  });
  it('uses the saved pickup and free shipping evidence even if current products change', () => {
    const order = storedOrder(); order.shippingAddress = 'Retiro en tienda: dirección congelada'; order.freeShipping = false;
    expect(buildOrderConfirmationPayload(order, 'buyer@example.test', [], 'guest-fixture')).toMatchObject({
      shippingAddress: 'Retiro en tienda: dirección congelada', freeShipping: false, guestToken: 'guest-fixture',
    });
  });
  it('uses the verified public lookup when resending to a guest whose raw access token is unavailable', async () => {
    const order = storedOrder(); order.customerId = null;
    const payload = buildOrderConfirmationPayload(order, 'buyer@example.test', products);
    const html = await render(createElement(OrderConfirmationEmail, payload));
    expect(html).toContain('/pedido?n=123');
    expect(html).not.toContain('/checkout/success?orderId='); expect(html).not.toContain('/account/orders/');
    const initial = await render(createElement(OrderConfirmationEmail, { ...payload, guestToken: 'guest-token-fixture' }));
    expect(initial).toContain('/checkout/success?token=guest-token-fixture'); expect(initial).toContain('/pedido?n=123');
  });
});

describe('Admin confirmation resend', () => {
  it('returns 202 for durable queueing and never reports provider delivery', async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, queued: true, deliveryId: 'delivery-fixture' });
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ subtotalUsd: 100, totalUsd: 85, couponDiscountUsd: 10 }), expect.objectContaining({ enqueueOnly: true }));
    expect(m.permission).toHaveBeenCalledWith('ORDERS');
  });
  it('retries one explicit event with the same key and distinguishes a new resend', async () => {
    await POST(request(), params); await POST(request(), params); await POST(request('manual-request-0000000002'), params);
    expect(m.send.mock.calls[0][1].requestKey).toBe(m.send.mock.calls[1][1].requestKey);
    expect(m.send.mock.calls[0][1].requestKey).not.toBe(m.send.mock.calls[2][1].requestKey);
    expect(m.send.mock.calls[0][1].requestKey).toMatch(/^[a-f0-9]{64}$/);
  });
  it('creates distinct manual events for existing clients without a request key', async () => {
    await POST(request(null), params); await POST(request(null), params);
    expect(m.send.mock.calls[0][1].requestKey).not.toBe(m.send.mock.calls[1][1].requestKey);
  });
  it('rejects invalid keys before reading the order or enqueuing anything', async () => {
    expect((await POST(request('too-short'), params)).status).toBe(400);
    expect(m.order).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it('returns a controlled failure instead of false success when the outbox cannot persist', async () => {
    m.send.mockResolvedValue({ accepted: false, reason: 'exception' });
    const response = await POST(request(), params);
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty('success');
    m.order.mockRejectedValueOnce(new Error('fixture database unavailable'));
    expect((await POST(request(), params)).status).toBe(500);
  });
  it('falls back to the linked account email and rejects an order without a recipient', async () => {
    const order = storedOrder(); order.customerEmail = ' '; m.order.mockResolvedValue(order);
    expect((await POST(request(), params)).status).toBe(202);
    expect(m.send.mock.calls[0][0].email).toBe('account@example.test');
    m.user.mockResolvedValue(null); m.send.mockClear();
    expect((await POST(request(), params)).status).toBe(422); expect(m.send).not.toHaveBeenCalled();
  });
  it('stops forbidden origin and delegated users without ORDERS permission', async () => {
    m.origin.mockReturnValueOnce(new Response(null, { status: 403 }));
    expect((await POST(request(), params)).status).toBe(403);
    m.permission.mockResolvedValueOnce({ authorized: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request(), params)).status).toBe(403); expect(m.order).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it('does not enqueue a confirmation the dispatcher must discard for a cancelled order', async () => {
    const order = storedOrder(); order.status = 'Cancelado'; m.order.mockResolvedValue(order);
    expect((await POST(request(), params)).status).toBe(422); expect(m.send).not.toHaveBeenCalled();
  });
});
