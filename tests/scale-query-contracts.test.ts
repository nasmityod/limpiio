import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), count: vi.fn(), findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: mocks.query, product: { count: mocks.count, findMany: mocks.findMany }, category: { count: mocks.count, findMany: mocks.findMany } } }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { queryCatalogProducts, escapeLikePattern } from '@/lib/products/query-products';
import { getCachedOfferProducts, getCachedCatalogProducts } from '@/lib/catalog-cache';
import { parseProductQuery, hasActiveCatalogFilters } from '@/lib/products/filter';
import { sitemapXml, SITEMAP_PAGE_SIZE } from '@/lib/sitemap-data';

beforeEach(() => vi.clearAllMocks());
it('keeps free shipping in cached catalog cards and selects its authoritative value', async () => {
  mocks.findMany.mockResolvedValueOnce([{ id: 'p', slug: 'p', name: 'Test', description: null, price: 10, originalPrice: null, stock: 2, category: 'Test', brand: null, images: [], freeShipping: true }]);
  const cards = await getCachedCatalogProducts(1);
  expect(cards[0].freeShipping).toBe(true);
  expect(mocks.findMany.mock.calls[0][0].select.freeShipping).toBe(true);
});
it('keeps total when an out-of-range product page has no rows', async () => {
  mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 48n }]);
  const result = await queryCatalogProducts(parseProductQuery({ page: '9000' }));
  expect(result.items).toEqual([]); expect(result.total).toBe(48);
});
it('offers compares price and stock in SQL and fetches only one stable page', async () => {
  mocks.query.mockResolvedValue([]); await getCachedOfferProducts(2);
  const sql = mocks.query.mock.calls[0][0];
  expect(sql.text).toContain('"originalPrice" > price'); expect(sql.text).toContain('stock > 0');
  expect(sql.text).toContain('id DESC'); expect(sql.values).toEqual([24, 24]);
});
it('escapes LIKE wildcards while preserving literal backslashes', () => {
  expect(escapeLikePattern('50%_a\\b')).toBe('50\\%\\_a\\\\b');
});
it('bounds parameters and routes explicit out-of-stock to the filtered query', () => {
  const result = parseProductQuery({ page: '999999999999999999', min: '10junk', disp: 'all', q: 'x'.repeat(200) });
  expect(result.page).toBe(1); expect(result.q?.length).toBe(120); expect(result.minPrice).toBeUndefined();
  expect(hasActiveCatalogFilters(result)).toBe(true);
});
it('sitemap uses absolute images, XML escaping and protocol-sized chunks', () => {
  const xml = sitemapXml([{ url: 'https://example.test/a?x=1&y=2', images: ['/image.jpg', 'javascript:alert(1)', 'https://cdn.test/x?a=1&b=2'] }]);
  expect(xml).toContain('&amp;y=2'); expect(xml).toContain('/image.jpg</image:loc>'); expect(xml).not.toContain('javascript:');
  expect(SITEMAP_PAGE_SIZE).toBeLessThan(50_000);
});
