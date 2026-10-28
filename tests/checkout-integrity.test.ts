import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkoutSchema } from '@/lib/checkout-order';
import { checkoutOperationKey, checkoutPayloadHash, checkoutCapability } from '@/lib/checkout-idempotency';
import { statusTransitionError, orderSnapshotGuard } from '@/lib/order-lifecycle';
import { normalizeBcvDate } from '@/lib/bcv-date';
import { redeemCouponInTransaction, revertCouponRedemptionInTransaction } from '@/lib/coupons';
import type { Prisma } from '@prisma/client';
import { assertBuyerReservationCapacity } from '@/lib/order-reservation';

const input = checkoutSchema.parse({ customerName: 'Ana', customerId: 'buyer-1', shippingDetails: { address: 'A', city: 'C', state: 'S' }, paymentMethodId: 'efectivo', items: [{ productId: 'p1', quantity: 1 }] });
const paid = { status: 'En Proceso', paidAt: new Date(), stockDeducted: true, casheaStatus: null };
afterEach(() => vi.unstubAllEnvs());

describe('order lifecycle integrity', () => {
  it.each(['En Proceso', 'Enviado', 'Entregado'] as const)('cannot use generic status to pay a pending order: %s', (status) => {
    expect(statusTransitionError({ ...paid, status: 'Pendiente', paidAt: null }, status)).toContain('Valida');
  });
  it('requires shipment before delivery except documented store pickup', () => {
    expect(statusTransitionError(paid, 'Entregado')).toBeTruthy();
    expect(statusTransitionError({ ...paid, shippingAddress: 'Retiro en tienda Demo — A' }, 'Entregado')).toBeNull();
    expect(statusTransitionError({ ...paid, status: 'Enviado' }, 'Entregado')).toBeNull();
  });
  it('never revives cancelled orders or bypasses an automatic Cashea lifecycle', () => {
    expect(statusTransitionError({ ...paid, status: 'Cancelado', stockDeducted: false }, 'Enviado')).toBeTruthy();
    expect(statusTransitionError({ ...paid, status: 'Pendiente', casheaStatus: 'RETURNED' }, 'Cancelado')).toContain('Cashea');
  });
  it('CAS guards stale monetary edits as well as stock/status transitions', () => {
    const date = new Date();
    expect(orderSnapshotGuard({ ...paid, id: 'o1', updatedAt: date })).toMatchObject({ id: 'o1', status: 'En Proceso', stockDeducted: true, paidAt: paid.paidAt, updatedAt: date, casheaStatus: null });
  });
});

describe('durable checkout attempts', () => {
  it('caps stock reservations for Binance and every other unpaid method together', async () => {
    const findMany = vi.fn().mockResolvedValue([{ items: [{ quantity: 80 }] }]);
    const tx = { order: { findMany } } as unknown as Prisma.TransactionClient;
    await expect(assertBuyerReservationCapacity(tx, 'u1', [{ quantity: 21 }])).rejects.toMatchObject({ httpStatus: 409 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ paidAt: null, stockDeducted: true, status: { in: ['Pendiente', 'Pendiente verificación Binance'] } }) }));
  });
  it('scopes operation keys to buyer and separates actual attempts', () => {
    const attempt = 'same-attempt-1234567890';
    expect(checkoutOperationKey('A', attempt)).toBe(checkoutOperationKey('A', attempt));
    expect(checkoutOperationKey('A', attempt)).not.toBe(checkoutOperationKey('B', attempt));
    expect(checkoutOperationKey('A', attempt)).not.toBe(checkoutOperationKey('A', 'another-attempt-1234567890'));
    expect(() => checkoutOperationKey('A', undefined)).toThrow();
  });
  it('canonicalizes repeated/reordered lines but detects changed method, address or buyer data', () => {
    expect(checkoutPayloadHash({ ...input, items: [{ productId: 'p1', quantity: 1, imageUrl: null }, { productId: 'p1', quantity: 1, imageUrl: null }] })).toBe(checkoutPayloadHash({ ...input, items: [{ productId: 'p1', quantity: 2, imageUrl: null }] }));
    for (const changed of [{ ...input, paymentMethodId: 'zelle' }, { ...input, customerIdNumber: 'V12345678' }, { ...input, shippingDetails: { ...input.shippingDetails, address: 'B' } }]) expect(checkoutPayloadHash(changed)).not.toBe(checkoutPayloadHash(input));
  });
  it('can return the same guest capability after a lost response without storing its clear value', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-only-checkout-secret');
    const key = checkoutOperationKey('guest:ana@example.test', 'same-attempt-1234567890');
    expect(checkoutCapability('guest', key)).toBe(checkoutCapability('guest', key));
    expect(checkoutCapability('cashea', key)).not.toBe(checkoutCapability('guest', key));
  });
});

describe('coupon redemption claims', () => {
  it('reuses slot 1 after its cancellation while slot 2 is active', async () => {
    const create = vi.fn();
    const tx = { coupon: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, couponRedemption: { findMany: vi.fn().mockResolvedValue([{ perUserSlot: 2 }]), create, count: vi.fn().mockResolvedValue(2) } };
    await redeemCouponInTransaction(tx as unknown as Prisma.TransactionClient, { couponId: 'c', orderId: 'o', userId: 'u', maxUses: 5, perUserLimit: 2, discountBs: 1 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ perUserSlot: 1 }) }));
  });
  it('only the reversal winning the nullable revertedAt claim decrements the global counter', async () => {
    const decrement = vi.fn().mockResolvedValue({ count: 1 });
    let active = true;
    const tx = { coupon: { updateMany: decrement }, couponRedemption: { findUnique: vi.fn().mockResolvedValue({ id: 'r', couponId: 'c', revertedAt: null }), updateMany: vi.fn().mockImplementation(async () => { const won = active; active = false; return { count: won ? 1 : 0 }; }) } };
    await Promise.all([revertCouponRedemptionInTransaction(tx as unknown as Prisma.TransactionClient, 'o'), revertCouponRedemptionInTransaction(tx as unknown as Prisma.TransactionClient, 'o')]);
    expect(decrement).toHaveBeenCalledTimes(1);
  });
});

describe('BCV publication dates', () => {
  it('rejects impossible dates and unsupported strings instead of normalizing them into another month', () => {
    expect(normalizeBcvDate('2026-02-30T00:00:00Z')).toBeNull();
    expect(normalizeBcvDate('31/02/2026')).toBeNull();
    expect(normalizeBcvDate('yesterday')).toBeNull();
  });
  it('canonicalizes equivalent ISO timestamps and explicit Venezuelan dates', () => {
    expect(normalizeBcvDate('2026-10-04T00:00:00-04:00')).toBe('2026-10-04T04:00:00.000Z');
    expect(normalizeBcvDate('04/10/2026 00:00:00')).toBe('2026-10-04T04:00:00.000Z');
  });
});
