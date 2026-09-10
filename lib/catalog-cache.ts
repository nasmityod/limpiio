/**
 * Cached Prisma queries for the public catalog and category pages.
 *
 * Strategy
 * ─────────
 * • `unstable_cache` wraps every heavy read so repeated requests for the same
 *   page/category hit the Next.js Data Cache instead of Postgres.
 * • Two tags drive on-demand invalidation:
 *     'catalog'    — product data (counts, slices, category counts in sidebar).
 *                    Invalidated by any product mutation (create/update/delete/
 *                    stock/price/isActive/CSV import).
 *     'categories' — category records (name, slug, image, SEO fields).
 *                    Invalidated by any category mutation (POST/PUT/DELETE on
 *                    /api/categories and its [id] sub-route).
 *   getCachedServerCategories uses BOTH tags because it joins category records
 *   with per-category product counts.
 * • REVALIDATE (600 s) is a TTL safety net only; tags fire immediately on
 *   mutation so stale data is never served beyond the write latency.
 * • Filtros/búsqueda en /productos usan lib/products/query-products.ts (pg_trgm).
 *   El catálogo sin filtros sigue en caché vía unstable_cache.
 * • Admin reads (getProductsAdmin, getProductsAdmin) bypass this cache entirely
 *   and query Prisma directly to always see fresh inventory data.
 *
 * PAGE_SIZE is the single source of truth for pagination across both pages.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { d, dn } from '@/lib/decimal';
import { PRODUCT_CARD_SELECT } from '@/lib/product-select';
import { firstCardImage } from '@/lib/product-media';

/** Products per page — must be a multiple of 4 (grid columns). */
export const PAGE_SIZE = 24;

/** TTL safety net in seconds. Tags are the primary freshness mechanism. */
const REVALIDATE = 600;

type ProductCardRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: Parameters<typeof d>[0];
  originalPrice: Parameters<typeof dn>[0];
  stock: number;
  category: string;
  brand: string | null;
  images: string[];
};

/** Convierte filas Prisma (Decimal) al modelo de tarjeta usado en catálogo/categoría. */
function mapProductRowsToCardModels(rows: ProductCardRow[]) {
  return rows.map((p) => ({
    id:            p.id,
    slug:          p.slug,
    name:          p.name,
    description:   p.description ?? '',
    price:         d(p.price),
    originalPrice: dn(p.originalPrice),
    stock:         p.stock,
    category:      p.category,
    brand:         p.brand,
    image:         firstCardImage(p.images),
    images:        p.images,
    details:       {} as Record<string, string>,
  }));
}

// ── Catalog (all-products page) ───────────────────────────────────────────────

/** Total count of active products — used for pagination bounds and metadata. */
export const getCachedCatalogCount = unstable_cache(
  () => prisma.product.count({ where: { isActive: true } }),
  ['catalog-count'],
  { tags: ['catalog'], revalidate: REVALIDATE },
);

/**
 * Active products for one catalog page, ordered newest-first.
 * Cache key automatically includes the `page` argument.
 */
export const getCachedCatalogProducts = unstable_cache(
  async (page: number) => {
    const rows = await prisma.product.findMany({
      where:   { isActive: true },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
      select: PRODUCT_CARD_SELECT,
    });
    return mapProductRowsToCardModels(rows);
  },
  ['catalog-products', String(PAGE_SIZE)],
  { tags: ['catalog'], revalidate: REVALIDATE },
);

/**
 * Productos activos EN OFERTA (originalPrice > price), orden newest-first.
 * Devuelve la lista completa ya filtrada; la página /ofertas pagina en memoria.
 */
export const getCachedOfferProducts = unstable_cache(
  async () => {
    const rows = await prisma.product.findMany({
      where:   { isActive: true, originalPrice: { not: null } },
      orderBy: { createdAt: 'desc' },
      select:  PRODUCT_CARD_SELECT,
    });
    return mapProductRowsToCardModels(rows).filter(
      (p) => p.originalPrice != null && p.originalPrice > p.price,
    );
  },
  ['offer-products'],
  { tags: ['catalog'], revalidate: REVALIDATE },
);

/**
 * Categories ordered by `order` asc, each with a count of active products.
 * Used by the category sidebar and any nav that shows product counts.
 * Tagged with both 'catalog' and 'categories' so that mutations to either
 * products (count changes) or category records (name/slug changes) refresh it.
 */
export const getCachedServerCategories = unstable_cache(
  async () => {
    const [rows, counts] = await Promise.all([
      prisma.category.findMany({
        select:  { name: true, slug: true },
        orderBy: { order: 'asc' },
      }),
      prisma.product.groupBy({
        by:    ['category'],
        where: { isActive: true },
        _count: { _all: true },
      }),
    ]);
    const countMap = new Map(counts.map((c) => [c.category.toLowerCase(), c._count._all]));
    return rows.map((r) => ({
      name:  r.name,
      slug:  r.slug,
      count: countMap.get(r.name.toLowerCase()) ?? 0,
    }));
  },
  ['server-categories'],
  { tags: ['catalog', 'categories'], revalidate: REVALIDATE },
);

// ── Category page ─────────────────────────────────────────────────────────────

/**
 * Single category record for a given slug.
 * Used for metadata generation, the hero section, and slug-redirect guard.
 * Returns null when the slug does not exist (triggers redirect lookup).
 */
export const getCachedCategory = unstable_cache(
  (slug: string) => prisma.category.findUnique({ where: { slug } }),
  ['category'],
  { tags: ['categories'], revalidate: REVALIDATE },
);

/**
 * Total active products for a category (case-insensitive name match).
 * Used for pagination bounds, metadata totalPages, and thin-content noindex.
 * Cache key automatically includes the `categoryName` argument.
 */
export const getCachedCategoryCount = unstable_cache(
  (categoryName: string) =>
    prisma.product.count({
      where: {
        category: { equals: categoryName, mode: 'insensitive' },
        isActive: true,
      },
    }),
  ['category-count'],
  { tags: ['catalog'], revalidate: REVALIDATE },
);

/**
 * Active products for one category page, ordered newest-first.
 * Cache key automatically includes `categoryName` and `page` arguments.
 */
export const getCachedCategoryProducts = unstable_cache(
  async (categoryName: string, page: number) => {
    const rows = await prisma.product.findMany({
      where: {
        category: { equals: categoryName, mode: 'insensitive' as const },
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
      select: PRODUCT_CARD_SELECT,
    });
    return mapProductRowsToCardModels(rows);
  },
  ['category-products', String(PAGE_SIZE)],
  { tags: ['catalog'], revalidate: REVALIDATE },
);
