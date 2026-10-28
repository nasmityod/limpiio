import { randomUUID, createHash } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ userId: '', restock: vi.fn(), abandoned: vi.fn(), review: vi.fn(), transactional: vi.fn(), deleteR2: vi.fn() }));
vi.mock('next-auth/next', () => ({ getServerSession: async () => ({ user: { id: m.userId } }) }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('@/lib/resend', async original => ({ ...await original<typeof import('@/lib/resend')>(), sendRestockNotificationEmail: m.restock, sendAbandonedCartEmail: m.abandoned, sendReviewRequestEmailResult: m.review, sendStoredBrandedEmail: m.transactional }));
vi.mock('@/lib/r2', async original => ({ ...await original<typeof import('@/lib/r2')>(), deleteFromR2: m.deleteR2 }));

const { prisma } = await import('@/lib/prisma');
const { mergeWishlistAction, addWishlistItemAction } = await import('@/app/actions/wishlistActions');
const { upsertCartItem, getUserCart, mergeCart, CartLimitError } = await import('@/lib/cart');
const { upsertAbandonedCart, markCartOptedOut, findAbandonedCartByRecoveryToken, getCartsFor24hEmail, getCartsFor72hEmail, refreshAbandonedCartItems } = await import('@/lib/abandoned-cart');
const { enqueueAbandonedReminder, enqueueRestockNotifications, enqueuePendingRestockNotifications, enqueueReviewRequest, processEmailDeliveries, reviewRequestCandidateIds } = await import('@/lib/email-delivery');
const { reminderToken, encryptEmailPayload } = await import('@/lib/email-payload');
const { reserveReviewPhotoUpload, claimReviewPhotos, reviewPhotoPrefix, ReviewPhotoError, deleteReviewPhotosFromR2, purgeOrphanReviewPhotos } = await import('@/lib/review-photo-assets');
const { queueTransactionalEmails } = await import('@/lib/email-outbox-context');
const { sendPasswordResetEmail, sendShippingEmail, sendPaymentValidatedEmail } = await import('@/lib/resend');
const { R2_PUBLIC_BASE_URL } = await import('@/lib/r2');
const { purgeOrphanProductAssets } = await import('@/lib/orphan-uploads');

const prefix = `audit_sec_${randomUUID().slice(0, 8)}`;
const email = `${prefix}@example.test`;
const products = Array.from({ length: 130 }, (_, i) => ({ id: `${prefix}_p${i}`, name: `Isolated fixture ${i}`, slug: `${prefix}-p${i}`, category: 'Isolated audit fixture', images: [], price: 10, stock: 3 }));
const HOUR = 60 * 60_000;
let userId = '';

async function cleanupOwnedFixtures() {
  const videos = await prisma.videoJob.findMany({ where: { videoUrl: { contains: prefix } }, select: { videoUrl: true, posterUrl: true } });
  const photos = await prisma.reviewPhotoUpload.findMany({ where: { userId }, select: { url: true } });
  const assetKeys = [...photos.map(photo => `deleted_review_asset:${createHash('sha256').update(photo.url).digest('hex')}`), ...videos.flatMap(video => [video.videoUrl, ...(video.posterUrl ? [video.posterUrl] : [])]).map(url => `deleted_product_asset:${createHash('sha256').update(url).digest('hex')}`)];
  if (assetKeys.length) await prisma.appConfig.deleteMany({ where: { key: { in: assetKeys } } });
  await prisma.review.deleteMany({ where: { userId } });
  await prisma.reviewPhotoUpload.deleteMany({ where: { userId } });
  await prisma.videoJob.deleteMany({ where: { videoUrl: { contains: prefix } } });
  const jobs = await prisma.emailDelivery.findMany({ where: { recipient: { startsWith: prefix } }, select: { payload: true } });
  const codes = jobs.flatMap(j => {
    const payload = j.payload as { coupon?: { code?: string } };
    return payload.coupon?.code ? [payload.coupon.code] : [];
  });
  if (codes.length) await prisma.coupon.deleteMany({ where: { code: { in: codes } } });
  await prisma.emailDelivery.deleteMany({ where: { recipient: { startsWith: prefix } } });
  await prisma.restockSubscription.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.abandonedCart.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.cartReminderPreference.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.orderItem.deleteMany({ where: { order: { customerId: userId } } });
  await prisma.order.deleteMany({ where: { customerId: userId } });
  await prisma.wishlistItem.deleteMany({ where: { userId } });
  await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  await prisma.cart.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
}

beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  if (target.hostname !== '127.0.0.1' || target.port !== '55439' || target.pathname !== '/limpio_audit_test') throw new Error('Refusing a database outside the isolated audit fixture');
  const user = await prisma.user.create({ data: { email, password: 'fixture-with-no-login', role: 'CLIENT' } });
  userId = user.id; m.userId = userId;
  await prisma.product.createMany({ data: products });
});
beforeEach(async () => {
  await cleanupOwnedFixtures();
  await prisma.product.updateMany({ where: { id: { in: products.map(p => p.id) } }, data: { isActive: true, stock: 3, images: [] } });
  vi.clearAllMocks();
  m.restock.mockResolvedValue({ accepted: true, providerMessageId: 'mock-restock-acceptance' });
  m.abandoned.mockResolvedValue({ accepted: true, providerMessageId: 'mock-abandoned-acceptance' });
  m.review.mockResolvedValue({ accepted: true, providerMessageId: 'mock-review-acceptance' });
  m.transactional.mockResolvedValue({ accepted: true, providerMessageId: 'mock-transactional-acceptance' });
  m.deleteR2.mockResolvedValue(undefined);
});
afterAll(async () => {
  if (userId) {
    await cleanupOwnedFixtures();
    await prisma.user.delete({ where: { id: userId } });
    await prisma.product.deleteMany({ where: { id: { in: products.map(p => p.id) } } });
  }
  await prisma.$disconnect();
  await globalThis.prismaRuntime?.pool.end();
});

async function restockJob() {
  const subscription = await prisma.restockSubscription.create({ data: { email, productId: products[0].id } });
  await enqueueRestockNotifications(products[0].id);
  const job = await prisma.emailDelivery.findUniqueOrThrow({ where: { dedupKey: `RESTOCK:${subscription.id}:0` } });
  return { subscription, job };
}
async function abandonedFixture() {
  const snapshot = { items: [{ id: products[0].id, name: products[0].name, slug: products[0].slug, price: 10, quantity: 1, image: null }], totalUsd: 10 };
  await upsertAbandonedCart({ email, userId, ...snapshot });
  const cart = await prisma.abandonedCart.findFirstOrThrow({ where: { email } });
  await prisma.abandonedCart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date(Date.now() - 96 * HOUR) } });
  return { cart, snapshot };
}

describe('Real PostgreSQL concurrency with isolated fixtures and mocked external services', () => {
  it.each(['24h', '72h'] as const)('selects abandoned cart 101 for the %s wave after 100 existing reviewed jobs', async wave => {
    const lastActivityAt = new Date(Date.now() - 96 * HOUR);
    const carts = Array.from({ length: 101 }, (_, i) => ({ id: `${prefix}-cart-${i.toString().padStart(3, '0')}`, email: `${prefix}+cart${i}@example.test`, userId, items: [], totalUsd: 10, status: wave === '24h' ? 'PENDING' : 'EMAILED_24H', lastActivityAt, emailSentAt: wave === '24h' ? null : new Date(Date.now() - 49 * HOUR), recoveryTokenHash: createHash('sha256').update(`${prefix}-${wave}-${i}`).digest('hex') }));
    await prisma.abandonedCart.createMany({ data: carts });
    const kind = wave === '24h' ? 'ABANDONED_24H' : 'ABANDONED_72H';
    await prisma.emailDelivery.createMany({ data: carts.slice(0, 100).map(cart => ({ kind, dedupKey: `${kind}:${cart.id}:${lastActivityAt.toISOString()}`, resourceId: cart.id, recipient: cart.email, status: 'REVIEW', payload: { activityAt: lastActivityAt.toISOString() } })) });
    const candidates = wave === '24h' ? await getCartsFor24hEmail() : await getCartsFor72hEmail();
    expect(candidates.map(cart => cart.id)).toContain(carts[100].id);
    expect(candidates.some(candidate => carts.slice(0, 100).some(cart => cart.id === candidate.id))).toBe(false);
    expect(m.abandoned).not.toHaveBeenCalled();
  });
  it('allows a renewed cart activity to create a new reminder without repeating the prior snapshot', async () => {
    const { cart, snapshot } = await abandonedFixture();
    await enqueueAbandonedReminder(cart.id, '24h', snapshot);
    await prisma.emailDelivery.updateMany({ where: { recipient: email }, data: { status: 'REVIEW' } });
    expect((await getCartsFor24hEmail()).map(candidate => candidate.id)).not.toContain(cart.id);
    await prisma.abandonedCart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date(Date.now() - 85 * HOUR) } });
    expect((await getCartsFor24hEmail()).map(candidate => candidate.id)).toContain(cart.id);
    await enqueueAbandonedReminder(cart.id, '24h', snapshot);
    expect(await prisma.emailDelivery.count({ where: { recipient: email } })).toBe(2);
    expect(m.abandoned).not.toHaveBeenCalled();
  });
  it('queues subscriber 101 while 100 earlier subscribers await reconciliation', async () => {
    const subscriptions = Array.from({ length: 101 }, (_, i) => ({ id: `${prefix}-subscriber-${i.toString().padStart(3, '0')}`, email: `${prefix}+${i}@example.test`, productId: products[0].id, createdAt: new Date(i * 1000) }));
    await prisma.restockSubscription.createMany({ data: subscriptions });
    await prisma.emailDelivery.createMany({ data: subscriptions.slice(0, 100).map(sub => ({ kind: 'RESTOCK', dedupKey: `RESTOCK:${sub.id}:0`, resourceId: sub.id, recipient: sub.email, status: 'REVIEW', payload: {} })) });
    await enqueueRestockNotifications(products[0].id);
    expect(await prisma.emailDelivery.count({ where: { recipient: { startsWith: prefix } } })).toBe(101);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { dedupKey: `RESTOCK:${subscriptions[100].id}:0` } })).status).toBe('PENDING');
    expect(m.restock).not.toHaveBeenCalled();
  });
  it('queues product 11 when ten prior products only have existing delivery jobs', async () => {
    const subscriptions = products.slice(0, 11).map((product, i) => ({ id: `${prefix}-product-sub-${i}`, email, productId: product.id }));
    await prisma.restockSubscription.createMany({ data: subscriptions });
    await prisma.emailDelivery.createMany({ data: subscriptions.slice(0, 10).map(sub => ({ kind: 'RESTOCK', dedupKey: `RESTOCK:${sub.id}:0`, resourceId: sub.id, recipient: email, status: 'REVIEW', payload: {} })) });
    await enqueuePendingRestockNotifications();
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { dedupKey: `RESTOCK:${subscriptions[10].id}:0` } })).status).toBe('PENDING');
    expect(m.restock).not.toHaveBeenCalled();
  });
  it('allows a new subscription generation while its prior job remains in review', async () => {
    const subscription = await prisma.restockSubscription.create({ data: { email, productId: products[0].id, generation: 1 } });
    await prisma.emailDelivery.create({ data: { kind: 'RESTOCK', dedupKey: `RESTOCK:${subscription.id}:0`, resourceId: subscription.id, recipient: email, status: 'REVIEW', payload: {} } });
    await enqueueRestockNotifications(products[0].id);
    expect(await prisma.emailDelivery.count({ where: { recipient: email } })).toBe(2);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { dedupKey: `RESTOCK:${subscription.id}:1` } })).status).toBe('PENDING');
  });
  it('selects request 26 without letting 25 reviewed requests or unreviewable orders occupy the batch', async () => {
    const deliveredAt = new Date(Date.now() - 10 * 24 * HOUR);
    const ids: string[] = [];
    for (let i = 0; i < 27; i++) {
      const order = await prisma.order.create({ data: { customerId: userId, customerName: 'Fixture', customerEmail: email, total: 10, status: 'Entregado', deliveredAt, paidAt: deliveredAt, paymentMethod: 'Fixture', shippingAddress: 'Fixture', shippingCity: 'Fixture', shippingState: 'Fixture', stockDeducted: false, ...(i < 26 ? { items: { create: { productId: products[0].id, productName: 'Fixture', quantity: 1, price: 10 } } } : {}) } });
      ids.push(order.id);
    }
    await prisma.emailDelivery.createMany({ data: ids.slice(0, 25).map(id => ({ kind: 'REVIEW_REQUEST', dedupKey: `REVIEW_REQUEST:${id}`, resourceId: id, recipient: email, status: 'REVIEW', payload: {} })) });
    const candidates = await reviewRequestCandidateIds(new Date(Date.now() - 30 * 24 * HOUR), new Date(Date.now() - 7 * 24 * HOUR), 25);
    expect(candidates).toContain(ids[25]);
    expect(candidates).not.toContain(ids[26]);
    expect(candidates.some(id => ids.slice(0, 25).includes(id))).toBe(false);
    expect(m.review).not.toHaveBeenCalled();
  });
  it('uses a linked customer email for legacy orders and cancels changed shipping details', async () => {
    const order = await prisma.order.create({ data: { customerId: userId, customerName: 'Fixture', customerEmail: null, total: 10, status: 'Enviado', paidAt: new Date(), paymentMethod: 'Fixture', shippingAddress: 'Fixture', shippingCity: 'Fixture', shippingState: 'Fixture', stockDeducted: false, trackingNumber: 'fixture-tracking', trackingCarrier: 'Carrier A', trackingUrl: 'https://example.test/carrier-a' } });
    await prisma.$transaction(tx => queueTransactionalEmails(tx, () => sendShippingEmail(email, 'Fixture', 'fixture-tracking', { orderId: String(order.orderNumber), carrier: order.trackingCarrier, trackingUrl: order.trackingUrl })));
    const job = await prisma.emailDelivery.findFirstOrThrow({ where: { recipient: email } });
    expect((await processEmailDeliveries(['TRANSACTIONAL'], 1, job.id)).accepted.TRANSACTIONAL).toBe(1);
    await prisma.order.update({ where: { id: order.id }, data: { trackingCarrier: 'Carrier B', trackingUrl: 'https://example.test/carrier-b' } });
    await prisma.$transaction(tx => queueTransactionalEmails(tx, () => sendShippingEmail(email, 'Fixture', 'fixture-tracking', { orderId: String(order.orderNumber), carrier: 'Carrier B', trackingUrl: 'https://example.test/carrier-b' })));
    const pending = await prisma.emailDelivery.findFirstOrThrow({ where: { recipient: email, status: 'PENDING' } });
    await prisma.order.update({ where: { id: order.id }, data: { trackingCarrier: 'Carrier C' } });
    const calls = m.transactional.mock.calls.length;
    await processEmailDeliveries(['TRANSACTIONAL'], 1, pending.id);
    expect(m.transactional).toHaveBeenCalledTimes(calls);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELED');
  });
  it('does not deliver an old payment-confirmed message after the order is canceled', async () => {
    const order = await prisma.order.create({ data: { customerId: userId, customerName: 'Fixture', customerEmail: email, total: 10, status: 'En Proceso', paidAt: new Date(), paymentMethod: 'Fixture', shippingAddress: 'Fixture', shippingCity: 'Fixture', shippingState: 'Fixture', stockDeducted: false } });
    await prisma.$transaction(tx => queueTransactionalEmails(tx, () => sendPaymentValidatedEmail(email, 'Fixture', String(order.orderNumber), order.id)));
    const job = await prisma.emailDelivery.findFirstOrThrow({ where: { recipient: email } });
    await prisma.order.update({ where: { id: order.id }, data: { status: 'Cancelado' } });
    await processEmailDeliveries(['TRANSACTIONAL'], 1, job.id);
    expect(m.transactional).not.toHaveBeenCalled();
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('CANCELED');
  });
  it('stops a slow-provider batch within the 90 second dispatch budget', async () => {
    await prisma.restockSubscription.createMany({ data: products.slice(0, 20).map(product => ({ email, productId: product.id })) });
    const subscriptions = await prisma.restockSubscription.findMany({ where: { email } });
    await prisma.emailDelivery.createMany({ data: subscriptions.map(subscription => ({ kind: 'RESTOCK', dedupKey: `RESTOCK:${subscription.id}:0`, resourceId: subscription.id, recipient: email, payload: { generation: 0, productId: subscription.productId, productName: 'Fixture', productPrice: '10', productUrl: 'https://example.test/product' } })) });
    const originalFind = prisma.emailDelivery.findMany.bind(prisma.emailDelivery);
    const scoped = vi.spyOn(prisma.emailDelivery, 'findMany').mockImplementation(args => originalFind({ ...args, where: { AND: [args?.where ?? {}, { recipient: email }] } }) as ReturnType<typeof prisma.emailDelivery.findMany>);
    let simulatedNow = Date.now();
    const initial = simulatedNow;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => simulatedNow);
    m.restock.mockImplementation(async () => { simulatedNow += 10_000; return { accepted: false, reason: 'provider_error' }; });
    try {
      await processEmailDeliveries(undefined, 50);
      expect(m.restock.mock.calls.length).toBeGreaterThan(0);
      expect(m.restock.mock.calls.length).toBeLessThan(20);
      expect(simulatedNow - initial).toBeLessThanOrEqual(90_000);
      expect(await prisma.emailDelivery.count({ where: { recipient: email, attempts: 0, status: 'PENDING' } })).toBeGreaterThan(0);
    } finally { clock.mockRestore(); scoped.mockRestore(); }
  });
  it('does not let 25 referenced videos starve the next orphan forever', async () => {
    const jobs = Array.from({ length: 26 }, (_, i) => ({ id: `${prefix}-video-${i}`, videoUrl: `${R2_PUBLIC_BASE_URL}/products/${prefix}-video-${i}.mp4`, posterUrl: `${R2_PUBLIC_BASE_URL}/products/${prefix}-poster-${i}.webp`, status: 'READY', uploadedById: userId, updatedAt: new Date(i * 1000) }));
    await prisma.videoJob.createMany({ data: jobs });
    await prisma.product.update({ where: { id: products[0].id }, data: { images: jobs.slice(0, 25).map(job => job.videoUrl) } });
    const originalFind = prisma.videoJob.findMany.bind(prisma.videoJob);
    const scoped = vi.spyOn(prisma.videoJob, 'findMany').mockImplementation(args => originalFind({ ...args, where: { AND: [args?.where ?? {}, { videoUrl: { contains: prefix } }] } }) as ReturnType<typeof prisma.videoJob.findMany>);
    try {
      const first = await purgeOrphanProductAssets();
      expect(first.deleted).toBe(0);
      const second = await purgeOrphanProductAssets();
      expect(second.deleted).toBe(1);
      expect((await prisma.videoJob.findUniqueOrThrow({ where: { id: jobs[25].id } })).status).toBe('DELETED');
      expect(m.deleteR2).toHaveBeenCalledTimes(2);
      expect(await prisma.videoJob.count({ where: { id: { in: jobs.slice(0, 25).map(job => job.id) }, status: 'READY' } })).toBe(25);
    } finally { scoped.mockRestore(); }
  });
  const newPhoto = (suffix: string) => {
    const key = `${reviewPhotoPrefix(userId)}${prefix}-${suffix}.webp`;
    return { key, url: `${R2_PUBLIC_BASE_URL}/${key}` };
  };
  it('admits only eight pending review uploads under simultaneous reservations', async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => {
      const photo = newPhoto(`concurrent-${i}`);
      return reserveReviewPhotoUpload(userId, photo.url, photo.key);
    }));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(8);
    expect(results.filter(r => r.status === 'rejected' && r.reason instanceof ReviewPhotoError)).toHaveLength(4);
    expect(await prisma.reviewPhotoUpload.count({ where: { userId } })).toBe(8);
  });
  it('keeps a linked photo in R2 and forbids linking it again after retirement', async () => {
    const photo = newPhoto('linked');
    const upload = await reserveReviewPhotoUpload(userId, photo.url, photo.key);
    await prisma.reviewPhotoUpload.update({ where: { id: upload.id }, data: { status: 'READY' } });
    const review = await prisma.$transaction(async tx => {
      await claimReviewPhotos(tx, [photo.url], userId);
      return tx.review.create({ data: { productId: products[0].id, userId, authorName: 'Fixture', rating: 5, comment: 'Fixture review', photos: [photo.url] } });
    });
    await deleteReviewPhotosFromR2([photo.url], userId);
    expect(m.deleteR2).not.toHaveBeenCalled();
    await prisma.review.delete({ where: { id: review.id } });
    await deleteReviewPhotosFromR2([photo.url], userId);
    expect(m.deleteR2).toHaveBeenCalledWith(photo.key);
    expect((await prisma.reviewPhotoUpload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe('DELETED');
    await expect(prisma.$transaction(tx => claimReviewPhotos(tx, [photo.url], userId))).rejects.toThrow(ReviewPhotoError);
  });
  it('retries durable photo retirement after storage failure', async () => {
    const photo = newPhoto('retry');
    const upload = await reserveReviewPhotoUpload(userId, photo.url, photo.key);
    await prisma.reviewPhotoUpload.update({ where: { id: upload.id }, data: { status: 'READY', expiresAt: new Date(0) } });
    m.deleteR2.mockRejectedValueOnce(new Error('mock storage unavailable'));
    await deleteReviewPhotosFromR2([photo.url], userId);
    expect((await prisma.reviewPhotoUpload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe('DELETING');
    await prisma.reviewPhotoUpload.update({ where: { id: upload.id }, data: { updatedAt: new Date(0) } });
    await purgeOrphanReviewPhotos();
    expect((await prisma.reviewPhotoUpload.findUniqueOrThrow({ where: { id: upload.id } })).status).toBe('DELETED');
    expect(m.deleteR2).toHaveBeenCalledTimes(2);
  });
  it('commits a reset token and encrypted outbox together, or rolls back both', async () => {
    const token = `${prefix}-reset`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + HOUR);
    await expect(prisma.$transaction(async tx => {
      await tx.passwordResetToken.create({ data: { token: tokenHash, userId, expiresAt } });
      await queueTransactionalEmails(tx, () => sendPasswordResetEmail(email, token, expiresAt));
      throw new Error('mock business rollback');
    })).rejects.toThrow('mock business rollback');
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(0);
    expect(await prisma.emailDelivery.count({ where: { recipient: email } })).toBe(0);
    await prisma.$transaction(async tx => {
      await tx.passwordResetToken.create({ data: { token: tokenHash, userId, expiresAt } });
      await queueTransactionalEmails(tx, () => sendPasswordResetEmail(email, token, expiresAt));
    });
    const job = await prisma.emailDelivery.findFirstOrThrow({ where: { recipient: email } });
    expect(job.providerPayload).not.toContain(token);
    expect(job.tokenExpiresAt).toEqual(expiresAt);
    expect(m.transactional).not.toHaveBeenCalled();
    expect((await processEmailDeliveries(['TRANSACTIONAL'], 1, job.id)).accepted.TRANSACTIONAL).toBe(1);
  });
  it('routes invalid encrypted payloads to manual reconciliation without endless retries', async () => {
    const job = await prisma.emailDelivery.create({ data: { dedupKey: prefix + '-invalid', kind: 'TRANSACTIONAL', resourceId: 'fixture', recipient: email, payload: {}, providerPayload: 'corrupted' } });
    m.transactional.mockResolvedValueOnce({ accepted: false, reason: 'invalid' });
    expect((await processEmailDeliveries(['TRANSACTIONAL'], 1, job.id)).review).toBe(1);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('REVIEW');
  });
  it('keeps a wishlist at 100 when a large guest list joins an existing account', async () => {
    await prisma.wishlistItem.createMany({ data: products.slice(0, 75).map(p => ({ userId, productId: p.id })) });
    const result = await mergeWishlistAction(products.slice(25, 125).map(p => p.id));
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.items).toHaveLength(100); expect(result.unmergedIds).toHaveLength(25); }
    expect(await prisma.wishlistItem.count({ where: { userId } })).toBe(100);
  });
  it('admits exactly one of three concurrent additions when 99 favourites already exist', async () => {
    await prisma.wishlistItem.createMany({ data: products.slice(0, 99).map(p => ({ userId, productId: p.id })) });
    const results = await Promise.all(products.slice(99, 102).map(p => addWishlistItemAction(p.id)));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok && r.code === 'LIMIT')).toHaveLength(2);
    expect(await prisma.wishlistItem.count({ where: { userId } })).toBe(100);
  });
  it('caps 30 simultaneous distinct cart additions at 25 stored lines', async () => {
    const results = await Promise.allSettled(products.slice(0, 30).map(p => upsertCartItem(userId, p.id, 1)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(25);
    const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    expect(failures).toHaveLength(5);
    expect(failures.every(r => r.reason instanceof CartLimitError)).toBe(true);
    expect(await prisma.cartItem.count({ where: { cart: { userId } } })).toBe(25);
  });
  it('omits inactive products and clamps old quantities while merging the cart', async () => {
    await upsertCartItem(userId, products[0].id, 2);
    await upsertCartItem(userId, products[1].id, 2);
    await prisma.product.update({ where: { id: products[1].id }, data: { isActive: false } });
    expect((await getUserCart(userId)).map(i => i.productId)).toEqual([products[0].id]);
    const result = await mergeCart(userId, [{ productId: products[0].id, quantity: 100 }, { productId: products[1].id, quantity: 3 }]);
    expect(result).toHaveLength(1); expect(result[0].quantity).toBe(3);
    expect(await prisma.cartItem.count({ where: { cart: { userId } } })).toBe(1);
  });
  it('serializes concurrent abandoned snapshots into one active cart', async () => {
    const snapshot = { email, userId, items: [{ id: products[0].id, name: 'Fixture', price: 10, quantity: 1, slug: products[0].slug, image: null }], totalUsd: 10 };
    await Promise.all(Array.from({ length: 8 }, () => upsertAbandonedCart(snapshot)));
    expect(await prisma.abandonedCart.count({ where: { email } })).toBe(1);
  });
  it('does not mark a rejected restock send as notified and later retries it', async () => {
    const { subscription, job } = await restockJob();
    m.restock.mockResolvedValueOnce({ accepted: false, reason: 'provider_error' });
    expect((await processEmailDeliveries(['RESTOCK'], 1, job.id)).failed).toBe(1);
    expect((await prisma.restockSubscription.findUniqueOrThrow({ where: { id: subscription.id } })).notifiedAt).toBeNull();
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('PENDING');
    await prisma.emailDelivery.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    expect((await processEmailDeliveries(['RESTOCK'], 1, job.id)).accepted.RESTOCK).toBe(1);
    expect((await prisma.restockSubscription.findUniqueOrThrow({ where: { id: subscription.id } })).notifiedAt).not.toBeNull();
  });
  it('allows only one of two concurrent workers to send the same pending job', async () => {
    const { job } = await restockJob();
    m.restock.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 30)); return { accepted: true, providerMessageId: 'mock-single-acceptance' }; });
    const results = await Promise.all([processEmailDeliveries(['RESTOCK'], 1, job.id), processEmailDeliveries(['RESTOCK'], 1, job.id)]);
    expect(m.restock).toHaveBeenCalledTimes(1);
    expect(results.reduce((n, r) => n + (r.accepted.RESTOCK || 0), 0)).toBe(1);
  });
  it('recovers a stale processing lease after a worker interruption', async () => {
    const { job } = await restockJob();
    await prisma.emailDelivery.update({ where: { id: job.id }, data: { status: 'PROCESSING', leaseId: 'stale-lease', lockedUntil: new Date(0) } });
    expect((await processEmailDeliveries(['RESTOCK'], 1, job.id)).accepted.RESTOCK).toBe(1);
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('SENT');
  });
  it('requires reconciliation instead of retrying beyond provider idempotency retention', async () => {
    const { job } = await restockJob();
    await prisma.emailDelivery.update({ where: { id: job.id }, data: { firstAttemptAt: new Date(Date.now() - 25 * HOUR) } });
    expect((await processEmailDeliveries(['RESTOCK'], 1, job.id)).review).toBe(1);
    expect(m.restock).not.toHaveBeenCalled();
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('REVIEW');
  });
  it('keeps both recovery waves valid and keeps opting out durable across new snapshots', async () => {
    const { cart, snapshot } = await abandonedFixture();
    await enqueueAbandonedReminder(cart.id, '24h', snapshot);
    const first = await prisma.emailDelivery.findFirstOrThrow({ where: { recipient: email, kind: 'ABANDONED_24H' } });
    await processEmailDeliveries(['ABANDONED_24H'], 1, first.id);
    await prisma.abandonedCart.update({ where: { id: cart.id }, data: { emailSentAt: new Date(Date.now() - 49 * HOUR) } });
    await enqueueAbandonedReminder(cart.id, '72h', snapshot);
    const second = await prisma.emailDelivery.findFirstOrThrow({ where: { recipient: email, kind: 'ABANDONED_72H' } });
    await processEmailDeliveries(['ABANDONED_72H'], 1, second.id);
    expect(await findAbandonedCartByRecoveryToken(reminderToken(first.id, 'recovery'))).not.toBeNull();
    expect(await findAbandonedCartByRecoveryToken(reminderToken(second.id, 'recovery'))).not.toBeNull();
    const preference = await prisma.cartReminderPreference.findUniqueOrThrow({ where: { email } });
    expect(await markCartOptedOut(reminderToken(preference.id, 'unsubscribe'))).toBe(true);
    await upsertAbandonedCart({ email, userId, ...snapshot });
    expect(await prisma.abandonedCart.count({ where: { email } })).toBe(1);
    expect((await prisma.abandonedCart.findUniqueOrThrow({ where: { id: cart.id } })).status).toBe('OPTED_OUT');
    expect(await findAbandonedCartByRecoveryToken(reminderToken(first.id, 'recovery'))).toBeNull();
  });
  it('requires 72 hours of real inactivity even if the first email is older than 48 hours', async () => {
    const { cart } = await abandonedFixture();
    await prisma.abandonedCart.update({ where: { id: cart.id }, data: { status: 'EMAILED_24H', emailSentAt: new Date(Date.now() - 49 * HOUR), lastActivityAt: new Date() } });
    expect((await getCartsFor72hEmail()).some(c => c.id === cart.id)).toBe(false);
  });
  it('excludes deactivated products from reminder snapshots', async () => {
    const { snapshot } = await abandonedFixture();
    await prisma.product.update({ where: { id: products[0].id }, data: { isActive: false } });
    expect(await refreshAbandonedCartItems(snapshot.items)).toBeNull();
  });
  it('marks review requests only after actual provider acceptance', async () => {
    const order = await prisma.order.create({ data: { customerId: userId, customerName: 'Isolated fixture', customerEmail: email, total: 10, status: 'Entregado', paidAt: new Date(), paymentMethod: 'Fixture', shippingAddress: 'Fixture', shippingCity: 'Fixture', shippingState: 'Fixture', stockDeducted: false } });
    await enqueueReviewRequest(order.id, email, { customerName: 'Fixture', products: [{ name: 'Fixture', reviewUrl: `https://example.test/product/${products[0].slug}` }] });
    const job = await prisma.emailDelivery.findUniqueOrThrow({ where: { dedupKey: `REVIEW_REQUEST:${order.id}` } });
    m.review.mockResolvedValueOnce({ accepted: false, reason: 'unconfigured' });
    await processEmailDeliveries(['REVIEW_REQUEST'], 1, job.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).reviewRequestSentAt).toBeNull();
    await prisma.emailDelivery.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    await processEmailDeliveries(['REVIEW_REQUEST'], 1, job.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).reviewRequestSentAt).not.toBeNull();
  });
  it('cancels queued reset emails after their original token expired', async () => {
    const tokenHash = createHash('sha256').update('isolated-expired-reset-token').digest('hex');
    await prisma.passwordResetToken.create({ data: { userId, token: tokenHash, expiresAt: new Date(0) } });
    const job = await prisma.emailDelivery.create({ data: { dedupKey: `${prefix}:expired-reset`, kind: 'TRANSACTIONAL', recipient: email, resourceId: 'password-reset-email', tokenExpiresAt: new Date(Date.now() + HOUR), payload: { tokenType: 'PASSWORD_RESET', tokenHash }, providerPayload: encryptEmailPayload({ from: 'fixture@example.test', to: email, subject: 'Fixture', text: 'Fixture' }) } });
    await processEmailDeliveries(['TRANSACTIONAL'], 1, job.id);
    expect(m.transactional).not.toHaveBeenCalled();
    expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('CANCELED');
  });
});
