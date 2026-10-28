import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emailOutboxTransaction } from '@/lib/email-outbox-context';

const h = vi.hoisted(() => ({
  order: { id: 'order', orderNumber: 42, status: 'Enviado', stockDeducted: true, paidAt: new Date('2026-01-01'), casheaStatus: null,
    customerEmail: 'customer@example.test', customerName: 'Cliente Test', customer: null, items: [], shippedAt: new Date('2026-01-01'),
    trackingNumber: '123', trackingCarrier: 'MRW', trackingUrl: 'https://www.mrw.com.ve/old', trackingPhotoUrl: 'https://cdn.vitest.example/guide.jpg', updatedAt: new Date('2026-01-01') },
  send: vi.fn(), conflict: false,
  prisma: { order: { findUnique: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/admin-access-server', () => ({ requirePermission: vi.fn(async () => ({ authorized: true })) }));
vi.mock('@/lib/security', () => ({ rejectInvalidMutationOrigin: () => null }));
vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('@/lib/checkout-order', () => ({ applyOrderCancellationEffectsInTransaction: vi.fn() }));
vi.mock('@/lib/definitions', () => ({ VALID_ORDER_STATUSES: ['Pendiente', 'En Proceso', 'Enviado', 'Entregado', 'Cancelado'], prismaOrderToOrder: (order: unknown) => order }));
vi.mock('@/lib/r2', () => ({ deletePrivateProof: vi.fn() }));
vi.mock('@/lib/resend', () => ({ sendShippingEmail: h.send, sendOrderCancelledEmail: vi.fn(), sendOrderDeliveredEmail: vi.fn() }));
import { PUT } from '@/app/api/orders/[id]/status/route';
import { PATCH } from '@/app/api/orders/[id]/route';
const params = { params: Promise.resolve({ id: 'order' }) };
const request = (method: string, body: unknown) => new Request('http://localhost/api/orders/order', { method, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); h.conflict = false;
  h.order = { id: 'order', orderNumber: 42, status: 'Enviado', stockDeducted: true, paidAt: new Date('2026-01-01'), casheaStatus: null,
    customerEmail: 'customer@example.test', customerName: 'Cliente Test', customer: null, items: [], shippedAt: new Date('2026-01-01'),
    trackingNumber: '123', trackingCarrier: 'MRW', trackingUrl: 'https://www.mrw.com.ve/old', trackingPhotoUrl: 'https://cdn.vitest.example/guide.jpg', updatedAt: new Date('2026-01-01') };
  h.prisma.order.findUnique.mockImplementation(async () => ({ ...h.order }));
  h.prisma.order.updateMany.mockImplementation(async ({ data }) => {
    if (h.conflict) return { count: 0 };
    h.order = { ...h.order, ...data }; return { count: 1 };
  });
  h.prisma.$transaction.mockImplementation(async fn => {
    const before = { ...h.order }; try { return await fn(h.prisma); } catch (error) { h.order = before; throw error; }
  });
  h.send.mockImplementation(async () => { expect(emailOutboxTransaction()).toBeTruthy(); });
});
describe('tracking changes keep their fields and durable notification coherent', () => {
  it('status PUT of one tracking field preserves the other three and queues its corrected URL', async () => {
    expect((await PUT(request('PUT', { status: 'Enviado', trackingUrl: 'https://www.mrw.com.ve/new' }), params)).status).toBe(200);
    expect(h.order.trackingNumber).toBe('123'); expect(h.order.trackingCarrier).toBe('MRW');
    expect(h.order.trackingPhotoUrl).toContain('guide.jpg');
    expect(h.send).toHaveBeenCalledWith('customer@example.test', 'Cliente', '123', expect.objectContaining({ trackingUrl: 'https://www.mrw.com.ve/new' }));
  });
  it('tracking editor PATCH adding the guide after shipping queues a notification in its transaction', async () => {
    h.order.trackingNumber = '';
    expect((await PATCH(request('PATCH', { trackingNumber: '456' }), params)).status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1); expect(h.order.trackingCarrier).toBe('MRW');
  });
  it('repeating the same guide and details never queues a duplicate notification', async () => {
    expect((await PATCH(request('PATCH', { trackingNumber: '456' }), params)).status).toBe(200);
    expect((await PATCH(request('PATCH', { trackingNumber: '456' }), params)).status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it('carrier-only correction queues the new details even when the guide number is unchanged', async () => {
    expect((await PATCH(request('PATCH', { trackingCarrier: 'ZOOM' }), params)).status).toBe(200);
    expect(h.send).toHaveBeenCalledWith('customer@example.test', 'Cliente', '123', expect.objectContaining({ carrier: 'ZOOM' }));
  });
  it('failure to enqueue rolls back the tracking edit', async () => {
    h.send.mockRejectedValueOnce(new Error('Outbox unavailable'));
    expect((await PATCH(request('PATCH', { trackingNumber: '456' }), params)).status).toBe(500);
    expect(h.order.trackingNumber).toBe('123');
  });
  it('a conflicting edit does not enqueue or change tracking', async () => {
    h.conflict = true;
    expect((await PATCH(request('PATCH', { trackingNumber: '456' }), params)).status).toBe(409);
    expect(h.order.trackingNumber).toBe('123'); expect(h.send).not.toHaveBeenCalled();
  });
});
