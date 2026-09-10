'use server';

import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  SEARCH_PAGE_SIZE,
  type SearchResult,
  type FullProduct,
  type FullSearchResult,
} from '@/lib/search-shared';
import { parseProductQuery } from '@/lib/products/filter';
import {
  queryCatalogProducts,
  querySearchSuggestions,
  type CatalogProductCard,
} from '@/lib/products/query-products';

const EMPTY_FULL_RESULT: FullSearchResult = {
  products: [],
  totalCount: 0,
  categories: [],
  brands: [],
};

function toSearchResult(p: CatalogProductCard): SearchResult {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    category: p.category,
    brand: p.brand,
    images: p.images,
  };
}

function toFullProduct(p: CatalogProductCard): FullProduct {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice,
    stock: p.stock,
    category: p.category,
    brand: p.brand,
    image: p.image,
    images: p.images,
    details: p.details,
    freeShipping: p.freeShipping,
  };
}

/** PRD-166: IP real del visitante para rate limit en Server Actions públicas. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return getClientIp(new Request('https://internal.local', { headers: h as unknown as HeadersInit }));
}

export async function searchProducts(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2 || q.length > 120) return [];

  if (await rateLimit(`search:suggest:${await clientIp()}`, { limit: 40, windowMs: 60_000 })) {
    return [];
  }

  const rows = await querySearchSuggestions(q, 7);
  return rows.map(toSearchResult);
}

// ─────────────────────────────────────────────────────────────
// Búsqueda completa paginada (página /buscar)
// Constantes y tipos compartidos: lib/search-shared.ts
// ─────────────────────────────────────────────────────────────

export async function searchProductsFull({
  query,
  category,
  brand,
  sort = 'default',
  page = 1,
  includeOutOfStock = false,
  minPrice,
  maxPrice,
}: {
  query: string;
  category?: string;
  brand?: string;
  sort?: string;
  page?: number;
  includeOutOfStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
}): Promise<FullSearchResult> {
  const q = query.trim();

  if (q.length === 1) return EMPTY_FULL_RESULT;

  if (await rateLimit(`search:full:${await clientIp()}`, { limit: 60, windowMs: 60_000 })) {
    return EMPTY_FULL_RESULT;
  }

  const productQuery = parseProductQuery({
    q,
    cat: category,
    brand,
    sort,
    page: String(page),
    minPrice: minPrice != null ? String(minPrice) : undefined,
    maxPrice: maxPrice != null ? String(maxPrice) : undefined,
    disp: includeOutOfStock ? 'all' : undefined,
  });
  productQuery.pageSize = SEARCH_PAGE_SIZE;
  productQuery.includeOutOfStock = includeOutOfStock;

  const { items, total, facets } = await queryCatalogProducts(productQuery);

  return {
    products: items.map(toFullProduct),
    totalCount: total,
    categories: facets.categories,
    brands: facets.brands,
  };
}
