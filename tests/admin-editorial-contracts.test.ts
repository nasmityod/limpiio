import { describe, expect, it, vi } from 'vitest';
import { bannerSchema, bannerToggleSchema, promotionSchema } from '@/lib/editorial-schemas';
import { canonicalPricingFactor, roundUpToStep } from '@/lib/pricing-formula';
import { claimProductMedia } from '@/lib/products/claim-product-media';
import type { Prisma } from '@prisma/client';
import { collectR2AssetUrls, hasProductAssetReferences, claimEditorialAssets } from '@/lib/products/product-asset-references';

describe('editorial create/edit image and field contract', () => {
  it('accepts the same internal image on creation and edition', () => {
    expect(bannerSchema.safeParse({ type: 'hero', imageUrl: '/placeholder-product.png' }).success).toBe(true);
    expect(promotionSchema.safeParse({ title: 'Promo', imageUrl: '/placeholder-product.png' }).success).toBe(true);
  });
  it('rejects a host which the production image optimizer will reject', () => {
    expect(bannerSchema.safeParse({ type: 'hero', imageUrl: 'https://external.example/x.jpg' }).success).toBe(false);
    expect(promotionSchema.safeParse({ title: 'Promo', imageUrl: 'https://external.example/x.jpg' }).success).toBe(false);
  });
  it('toggle cannot overwrite editorial content or introduce defaults', () => {
    expect(bannerToggleSchema.parse({ active: false })).toEqual({ active: false });
    expect(bannerToggleSchema.safeParse({ active: false, title: 'stale' }).success).toBe(false);
  });
});

describe('canonical price factor precision', () => {
  it('legacy 1.234 becomes 1.23, exactly the stored product factor', () => {
    const factor = canonicalPricingFactor(1.234);
    expect(factor).toBe(1.23);
    const first = roundUpToStep(100 * factor / 1.23);
    const second = roundUpToStep(first * factor / 1.23);
    expect(first).toBe(100); expect(second).toBe(first);
  });
});

describe('assets reused by other public content', () => {
  it('collects nested configuration references without treating external URLs as assets', () => {
    vi.stubEnv('NEXT_PUBLIC_R2_PUBLIC_BASE_URL', 'https://cdn.vitest.example');
    expect(collectR2AssetUrls({ image: 'https://cdn.vitest.example/products/a.jpg', nested: ['https://outside.example/a.jpg', 'https://cdn.vitest.example/products/a.jpg'] })).toEqual(['https://cdn.vitest.example/products/a.jpg']);
    vi.unstubAllEnvs();
  });
  it.each(['review', 'category', 'banner', 'promotion', 'appConfig'])('preserves assets referenced in %s', async model => {
    const tx = Object.fromEntries(['product', 'productMedia', 'orderItem', 'review', 'category', 'banner', 'promotion', 'appConfig'].map(key => [key, { findFirst: vi.fn(async () => key === model ? { id: 'reference' } : null) }]));
    expect(await hasProductAssetReferences(tx as unknown as Prisma.TransactionClient, 'https://cdn.vitest.example/products/a.jpg')).toBe(true);
  });
  it('a retired product asset cannot be attached to editorial content', async () => {
    vi.stubEnv('NEXT_PUBLIC_R2_PUBLIC_BASE_URL', 'https://cdn.vitest.example');
    const tx = { $executeRaw: vi.fn(async () => 1), appConfig: { findFirst: vi.fn(async () => ({ key: 'retired' })) } };
    await expect(claimEditorialAssets(tx as unknown as Prisma.TransactionClient, { logoUrl: 'https://cdn.vitest.example/products/a.jpg' })).rejects.toThrow('eliminado');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});

describe('video claims cannot resurrect temporary media', () => {
  const makeTx = (status: string | null, deleted = false) => ({
    $executeRaw: vi.fn(async () => 1),
    appConfig: { findFirst: vi.fn(async () => deleted ? { key: 'retired' } : null) },
    videoJob: { findFirst: vi.fn(async () => status ? { status, posterUrl: 'https://cdn.vitest.example/poster.jpg' } : null) },
    productMedia: { findFirst: vi.fn(async () => null) },
  });
  const slot = { type: 'VIDEO' as const, url: 'https://cdn.vitest.example/video.mp4', posterUrl: 'https://cdn.vitest.example/poster.jpg' };
  it.each(['DELETED', 'DELETING', 'PROCESSING', 'FAILED'])('rejects job %s after obtaining asset locks', async status => {
    const tx = makeTx(status);
    await expect(claimProductMedia(tx as unknown as Prisma.TransactionClient, [slot])).rejects.toThrow();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
  it('ready job must use the canonical poster', async () => {
    const tx = makeTx('READY');
    await expect(claimProductMedia(tx as unknown as Prisma.TransactionClient, [{ ...slot, posterUrl: '/fake.jpg' }])).rejects.toThrow('póster');
  });
  it('blocks a retired image as well as retired videos', async () => {
    await expect(claimProductMedia(makeTx(null, true) as unknown as Prisma.TransactionClient,
      [{ type: 'IMAGE', url: 'https://cdn.vitest.example/image.jpg' }])).rejects.toThrow('eliminado');
  });
});
