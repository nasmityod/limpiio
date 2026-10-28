import type { Prisma } from '@prisma/client';
import { isR2PublicHttpsUrl } from '@/lib/r2-public-url';
import { claimProductMedia } from './claim-product-media';

export function collectR2AssetUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string') { if (isR2PublicHttpsUrl(item)) urls.add(item); }
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return [...urls].sort();
}

/** Editorial/configuration writers share locks and tombstones with retirement. */
export async function claimEditorialAssets(tx: Prisma.TransactionClient, value: unknown) {
  const urls = collectR2AssetUrls(value);
  if (urls.length) await claimProductMedia(tx, urls.map(url => ({ type: 'IMAGE', url })));
}

/** Preserve assets reused anywhere in persisted public content or order history.
 * AppConfig matching is deliberately conservative: an unused textual reference
 * can retain a file, but retirement markers themselves must not retain it. */
export async function hasProductAssetReferences(tx: Prisma.TransactionClient, url: string): Promise<boolean> {
  const references = await Promise.all([
    tx.product.findFirst({ where: { images: { has: url } }, select: { id: true } }),
    tx.productMedia.findFirst({ where: { OR: [{ url }, { posterUrl: url }] }, select: { id: true } }),
    tx.orderItem.findFirst({ where: { imageUrl: url }, select: { id: true } }),
    tx.review.findFirst({ where: { photos: { has: url } }, select: { id: true } }),
    tx.category.findFirst({ where: { imageUrl: url }, select: { id: true } }),
    tx.banner.findFirst({ where: { imageUrl: url }, select: { id: true } }),
    tx.promotion.findFirst({ where: { imageUrl: url }, select: { id: true } }),
    tx.appConfig.findFirst({ where: { key: { not: { startsWith: 'deleted_product_asset:' } }, value: { contains: url } }, select: { id: true } }),
  ]);
  return references.some(Boolean);
}
