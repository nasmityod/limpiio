import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Pool } from 'pg';

// Explicit opt-in to the audit fixture. This suite never follows DATABASE_URL.
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined, pool: undefined as Pool | undefined, userId: '', email: '', failConfirmation: false, failPayment: false }));
const auditUrl = process.env.PD_INTEGRATION_DATABASE_URL;
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { Pool } = await import('pg');
  const url = process.env.PD_INTEGRATION_DATABASE_URL;
  if (url && url !== 'postgresql://audit_local@127.0.0.1:55439/limpio_audit_test') throw new Error('Only the isolated audit PostgreSQL fixture is allowed.');
  state.pool = new Pool({ connectionString: url || 'postgresql://test:test@127.0.0.1:1/test', max: 12 });
  state.db = new PrismaClient({ adapter: new PrismaPg(state.pool) });
  return { prisma: state.db };
});
vi.mock('next-auth/next', () => ({ getServerSession: async () => ({ user: { id: state.userId, email: state.email } }) }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('@/lib/admin-access-server', () => ({ requirePermission: async () => ({ authorized: true, session: { user: { email: state.email } } }), requirePermissionAction: async () => ({ userId: state.userId }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/checkout-mode', () => ({ CHECKOUT_MODE: 'full', isWhatsAppCheckout: false }));
vi.mock('@/lib/cashea-config', () => ({ isCasheaEnabled: () => false }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitCritical: async () => ({ limited: false }), getClientIp: () => '127.0.0.1', hashForBucket: (v: string) => v }));
vi.mock('@/lib/security', async (original) => ({ ...await original<typeof import('@/lib/security')>(), rejectInvalidMutationOrigin: () => null }));
vi.mock('@/lib/exchange-rate', async (original) => ({ ...await original<typeof import('@/lib/exchange-rate')>(), loadExchangeRateUsdBsFromTx: async () => 100 }));
vi.mock('@/lib/data-store', () => ({ readSettings: async () => ({ storeName: 'Audit', address: 'Audit', whatsappOrderPhone: '+584121234567' }) }));
vi.mock('@/lib/abandoned-cart', () => ({ markCartRecovered: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { constructor() { throw new Error('Provider I/O is forbidden in this fixture.'); } } }));
vi.mock('@/lib/resend', async (original) => {
  const actual = await original<typeof import('@/lib/resend')>();
  return { ...actual,
    sendOrderConfirmationEmail: vi.fn(async (...args: Parameters<typeof actual.sendOrderConfirmationEmail>) => {
      if (state.failConfirmation) throw new Error('Simulated outbox enqueue failure');
      return actual.sendOrderConfirmationEmail(...args);
    }),
    sendPaymentValidatedEmail: vi.fn(async (...args: Parameters<typeof actual.sendPaymentValidatedEmail>) => {
      if (state.failPayment) throw new Error('Simulated outbox enqueue failure');
      return actual.sendPaymentValidatedEmail(...args);
    }),
  };
});
vi.mock('@/lib/r2', () => ({ assertProofKey: vi.fn(), deletePrivateProof: vi.fn() }));
vi.mock('@/lib/safe-logger', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));

import { POST } from '@/app/api/orders/route';
import { DELETE } from '@/app/api/orders/[id]/route';
import { POST as approveBinance } from '@/app/api/orders/[id]/approve-binance/route';
import { validateOrderPayment, rejectOrderPayment } from '@/app/actions/orderActions';
import { redeemCouponInTransaction, revertCouponRedemptionInTransaction } from '@/lib/coupons';

const prefix = `audit_pd_${randomUUID().replaceAll('-', '')}`;
const products: string[] = [];
const coupons: string[] = [];
const db = () => state.db!;

async function product(stock: number) {
  const id = `${prefix}_${products.length}`;
  products.push(id);
  return db().product.create({ data: { id, slug: id, name: id, price: 10, stock, category: 'Audit', images: [] } });
}
function body(productId: string, quantity = 1, extra: Record<string, unknown> = {}) {
  return { customerName: 'Audit PD', customerEmail: state.email, shippingMethod: 'mrw', shippingDetails: { address: 'Audit', city: 'Audit', state: 'Audit' }, paymentMethodId: 'cashea', items: [{ productId, quantity }], ...extra };
}
function request(payload: unknown, attemptKey: string) {
  return new Request('http://localhost/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attemptKey }, body: JSON.stringify(payload) });
}

describe.skipIf(!auditUrl)('PostgreSQL audit fixture: committed checkout integrity', () => {
  beforeAll(async () => {
    vi.stubEnv('EMAIL_DELIVERY_SECRET', 'audit-only-email-encryption-key-2026');
    state.userId = prefix;
    state.email = `${prefix}@example.invalid`;
    await db().user.create({ data: { id: prefix, email: state.email, password: 'no-login-fixture' } });
  });
  afterAll(async () => {
    if (state.db) {
      await db().emailDelivery.deleteMany({ where: { recipient: state.email } });
      await db().checkoutAttempt.deleteMany({ where: { order: { customerId: prefix } } });
      await db().order.deleteMany({ where: { customerId: prefix } });
      await db().checkoutAttempt.deleteMany({ where: { key: { in: tombstoneKeys } } });
      await db().coupon.deleteMany({ where: { id: { in: coupons } } });
      await db().product.deleteMany({ where: { id: { in: products } } });
      await db().user.deleteMany({ where: { id: prefix } });
      await state.db.$disconnect();
      await state.pool?.end();
      vi.unstubAllEnvs();
    }
  });

  const tombstoneKeys: string[] = [];
  it('four simultaneous replays commit one order, one reservation and one coupon use', async () => {
    const p = await product(10);
    const couponId = `${prefix}_coupon`;
    coupons.push(couponId);
    const coupon = await db().coupon.create({ data: { id: couponId, code: `PD${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`, discountType: 'FIXED', discountValue: 1, maxUses: 10, perUserLimit: 2 } });
    const key = randomUUID();
    const payload = body(p.id, 1, { couponCode: coupon.code });
    const responses = await Promise.all(Array.from({ length: 4 }, () => POST(request(payload, key))));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await db().order.count({ where: { items: { some: { productId: p.id } } } })).toBe(1);
    expect((await db().product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(9);
    expect((await db().coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);
    expect(await db().couponRedemption.count({ where: { couponId } })).toBe(1);
    expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(1);
    const order = await db().order.findUniqueOrThrow({ where: { id: results[0].id } });
    tombstoneKeys.push(order.checkoutAttemptKey!);
    const conflict = await POST(request(body(p.id, 2, { couponCode: coupon.code }), key));
    expect(conflict.status).toBe(409);
    const removed = await DELETE(new Request(`http://localhost/api/orders/${order.id}`, { method: 'DELETE' }), { params: Promise.resolve({ id: order.id }) });
    expect(removed.status).toBe(200);
    expect((await db().product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10);
    expect((await db().coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    expect((await db().checkoutAttempt.findUniqueOrThrow({ where: { key: order.checkoutAttemptKey! } })).orderId).toBeNull();
    expect((await POST(request(payload, key))).status).toBe(409);
    expect((await db().product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10);
  }, 20_000);

  it('outbox failure rolls back checkout and payment; the same attempt can safely retry', async () => {
    const p = await product(4);
    const key = randomUUID();
    const before = await db().emailDelivery.count({ where: { recipient: state.email } });
    state.failConfirmation = true;
    try {
      expect((await POST(request(body(p.id), key))).status).toBe(500);
      expect(await db().order.count({ where: { items: { some: { productId: p.id } } } })).toBe(0);
      expect((await db().product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(4);
      expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(before);
    } finally { state.failConfirmation = false; }
    const retry = await POST(request(body(p.id), key));
    expect(retry.status).toBe(201);
    const order = await retry.json();
    state.failPayment = true;
    try {
      expect((await validateOrderPayment(order.id)).success).toBe(false);
      const unpaid = await db().order.findUniqueOrThrow({ where: { id: order.id } });
      expect(unpaid.status).toBe('Pendiente');
      expect(unpaid.paidAt).toBeNull();
      expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(before + 1);
    } finally { state.failPayment = false; }
    expect((await validateOrderPayment(order.id)).success).toBe(true);
    expect((await db().order.findUniqueOrThrow({ where: { id: order.id } })).paidAt).not.toBeNull();
    expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(before + 2);
    expect((await validateOrderPayment(order.id)).success).toBe(true);
    expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(before + 2);
  }, 20_000);

  it('Binance approval queues with the payment transaction and rejection queues with inventory restoration', async () => {
    const p = await product(4);
    const created = await POST(request(body(p.id), randomUUID()));
    expect(created.status).toBe(201);
    const order = await created.json();
    await db().order.update({ where: { id: order.id }, data: { status: 'Pendiente verificación Binance', paymentMethodId: 'binancepay', paymentMethod: 'Binance Pay' } });
    const before = await db().emailDelivery.count({ where: { recipient: state.email } });
    state.failPayment = true;
    try {
      const failed = await approveBinance(new Request('http://localhost/api/orders/approve-binance', { method: 'POST' }), { params: Promise.resolve({ id: order.id }) });
      expect(failed.status).toBe(500);
      expect((await db().order.findUniqueOrThrow({ where: { id: order.id } })).paidAt).toBeNull();
      expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(before);
    } finally { state.failPayment = false; }
    expect((await approveBinance(new Request('http://localhost/api/orders/approve-binance', { method: 'POST' }), { params: Promise.resolve({ id: order.id }) })).status).toBe(200);
    expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(before + 1);
    const rejected = await POST(request(body(p.id), randomUUID()));
    expect(rejected.status).toBe(201);
    const rejectedOrder = await rejected.json();
    const stockBefore = (await db().product.findUniqueOrThrow({ where: { id: p.id } })).stock;
    expect((await rejectOrderPayment(rejectedOrder.id, 'Audit rechazo')).success).toBe(true);
    expect((await db().product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(stockBefore + 1);
    expect(await db().emailDelivery.count({ where: { recipient: state.email } })).toBe(before + 3);
  }, 20_000);

  it('six distinct simultaneous attempts cannot oversell the last unit', async () => {
    const p = await product(1);
    const responses = await Promise.all(Array.from({ length: 6 }, () => POST(request(body(p.id), randomUUID()))));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(5);
    expect((await db().product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(0);
    expect(await db().order.count({ where: { items: { some: { productId: p.id } } } })).toBe(1);
  }, 20_000);

  it('simultaneous coupon reversals decrement its committed counter once', async () => {
    const p = await product(3);
    const couponId = `${prefix}_revert`;
    coupons.push(couponId);
    const coupon = await db().coupon.create({ data: { id: couponId, code: `PD${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`, discountType: 'FIXED', discountValue: 1, maxUses: 10 } });
    const res = await POST(request(body(p.id, 1, { couponCode: coupon.code }), randomUUID()));
    expect(res.status).toBe(201);
    const created = await res.json();
    await Promise.all(Array.from({ length: 4 }, () => db().$transaction((tx) => revertCouponRedemptionInTransaction(tx, created.id))));
    expect((await db().coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(0);
    expect(await db().couponRedemption.count({ where: { couponId, revertedAt: null } })).toBe(0);
  }, 20_000);

  it('reuses a cancelled lower coupon slot without colliding with an active higher slot', async () => {
    const couponId = `${prefix}_slots`;
    coupons.push(couponId);
    await db().coupon.create({ data: { id: couponId, code: `PD${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`, discountType: 'FIXED', discountValue: 1, maxUses: 10, perUserLimit: 2 } });
    const orders = await Promise.all(Array.from({ length: 3 }, () => db().order.create({ data: { customerId: prefix, customerName: 'Audit PD', total: 10, paymentMethod: 'Audit', shippingAddress: 'Audit', shippingCity: 'Audit', shippingState: 'Audit' } })));
    const redeem = (orderId: string) => db().$transaction((tx) => redeemCouponInTransaction(tx, { couponId, maxUses: 10, perUserLimit: 2, orderId, userId: prefix, discountBs: 1 }));
    await redeem(orders[0].id);
    await redeem(orders[1].id);
    await db().$transaction((tx) => revertCouponRedemptionInTransaction(tx, orders[0].id));
    await redeem(orders[2].id);
    const active = await db().couponRedemption.findMany({ where: { couponId, revertedAt: null }, orderBy: { perUserSlot: 'asc' } });
    expect(active.map((r) => r.perUserSlot)).toEqual([1, 2]);
    expect(active[0].orderId).toBe(orders[2].id);
    expect((await db().coupon.findUniqueOrThrow({ where: { id: couponId } })).usedCount).toBe(2);
  }, 20_000);
});
