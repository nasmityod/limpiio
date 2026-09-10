/**
 * Tipos y utilidades PURAS para filtrado/orden de catálogo.
 * Importable desde Client y Server Components (sin Prisma).
 */

import { SEARCH_PAGE_SIZE } from '@/lib/search-shared';

const DEFAULT_PAGE_SIZE = SEARCH_PAGE_SIZE;

export const PRODUCT_SORT_VALUES = [
  'default',
  'relevance',
  'price-asc',
  'price-desc',
  'newest',
  'name-asc',
  'name-desc',
] as const;

export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];

export type ProductQuery = {
  q?: string;
  /** Nombre de categoría (Product.category), no slug. */
  category?: string;
  /**
   * Filtro secundario dentro de la categoría.
   * En BD no hay subcategoría: se mapea a Product.brand (marcas del catálogo).
   */
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSort;
  page: number;
  pageSize: number;
  /** Solo aplica en /buscar; catálogo público siempre excluye agotados salvo disp=all. */
  includeOutOfStock?: boolean;
};

export type ProductFacets = {
  categories: string[];
  brands: string[];
};

export type ProductQueryResult<T> = {
  items: T[];
  total: number;
  facets: ProductFacets;
};

/** Normaliza texto para comparación sin acentos ni mayúsculas. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function parseOptionalPrice(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

function parseSort(raw: string | undefined): ProductSort {
  const value = (raw ?? 'default').trim();
  return (PRODUCT_SORT_VALUES as readonly string[]).includes(value)
    ? (value as ProductSort)
    : 'default';
}

/** Corrige min/max invertidos o iguales; descarta valores inválidos. */
export function sanitizePriceRange(
  minPrice?: number,
  maxPrice?: number,
): { minPrice?: number; maxPrice?: number } {
  if (minPrice == null && maxPrice == null) return {};
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    return { minPrice: maxPrice, maxPrice: minPrice };
  }
  return { minPrice, maxPrice };
}

export function parseProductQuery(
  params: Record<string, string | undefined>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): ProductQuery {
  const q = (params.q ?? params.query ?? '').trim();
  const category = (params.cat ?? params.category ?? '').trim() || undefined;
  const brand = (params.brand ?? params.subcategory ?? '').trim() || undefined;

  let minPrice = parseOptionalPrice(params.minPrice ?? params.min);
  let maxPrice = parseOptionalPrice(params.maxPrice ?? params.max);
  ({ minPrice, maxPrice } = sanitizePriceRange(minPrice, maxPrice));

  const pageParsed = parseInt(params.page ?? '1', 10);
  const page = Math.max(1, Number.isFinite(pageParsed) ? pageParsed : 1);

  const sort = parseSort(params.sort);
  const includeOutOfStock = (params.disp ?? '').trim() === 'all';

  return {
    q: q || undefined,
    category,
    brand,
    minPrice,
    maxPrice,
    sort,
    page,
    pageSize,
    includeOutOfStock: includeOutOfStock || undefined,
  };
}

/** True cuando hay filtros/búsqueda/orden distinto al default del catálogo sin query. */
export function hasActiveCatalogFilters(query: ProductQuery): boolean {
  if (query.q) return true;
  if (query.category) return true;
  if (query.brand) return true;
  if (query.minPrice != null || query.maxPrice != null) return true;
  if (query.sort !== 'default' && query.sort !== 'newest') return true;
  return false;
}

export type CatalogUrlParams = {
  q?: string;
  cat?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  disp?: 'all';
};

/** Serializa filtros activos a query string (sin page=1 ni sort=default). */
export function serializeCatalogParams(input: CatalogUrlParams): URLSearchParams {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.cat) params.set('cat', input.cat);
  if (input.brand) params.set('brand', input.brand);
  if (input.minPrice != null) params.set('minPrice', String(input.minPrice));
  if (input.maxPrice != null) params.set('maxPrice', String(input.maxPrice));
  if (input.sort && input.sort !== 'default') params.set('sort', input.sort);
  if (input.page && input.page > 1) params.set('page', String(input.page));
  if (input.disp === 'all') params.set('disp', 'all');
  return params;
}

export function buildCatalogHref(
  basePath: string,
  input: CatalogUrlParams,
  page?: number,
): string {
  const params = serializeCatalogParams({
    ...input,
    page: page ?? input.page,
  });
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Resuelve sort efectivo: relevancia con término, sino novedad. */
export function effectiveSortForQuery(query: ProductQuery): ProductSort {
  if (query.sort === 'default' || query.sort === 'relevance') {
    return query.q && query.q.length >= 2 ? 'relevance' : 'newest';
  }
  return query.sort;
}
