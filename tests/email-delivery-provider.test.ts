import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
type DeliveryFixture = { id?: string; providerPayload: string | null; firstAttemptAt: Date | null; acceptedAt?: Date | null; providerMessageId?: string | null; payload?: { tokenType?: string; tokenHash?: string }; tokenExpiresAt?: Date };

const m = vi.hoisted(() => ({ send: vi.fn(), process: vi.fn(), upsert: vi.fn(), update: vi.fn(), find: vi.fn(), row: { providerPayload: null, firstAttemptAt: null } as DeliveryFixture }));
vi.mock('resend', () => ({ Resend: class { emails = { send: m.send }; } }));
vi.mock('@/lib/e2e-mode', () => ({ isE2eMode: () => false }));
vi.mock('@/lib/prisma', () => ({ prisma: { emailDelivery: { upsert: m.upsert, updateMany: m.update, findUniqueOrThrow: m.find } } }));
vi.mock('@/lib/email-delivery', () => ({ processEmailDeliveries: m.process }));
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }));

const { encryptEmailPayload, decryptEmailPayload, reminderToken } = await import('@/lib/email-payload');
const { sendStoredBrandedEmail, sendReviewRequestEmail, sendWelcomeEmail, sendPasswordResetEmail, sendOrderConfirmationEmailResult } = await import('@/lib/resend');
import type { OrderConfirmationPayload } from '@/lib/resend';
const { queueTransactionalEmails } = await import('@/lib/email-outbox-context');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('EMAIL_DELIVERY_SECRET', 'isolated-email-payload-test-secret-32');
  m.process.mockResolvedValue({ accepted: {}, failed: 1 });
  m.upsert.mockImplementation(async ({ create }: { create: DeliveryFixture }) => { m.row = { ...create, id: 'delivery-1', firstAttemptAt: null, acceptedAt: null, providerMessageId: null }; return m.row; });
  m.find.mockImplementation(async () => m.row);
  m.update.mockImplementation(async ({ where, data }: { where: { providerPayload?: null; firstAttemptAt?: null }; data: Partial<DeliveryFixture> }) => {
    if (where.providerPayload === null && m.row.providerPayload) return { count: 0 };
    if (where.firstAttemptAt === null && m.row.firstAttemptAt) return { count: 0 };
    Object.assign(m.row, data); return { count: 1 };
  });
  m.send.mockResolvedValue({ data: { id: 'mock-provider-accepted-id' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe('Provider acceptance and stable encrypted retry payloads', () => {
  it('encrypts recovery links and rejects a modified ciphertext', () => {
    const raw = { html: '<a href="https://example.test/reset#token=private-token">Reset</a>' };
    const encrypted = encryptEmailPayload(raw);
    expect(encrypted).not.toContain('private-token');
    expect(decryptEmailPayload(encrypted)).toEqual(raw);
    const parts = encrypted.split('.');
    parts[1] = Buffer.alloc(16).toString('base64url');
    expect(() => decryptEmailPayload(parts.join('.'))).toThrow();
    expect(reminderToken('same-id', 'recovery')).not.toBe(reminderToken('same-id', 'unsubscribe'));
  });
  it('retries the exact body and provider key without generating a new token', async () => {
    const payload = { from: 'Store <fixture@example.test>', to: 'buyer@example.test', subject: 'Reset', html: '<a href="https://example.test/reset#token=stable-secret">Reset</a>', text: 'stable-secret' };
    m.row = { providerPayload: encryptEmailPayload(payload), firstAttemptAt: null };
    m.send.mockRejectedValueOnce(new Error('mock timeout'));
    expect(await sendStoredBrandedEmail('delivery-1')).toEqual({ accepted: false, reason: 'exception' });
    expect(await sendStoredBrandedEmail('delivery-1')).toEqual({ accepted: true, providerMessageId: 'mock-provider-accepted-id' });
    expect(m.send.mock.calls[0][0]).toEqual(m.send.mock.calls[1][0]);
    expect(m.send.mock.calls.map(args => args[1].idempotencyKey)).toEqual(['delivery/delivery-1', 'delivery/delivery-1']);
    expect(m.row.providerPayload).not.toContain('stable-secret');
  });
  it('never reports acceptance for rejection, missing provider id or absent configuration', async () => {
    m.row = { providerPayload: encryptEmailPayload({ from: 'fixture@example.test', to: 'buyer@example.test', subject: 'Fixture', text: 'Fixture' }), firstAttemptAt: null };
    m.send.mockResolvedValueOnce({ data: null, error: { name: 'validation_error' } });
    expect((await sendStoredBrandedEmail('delivery-1')).accepted).toBe(false);
    m.send.mockResolvedValueOnce({ data: null, error: null });
    expect((await sendStoredBrandedEmail('delivery-1')).accepted).toBe(false);
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await sendStoredBrandedEmail('delivery-1')).toEqual({ accepted: false, reason: 'unconfigured' });
    expect(m.send).toHaveBeenCalledTimes(2);
  });
  it('propagates provider rejection to the review-request boolean contract', async () => {
    m.row = { providerPayload: null, firstAttemptAt: null };
    m.send.mockResolvedValue({ data: null, error: { name: 'provider_rejected' } });
    expect(await sendReviewRequestEmail({ email: 'buyer@example.test', customerName: 'Fixture', products: [{ name: 'Fixture product', reviewUrl: 'https://example.test/product/fixture' }], deliveryId: 'delivery-1' })).toBe(false);
  });
  it('persists a transactional email when provider configuration is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await sendWelcomeEmail('buyer@example.test', 'Fixture');
    expect(m.row).toMatchObject({ kind: 'TRANSACTIONAL', resourceId: 'welcome-email', acceptedAt: null });
    expect(m.row.providerPayload).not.toContain('buyer@example.test');
    expect(m.send).not.toHaveBeenCalled();
  });
  it('keeps the reset token encrypted, records only its hash and respects source expiry', async () => {
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await sendPasswordResetEmail('buyer@example.test', 'private-reset-token', expiresAt);
    expect(m.row.payload).toMatchObject({ tokenType: 'PASSWORD_RESET' });
    expect(m.row.payload?.tokenHash).toHaveLength(64);
    expect(m.row.tokenExpiresAt).toEqual(expiresAt);
    expect(m.row.providerPayload).not.toContain('private-reset-token');
    expect(decryptEmailPayload<{ html: string }>(m.row.providerPayload!).html).toContain('private-reset-token');
  });
  it('inserts through the business transaction without provider I/O', async () => {
    const tx = { emailDelivery: { upsert: m.upsert } } as unknown as Prisma.TransactionClient;
    await queueTransactionalEmails(tx, () => sendWelcomeEmail('buyer@example.test', 'Fixture'));
    expect(m.upsert).toHaveBeenCalledTimes(1);
    expect(m.process).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
  it('propagates an outbox insert failure so the business transaction can roll back', async () => {
    const tx = { emailDelivery: { upsert: m.upsert } } as unknown as Prisma.TransactionClient;
    m.upsert.mockRejectedValueOnce(new Error('mock outbox unavailable'));
    await expect(queueTransactionalEmails(tx, () => sendPasswordResetEmail('buyer@example.test', 'secret'))).rejects.toThrow('mock outbox unavailable');
    expect(m.send).not.toHaveBeenCalled();
  });
  it('reports invalid ciphertext without making a provider attempt', async () => {
    m.row = { providerPayload: 'corrupted', firstAttemptAt: null };
    expect(await sendStoredBrandedEmail('delivery-1')).toEqual({ accepted: false, reason: 'invalid' });
    expect(m.send).not.toHaveBeenCalled();
  });
  it('keeps explicit resend events separate and reports durable queueing honestly', async () => {
    const order: OrderConfirmationPayload = { id: 'fixture-order', orderNumber: 123, customerName: 'Fixture', email: 'buyer@example.test', createdAt: new Date('2026-10-04T00:00:00Z'), status: 'Pendiente', paymentMethod: 'Fixture', shippingAddress: 'Fixture address', shippingCity: 'Fixture city', shippingState: 'Fixture state', shippingZipCode: '', shippingCountry: 'VE', items: [], subtotalUsd: 10, shippingUsd: 2, totalUsd: 12, exchangeRateUsdBs: null };
    const first = await sendOrderConfirmationEmailResult(order, { requestKey: 'request-1', enqueueOnly: true });
    const second = await sendOrderConfirmationEmailResult(order, { requestKey: 'request-2', enqueueOnly: true });
    expect(first).toEqual({ accepted: false, reason: 'queued', deliveryId: 'delivery-1' });
    expect(second).toEqual(first);
    expect(m.upsert.mock.calls[0][0].where.dedupKey).not.toBe(m.upsert.mock.calls[1][0].where.dedupKey);
    expect(m.process).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
});
