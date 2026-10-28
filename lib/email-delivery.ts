import { createHash, randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { EmailDelivery, Prisma } from '@prisma/client';
import { hashRecoveryToken } from '@/lib/abandoned-cart';
import { reminderToken } from '@/lib/email-payload';
import { sendAbandonedCartEmail, sendRestockNotificationEmail, sendReviewRequestEmailResult, sendStoredBrandedEmail, type EmailSendResult } from '@/lib/resend';
import { emailSiteBaseUrl } from '@/emails/transactional/site';
import { d } from '@/lib/decimal';
import { logError } from '@/lib/safe-logger';
import type { AbandonedCartItem } from '@/lib/definitions';
import type { ReviewRequestProduct } from '@/emails/transactional/ReviewRequestEmail';

const HOUR = 60 * 60_000;
const RETRY_WINDOW = 23 * HOUR; // Provider idempotency expires after 24 hours.
type CartPayload = {
  activityAt: string; preferenceId: string; items: AbandonedCartItem[]; totalUsd: number;
  coupon?: { code: string; discountLabel: string; expiryDays: number };
};
type RestockPayload = { generation: number; productId: string; productName: string; productUrl: string; productImageUrl?: string; productPrice: string };
type ReviewPayload = { customerName: string; products: ReviewRequestProduct[] };

export async function enqueueAbandonedReminder(cartId: string, wave: '24h' | '72h', snapshot: { items: AbandonedCartItem[]; totalUsd: number }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.abandonedCart.findUnique({ where: { id: cartId } });
    if (!before) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'reminder:' + before.email}, 0))`;
    const cart = await tx.abandonedCart.findUnique({ where: { id: cartId } });
    if (!cart || !cartIsEligible(cart, wave)) return;
    const preferenceId = randomUUID();
    const preference = await tx.cartReminderPreference.upsert({
      where: { email: cart.email }, update: {},
      create: { id: preferenceId, email: cart.email, unsubscribeTokenHash: hashRecoveryToken(reminderToken(preferenceId, 'unsubscribe')) },
    });
    if (preference.optedOutAt) return;
    if (!preference.unsubscribeTokenHash) await tx.cartReminderPreference.update({ where: { id: preference.id }, data: { unsubscribeTokenHash: hashRecoveryToken(reminderToken(preference.id, 'unsubscribe')) } });
    const kind = wave === '24h' ? 'ABANDONED_24H' : 'ABANDONED_72H';
    const dedupKey = `${kind}:${cart.id}:${cart.lastActivityAt.toISOString()}`;
    if (await tx.emailDelivery.findUnique({ where: { dedupKey }, select: { id: true } })) return;
    const id = randomUUID();
    let coupon: CartPayload['coupon'];
    if (wave === '72h') {
      const code = `VUELVE-${createHash('sha256').update(id).digest('hex').slice(0, 12).toUpperCase()}`;
      await tx.coupon.create({ data: {
        code, description: 'Cupón de recuperación de carrito (un solo uso)', discountType: 'PERCENT',
        discountValue: 5, maxDiscount: 10, minPurchase: 0, maxUses: 1, perUserLimit: null,
        expiresAt: new Date(Date.now() + 7 * 24 * HOUR), active: true,
      } });
      coupon = { code, discountLabel: '5% de descuento (hasta $10)', expiryDays: 7 };
    }
    const payload: CartPayload = { activityAt: cart.lastActivityAt.toISOString(), preferenceId: preference.id, items: snapshot.items, totalUsd: snapshot.totalUsd, ...(coupon ? { coupon } : {}) };
    await tx.emailDelivery.create({ data: {
      id, dedupKey, kind, resourceId: cart.id, recipient: cart.email, payload: payload as unknown as Prisma.InputJsonValue,
      recoveryTokenHash: hashRecoveryToken(reminderToken(id, 'recovery')), tokenExpiresAt: new Date(Date.now() + 30 * 24 * HOUR),
    } });
  });
}

export async function enqueueRestockNotifications(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, slug: true, stock: true, isActive: true, images: true, price: true } });
  if (!product?.isActive || product.stock <= 0) return;
  // Existing jobs are dispatched independently. Selecting their subscriptions
  // again would let a rejected/reviewed first batch starve newer subscribers.
  const subscribers = await prisma.$queryRaw<Array<{ id: string; email: string; generation: number }>>`
    SELECT s.id, s.email, s.generation FROM "RestockSubscription" s
    WHERE s."productId" = ${productId} AND s."notifiedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "EmailDelivery" e
        WHERE e."dedupKey" = 'RESTOCK:' || s.id || ':' || s.generation::text
      )
    ORDER BY s."createdAt" ASC, s.id ASC LIMIT 100`;
  for (const sub of subscribers) {
    const payload: RestockPayload = {
      generation: sub.generation, productId, productName: product.name,
      productUrl: `${emailSiteBaseUrl().replace(/\/$/, '')}/product/${encodeURIComponent(product.slug)}`,
      productPrice: `US $${d(product.price).toFixed(2)}`, ...(product.images[0] ? { productImageUrl: product.images[0] } : {}),
    };
    await prisma.emailDelivery.upsert({
      where: { dedupKey: `RESTOCK:${sub.id}:${sub.generation}` }, update: {},
      create: { dedupKey: `RESTOCK:${sub.id}:${sub.generation}`, kind: 'RESTOCK', resourceId: sub.id, recipient: sub.email, payload: payload as unknown as Prisma.InputJsonValue },
    });
  }
}

/** Also retries stock notifications after a failed admin-triggered dispatch. */
export async function enqueuePendingRestockNotifications(): Promise<void> {
  const products = await prisma.$queryRaw<Array<{ productId: string }>>`
    SELECT DISTINCT s."productId" FROM "RestockSubscription" s
    JOIN "Product" p ON p.id = s."productId"
    WHERE s."notifiedAt" IS NULL AND p."isActive" = true AND p.stock > 0
      AND NOT EXISTS (
        SELECT 1 FROM "EmailDelivery" e
        WHERE e."dedupKey" = 'RESTOCK:' || s.id || ':' || s.generation::text
      )
    ORDER BY s."productId" LIMIT 10`;
  for (const product of products) await enqueueRestockNotifications(product.productId);
}

export async function enqueueReviewRequest(orderId: string, email: string, payload: ReviewPayload): Promise<void> {
  if (!payload.products.length) return;
  await prisma.emailDelivery.upsert({
    where: { dedupKey: `REVIEW_REQUEST:${orderId}` }, update: {},
    create: { dedupKey: `REVIEW_REQUEST:${orderId}`, kind: 'REVIEW_REQUEST', resourceId: orderId, recipient: email.trim().toLowerCase(), payload: payload as unknown as Prisma.InputJsonValue },
  });
}

/** Bound new work without letting already queued or unreviewable orders consume
 * every slot. The dispatcher owns retries of existing delivery jobs. */
export async function reviewRequestCandidateIds(oldestEligible: Date, newestEligible: Date, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id FROM "Order" o
    WHERE o.status = 'Entregado' AND o."reviewRequestSentAt" IS NULL
      AND o."deliveredAt" >= ${oldestEligible} AND o."deliveredAt" <= ${newestEligible}
      AND length(trim(coalesce(o."customerEmail", ''))) > 0
      AND EXISTS (
        SELECT 1 FROM "OrderItem" i JOIN "Product" p ON p.id = i."productId"
        WHERE i."orderId" = o.id AND p."isActive" = true AND length(trim(coalesce(p.slug, ''))) > 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM "EmailDelivery" e WHERE e."dedupKey" = 'REVIEW_REQUEST:' || o.id
      )
    ORDER BY o."deliveredAt" ASC, o.id ASC LIMIT ${Math.min(100, Math.max(1, limit))}`;
  return rows.map(row => row.id);
}

function cartIsEligible(cart: { status: string; lastActivityAt: Date; emailSentAt: Date | null }, wave: '24h' | '72h'): boolean {
  if (wave === '24h') return cart.status === 'PENDING' && Date.now() - cart.lastActivityAt.getTime() >= 24 * HOUR;
  return cart.status === 'EMAILED_24H' && !!cart.emailSentAt && Date.now() - cart.emailSentAt.getTime() >= 48 * HOUR && Date.now() - cart.lastActivityAt.getTime() >= 72 * HOUR;
}

async function eligibility(job: EmailDelivery): Promise<'ready' | 'defer' | 'cancel'> {
  if (job.kind === 'TRANSACTIONAL') {
    if (job.tokenExpiresAt && job.tokenExpiresAt <= new Date()) return 'cancel';
    const payload = job.payload as { scope?: string; tokenType?: string; tokenHash?: string; orderId?: string; orderRef?: string; trackingNumber?: string; trackingCarrier?: string | null; trackingUrl?: string | null };
    if (payload.tokenType === 'PASSWORD_RESET') {
      const token = await prisma.passwordResetToken.findUnique({ where: { token: payload.tokenHash }, select: { expiresAt: true } });
      return token && token.expiresAt > new Date() ? 'ready' : 'cancel';
    }
    if (payload.tokenType === 'EMAIL_CHANGE') {
      const user = await prisma.user.findUnique({ where: { emailChangeToken: payload.tokenHash }, select: { emailChangeTokenExpiry: true } });
      return user?.emailChangeTokenExpiry && user.emailChangeTokenExpiry > new Date() ? 'ready' : 'cancel';
    }
    if (payload.orderId || payload.orderRef) {
      const orderNumber = payload.orderRef?.replace(/^#/, '');
      if (!payload.orderId && (!orderNumber || !/^\d+$/.test(orderNumber) || !Number.isSafeInteger(Number(orderNumber)))) return 'cancel';
      const order = await prisma.order.findFirst({ where: payload.orderId ? { id: payload.orderId } : { orderNumber: Number(orderNumber) }, select: { status: true, customerEmail: true, customer: { select: { email: true } }, trackingNumber: true, trackingCarrier: true, trackingUrl: true, paidAt: true, legacyPaidConfirmed: true } });
      if (!order || (order.customerEmail || order.customer?.email)?.trim().toLowerCase() !== job.recipient) return 'cancel';
      if (payload.scope === 'order-cancelled-email' || payload.scope === 'payment-rejected-email') return order.status === 'Cancelado' ? 'ready' : 'cancel';
      if (order.status === 'Cancelado') return 'cancel';
      if (payload.scope === 'shipping-email') return ['Enviado', 'Entregado'].includes(order.status) && order.trackingNumber === payload.trackingNumber && (order.trackingCarrier ?? null) === (payload.trackingCarrier ?? null) && (order.trackingUrl ?? null) === (payload.trackingUrl ?? null) ? 'ready' : 'cancel';
      if (payload.scope === 'order-delivered-email') return order.status === 'Entregado' ? 'ready' : 'cancel';
      if (payload.scope === 'payment-validated-email') return (order.paidAt || order.legacyPaidConfirmed) && ['En Proceso', 'Enviado', 'Entregado'].includes(order.status) ? 'ready' : 'cancel';
    }
    return 'ready';
  }
  if (job.kind === 'RESTOCK') {
    const payload = job.payload as unknown as RestockPayload;
    const sub = await prisma.restockSubscription.findUnique({ where: { id: job.resourceId } });
    if (!sub || sub.notifiedAt || sub.generation !== payload.generation) return 'cancel';
    const product = await prisma.product.findUnique({ where: { id: payload.productId }, select: { stock: true, isActive: true } });
    return product?.isActive && product.stock > 0 ? 'ready' : 'defer';
  }
  if (job.kind === 'REVIEW_REQUEST') {
    const order = await prisma.order.findUnique({ where: { id: job.resourceId }, select: { status: true, reviewRequestSentAt: true } });
    return order?.status === 'Entregado' && !order.reviewRequestSentAt ? 'ready' : 'cancel';
  }
  if (job.kind === 'ABANDONED_24H' || job.kind === 'ABANDONED_72H') {
    const payload = job.payload as unknown as CartPayload;
    const [cart, preference] = await Promise.all([
      prisma.abandonedCart.findUnique({ where: { id: job.resourceId } }),
      prisma.cartReminderPreference.findUnique({ where: { email: job.recipient }, select: { optedOutAt: true } }),
    ]);
    if (!cart || preference?.optedOutAt || cart.lastActivityAt.toISOString() !== payload.activityAt) return 'cancel';
    if (!job.tokenExpiresAt || job.tokenExpiresAt <= new Date()) return 'cancel';
    return cartIsEligible(cart, job.kind === 'ABANDONED_24H' ? '24h' : '72h') ? 'ready' : 'cancel';
  }
  return 'cancel';
}

async function send(job: EmailDelivery): Promise<EmailSendResult> {
  if (job.kind === 'TRANSACTIONAL') return sendStoredBrandedEmail(job.id);
  if (job.kind === 'RESTOCK') return sendRestockNotificationEmail({ ...(job.payload as unknown as RestockPayload), email: job.recipient, deliveryId: job.id });
  if (job.kind === 'REVIEW_REQUEST') {
    return sendReviewRequestEmailResult({ ...(job.payload as unknown as ReviewPayload), email: job.recipient, deliveryId: job.id });
  }
  const payload = job.payload as unknown as CartPayload;
  const recoveryToken = reminderToken(job.id, 'recovery');
  if (hashRecoveryToken(recoveryToken) !== job.recoveryTokenHash) return { accepted: false, reason: 'invalid' };
  const unsubscribeToken = reminderToken(payload.preferenceId, 'unsubscribe');
  const preference = await prisma.cartReminderPreference.findUnique({ where: { id: payload.preferenceId }, select: { unsubscribeTokenHash: true } });
  if (preference?.unsubscribeTokenHash !== hashRecoveryToken(unsubscribeToken)) return { accepted: false, reason: 'invalid' };
  return sendAbandonedCartEmail({
    email: job.recipient, customerName: job.recipient.split('@')[0], items: payload.items, totalUsd: payload.totalUsd,
    recoveryToken, unsubscribeToken, deliveryId: job.id, coupon: payload.coupon,
  });
}

async function recordAcceptance(job: EmailDelivery, leaseId: string, providerMessageId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const won = await tx.emailDelivery.updateMany({ where: { id: job.id, leaseId, status: 'PROCESSING' }, data: { status: 'SENT', acceptedAt: now, providerMessageId, leaseId: null, lockedUntil: null, lastError: null } });
    if (!won.count) {
      // A concurrent unsubscribe may cancel an already in-flight request.
      await tx.emailDelivery.updateMany({ where: { id: job.id, acceptedAt: null }, data: { acceptedAt: now, providerMessageId } });
      return;
    }
    if (job.kind === 'RESTOCK') {
      const payload = job.payload as unknown as RestockPayload;
      await tx.restockSubscription.updateMany({ where: { id: job.resourceId, generation: payload.generation, notifiedAt: null }, data: { notifiedAt: now } });
    } else if (job.kind === 'REVIEW_REQUEST') {
      await tx.order.updateMany({ where: { id: job.resourceId, reviewRequestSentAt: null }, data: { reviewRequestSentAt: now } });
    } else if (job.kind === 'ABANDONED_24H' || job.kind === 'ABANDONED_72H') {
      const payload = job.payload as unknown as CartPayload;
      await tx.abandonedCart.updateMany({
        where: { id: job.resourceId, status: job.kind === 'ABANDONED_24H' ? 'PENDING' : 'EMAILED_24H', lastActivityAt: new Date(payload.activityAt) },
        data: { status: job.kind === 'ABANDONED_24H' ? 'EMAILED_24H' : 'EMAILED_72H', emailSentAt: now },
      });
    }
  });
}

export async function processEmailDeliveries(kinds?: string[], limit = 20, onlyId?: string): Promise<{ accepted: Record<string, number>; failed: number; deferred: number; review: number }> {
  const summary = { accepted: {} as Record<string, number>, failed: 0, deferred: 0, review: 0 };
  const now = new Date();
  const eligibleWhere: Prisma.EmailDeliveryWhereInput = { OR: [
    { status: 'PENDING', nextAttemptAt: { lte: now } },
    { status: 'PROCESSING', lockedUntil: { lt: now } },
  ] };
  const jobs = await prisma.emailDelivery.findMany({ where: { ...eligibleWhere, ...(kinds ? { kind: { in: kinds } } : {}), ...(onlyId ? { id: onlyId } : {}) }, orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }], take: Math.min(50, Math.max(1, limit)) });
  const startedAt = Date.now();
  for (const job of jobs) {
    if (Date.now() - startedAt > 80_000) break; // Leave room for one 10s request and cron's 120s caller timeout.
    const leaseId = randomUUID();
    const claimed = await prisma.emailDelivery.updateMany({ where: { id: job.id, ...eligibleWhere }, data: { status: 'PROCESSING', leaseId, lockedUntil: new Date(Date.now() + 2 * 60_000), attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    const owned = { id: job.id, status: 'PROCESSING', leaseId };
    try {
      const eligible = await eligibility(job);
      if (eligible !== 'ready') {
        await prisma.emailDelivery.updateMany({ where: owned, data: { status: eligible === 'cancel' ? 'CANCELED' : 'PENDING', nextAttemptAt: new Date(Date.now() + HOUR), lastError: eligible === 'cancel' ? 'resource_changed' : 'product_unavailable', lockedUntil: null, leaseId: null } });
        summary.deferred++; continue;
      }
      if (job.firstAttemptAt && Date.now() - job.firstAttemptAt.getTime() >= RETRY_WINDOW) {
        await prisma.emailDelivery.updateMany({ where: owned, data: { status: 'REVIEW', lastError: 'provider_idempotency_window_expired', lockedUntil: null, leaseId: null } });
        summary.review++; continue;
      }
      const result = await send(job);
      if (result.accepted) {
        await recordAcceptance(job, leaseId, result.providerMessageId);
        summary.accepted[job.kind] = (summary.accepted[job.kind] || 0) + 1;
      } else {
        if (result.reason === 'invalid') {
          await prisma.emailDelivery.updateMany({ where: owned, data: { status: 'REVIEW', lastError: 'invalid_encrypted_payload', lockedUntil: null, leaseId: null } });
          summary.review++; continue;
        }
        await prisma.emailDelivery.updateMany({ where: owned, data: { status: 'PENDING', nextAttemptAt: new Date(Date.now() + Math.min(6 * HOUR, 60_000 * 2 ** Math.min(job.attempts, 8))), lastError: result.reason, lockedUntil: null, leaseId: null } });
        summary.failed++;
      }
    } catch (error) {
      logError('email_delivery_failed', error, { provider: 'resend', operation: 'email_delivery' });
      // If persistence fails after acceptance, the stale lease is recoverable;
      // the frozen body and provider idempotency key protect the retry.
      try { await prisma.emailDelivery.updateMany({ where: owned, data: { status: 'PENDING', nextAttemptAt: new Date(Date.now() + 5 * 60_000), lastError: 'exception', lockedUntil: null, leaseId: null } }); } catch { /* Recover through the durable lease. */ }
      summary.failed++;
    }
  }
  return summary;
}

/** Bound sensitive ciphertext retention without deleting suppression choices. */
export async function purgeTerminalEmailDeliveries(): Promise<number> {
  const rows = await prisma.emailDelivery.findMany({ where: { status: { in: ['SENT', 'CANCELED'] }, updatedAt: { lt: new Date(Date.now() - 30 * 24 * HOUR) } }, select: { id: true }, orderBy: { updatedAt: 'asc' }, take: 500 });
  if (!rows.length) return 0;
  const deleted = await prisma.emailDelivery.deleteMany({ where: { id: { in: rows.map(row => row.id) }, status: { in: ['SENT', 'CANCELED'] } } });
  return deleted.count;
}
