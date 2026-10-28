import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { BRAND } from '@/config/brand';

export const SITEMAP_PAGE_SIZE = 10_000;
export type SitemapKind = 'products' | 'categories';
export type SitemapEntry = { url: string; updatedAt?: Date; images?: string[]; priority?: number };
export const SITE_ORIGIN = BRAND.siteUrl.replace(/\/$/, '');

export const getSitemapCounts = unstable_cache(async () => {
  const [products, categories] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.category.count(),
  ]);
  return { products, categories };
}, ['sitemap-counts'], { tags: ['catalog', 'categories'], revalidate: 300 });

export const getSitemapPage = unstable_cache(async (kind: SitemapKind, page: number): Promise<SitemapEntry[]> => {
  const pagination = { take: SITEMAP_PAGE_SIZE, skip: page * SITEMAP_PAGE_SIZE };
  if (kind === 'products') {
    const products = await prisma.product.findMany({
      ...pagination, where: { isActive: true }, orderBy: { id: 'asc' },
      select: { id: true, slug: true, updatedAt: true, images: true },
    });
    return products.map(p => ({ url: `${SITE_ORIGIN}/product/${encodeURIComponent(p.slug || p.id)}`, updatedAt: p.updatedAt, images: p.images, priority: 0.8 }));
  }
  const categories = await prisma.category.findMany({
    ...pagination, orderBy: { id: 'asc' }, select: { slug: true, updatedAt: true, imageUrl: true },
  });
  return categories.map(c => ({ url: `${SITE_ORIGIN}/categoria/${encodeURIComponent(c.slug)}`, updatedAt: c.updatedAt, images: c.imageUrl ? [c.imageUrl] : [], priority: 0.7 }));
}, ['sitemap-page'], { tags: ['catalog', 'categories'], revalidate: 300 });

export function xmlEscape(value: string): string {
  return value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const body = entries.map(entry => {
    const images = (entry.images ?? []).slice(0, 3).flatMap(src => {
      try {
        const url = new URL(src, `${SITE_ORIGIN}/`);
        if (!src || !['https:', 'http:'].includes(url.protocol)) return [];
        return [`<image:image><image:loc>${xmlEscape(url.href)}</image:loc></image:image>`];
      } catch { return []; }
    }).join('');
    return `<url><loc>${xmlEscape(entry.url)}</loc>${entry.updatedAt ? `<lastmod>${entry.updatedAt.toISOString()}</lastmod>` : ''}${entry.priority !== undefined ? `<priority>${entry.priority}</priority>` : ''}${images}</url>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`;
}

export const SITEMAP_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' };
