import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { paymentUpload: { findMany: state.findMany, updateMany: state.updateMany }, appConfig: { upsert: state.upsert } } }));
vi.mock('@/lib/r2', () => ({ deletePrivateProof: state.remove }));
vi.mock('@/lib/security', () => ({ verifyBearerSecret: () => true }));
vi.mock('@/lib/safe-logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));
import { GET } from '@/app/api/cron/purge-payment-uploads/route';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'test'); state.updateMany.mockResolvedValue({ count: 1 }); state.remove.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllEnvs());

describe('durable proof deletion', () => {
  it('picks up a DELETING lease left behind by a crashed worker', async () => {
    const updatedAt = new Date(Date.now() - 10 * 60_000);
    state.findMany.mockResolvedValue([{ id: 'proof-1', status: 'DELETING', objectKey: 'proofs/one.webp', updatedAt }]);
    const result = await GET(new Request('http://localhost/api/cron/purge-payment-uploads'));
    expect((await result.json()).purged).toBe(1);
    expect(state.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: expect.arrayContaining([expect.objectContaining({ status: 'DELETING' })]) } }));
    expect(state.remove).toHaveBeenCalledWith('proofs/one.webp');
    expect(state.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'proof-1', updatedAt }), data: expect.objectContaining({ status: 'DELETING', updatedAt: expect.any(Date) }) }));
  });
  it('preserves the durable deletion task if the bucket rejects deletion and does not report healthy success', async () => {
    state.findMany.mockResolvedValue([{ id: 'proof-1', status: 'DELETING', objectKey: 'proofs/one.webp', updatedAt: new Date(0) }]);
    state.remove.mockRejectedValue(new Error('bucket unavailable'));
    const result = await GET(new Request('http://localhost/api/cron/purge-payment-uploads'));
    expect(await result.json()).toMatchObject({ ok: false, purged: 0, r2Errors: 1 });
    expect(result.status).toBe(503);
    expect(state.updateMany.mock.calls.some(([args]) => args.data.status === 'DELETED')).toBe(false);
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it('does not delete an object when another worker wins the claim', async () => {
    state.findMany.mockResolvedValue([{ id: 'proof-1', status: 'DELETING', objectKey: 'proofs/one.webp', updatedAt: new Date(0) }]);
    state.updateMany.mockResolvedValue({ count: 0 });
    await GET(new Request('http://localhost/api/cron/purge-payment-uploads'));
    expect(state.remove).not.toHaveBeenCalled();
  });
});
