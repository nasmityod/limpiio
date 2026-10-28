import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ reviews: vi.fn(), products: vi.fn(), stale: vi.fn() }));
vi.mock('@/lib/review-photo-assets', () => ({ purgeOrphanReviewPhotos: m.reviews }));
vi.mock('@/lib/orphan-uploads', () => ({ purgeOrphanProductAssets: m.products, markStaleVideoJobsFailed: m.stale }));
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn() }));
const { GET } = await import('@/app/api/cron/purge-orphan-uploads/route');
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'isolated-cron-secret');
  m.reviews.mockResolvedValue({ checked: 1, deleted: 1, failed: 0 });
  m.products.mockResolvedValue({ checked: 1, deleted: 1, failed: 0 });
  m.stale.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());
describe('Orphan cleanup authorization and read-only preview', () => {
  it('requires the bearer secret and rejects spoofed platform headers', async () => {
    const response = await GET(new Request('http://localhost/api/cron/purge-orphan-uploads', { headers: { 'x-vercel-cron': '1', authorization: 'Bearer wrong' } }));
    expect(response.status).toBe(401);
    expect(m.products).not.toHaveBeenCalled();
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(new Request('http://localhost/api/cron/purge-orphan-uploads'))).status).toBe(503);
  });
  it('does not mark processing jobs as failed during dryRun', async () => {
    const response = await GET(new Request('http://localhost/api/cron/purge-orphan-uploads?dryRun=1', { headers: { authorization: 'Bearer isolated-cron-secret' } }));
    expect(response.status).toBe(200);
    expect(m.stale).not.toHaveBeenCalled();
    expect(m.products).toHaveBeenCalledWith(true, expect.any(Number));
    expect(m.reviews).toHaveBeenCalledWith(true, expect.any(Number));
  });
  it('reports provider failures to the cron runner', async () => {
    m.products.mockResolvedValue({ checked: 1, deleted: 0, failed: 1 });
    const response = await GET(new Request('http://localhost/api/cron/purge-orphan-uploads', { headers: { authorization: 'Bearer isolated-cron-secret' } }));
    expect(response.status).toBe(502);
    expect((await response.json()).ok).toBe(false);
  });
});
