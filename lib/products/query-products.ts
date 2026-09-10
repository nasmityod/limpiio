/**
 * Consultas de catálogo con pg_trgm + unaccent (Postgres).
 * Usado por /productos, /buscar y sugerencias de búsqueda.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { d, dn } from '@/lib/decimal';
import { firstCardImage } from '@/lib/product-media';
import {
  type ProductFacets,
  type ProductQuery,
  type ProductQueryResult,
  effectiveSortForQuery,
} from '@/lib/products/filter';

/** Expresión normalizada — debe coincidir con product_search_trgm_idx. */
export const NORMALIZED_SEARCH_EXPR = Prisma.sql`immutable_unaccent(lower(coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(category,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(description,'')))`;

export type CatalogProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: string | number;
  originalPrice: string | number | null;
  stock: number;
  category: string;
  brand: string | null;
  images: string[];
  freeShipping: boolean;
};

export type CatalogProductCard = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  category: string;
  brand: string | null;
  image: string;
  images: string[];
  details: Record<string, string>;
  freeShipping: boolean;
};

function mapRowToCard(p: CatalogProductRow): CatalogProductCard {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? '',
    price: d(p.price),
    originalPrice: dn(p.originalPrice),
    stock: p.stock,
    category: p.category,
    brand: p.brand,
    image: firstCardImage(p.images),
    images: p.images,
    details: {},
    freeShipping: p.freeShipping === true,
  };
}

/**
 * FASE 4.3 (MEJORA 1.4): tokeniza la consulta para matching por palabra.
 * - "casco moto" debe encontrar "Casco de Moto" (el LIKE de frase completa no).
 * - Palabras de 1 carácter se descartan (LIKE '%a%' matchearía todo).
 * - Máximo 6 palabras: acota el costo del query plan.
 */
export function searchTermsFrom(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 6);
}

/**
 * Matching tolerante a errores por palabra (pg_trgm + unaccent):
 * - LIKE sobre la expresión normalizada → coincidencia exacta de subcadena.
 * - `<%` (word_similarity ≥ 0.6 por defecto) → tolera typos como
 *   "interconunicador" ≈ "intercomunicador" incluso dentro de nombres largos,
 *   donde similarity() de cadena completa quedaba bajo el umbral.
 * Ambos operadores usan el índice GIN product_search_trgm_idx.
 * Umbral configurable a nivel de BD: SET pg_trgm.word_similarity_threshold.
 */
function textMatchWhere(q: string): Prisma.Sql {
  const words = searchTermsFrom(q);
  if (words.length === 0) {
    return Prisma.sql`(
      ${NORMALIZED_SEARCH_EXPR} LIKE '%' || immutable_unaccent(lower(${q})) || '%'
      OR immutable_unaccent(lower(name)) % immutable_unaccent(lower(${q}))
    )`;
  }
  const perWord = words.map(
    (w) => Prisma.sql`(
      ${NORMALIZED_SEARCH_EXPR} LIKE '%' || immutable_unaccent(lower(${w})) || '%'
      OR immutable_unaccent(lower(${w})) <% ${NORMALIZED_SEARCH_EXPR}
    )`,
  );
  return Prisma.sql`(${Prisma.join(perWord, ' AND ')})`;
}

function relevanceOrderBy(q: string): Prisma.Sql {
  return Prisma.sql`
    CASE
      WHEN immutable_unaccent(lower(name)) LIKE immutable_unaccent(lower(${q})) || '%' THEN 0
      WHEN immutable_unaccent(lower(name)) LIKE '%' || immutable_unaccent(lower(${q})) || '%' THEN 1
      WHEN immutable_unaccent(lower(coalesce(brand,''))) LIKE '%' || immutable_unaccent(lower(${q})) || '%' THEN 2
      WHEN immutable_unaccent(lower(category)) LIKE '%' || immutable_unaccent(lower(${q})) || '%' THEN 3
      ELSE 4
    END ASC,
    similarity(immutable_unaccent(lower(name)), immutable_unaccent(lower(${q}))) DESC,
    "createdAt" DESC
  `;
}

function buildOrderBy(query: ProductQuery): Prisma.Sql {
  const sort = effectiveSortForQuery(query);
  const q = query.q ?? '';

  switch (sort) {
    case 'price-asc':
      return Prisma.sql`price ASC`;
    case 'price-desc':
      return Prisma.sql`price DESC`;
    case 'name-asc':
      return Prisma.sql`name ASC`;
    case 'name-desc':
      return Prisma.sql`name DESC`;
    case 'newest':
      return Prisma.sql`"createdAt" DESC`;
    case 'relevance':
      return q.length >= 2 ? relevanceOrderBy(q) : Prisma.sql`"createdAt" DESC`;
    default:
      return Prisma.sql`"createdAt" DESC`;
  }
}

function buildWhereConditions(query: ProductQuery, options?: { forFacets?: boolean }): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`"isActive" = true`];
  const q = query.q ?? '';
  const includeTextMatch = q.length >= 2;

  if (includeTextMatch) {
    conditions.push(textMatchWhere(q));
  }

  const includeOutOfStock = query.includeOutOfStock === true;
  if (!includeOutOfStock) {
    conditions.push(Prisma.sql`stock > 0`);
  }

  if (query.category) {
    conditions.push(
      Prisma.sql`immutable_unaccent(lower(category)) = immutable_unaccent(lower(${query.category}))`,
    );
  }

  // Facetas de marcas: omitir filtro de marca para listar opciones disponibles.
  if (!options?.forFacets && query.brand) {
    conditions.push(
      Prisma.sql`immutable_unaccent(lower(brand)) = immutable_unaccent(lower(${query.brand}))`,
    );
  }

  if (query.minPrice != null) {
    conditions.push(Prisma.sql`price >= ${query.minPrice}`);
  }
  if (query.maxPrice != null) {
    conditions.push(Prisma.sql`price <= ${query.maxPrice}`);
  }

  return Prisma.join(conditions, ' AND ');
}

function extractFacets(rows: Array<{ category: string; brand: string | null }>): ProductFacets {
  return {
    categories: [...new Set(rows.map((p) => p.category))].sort((a, b) =>
      a.localeCompare(b, 'es'),
    ),
    brands: [
      ...new Set(rows.map((p) => p.brand).filter((b): b is string => b != null && b.trim() !== '')),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  };
}

/** PRD-168: consulta de 1 carácter no debe listar el catálogo completo. */
export function isQueryTooShort(query: ProductQuery): boolean {
  const q = query.q ?? '';
  return q.length === 1;
}

export async function queryCatalogProducts(
  query: ProductQuery,
): Promise<ProductQueryResult<CatalogProductCard>> {
  if (isQueryTooShort(query)) {
    return { items: [], total: 0, facets: { categories: [], brands: [] } };
  }

  const skip = (query.page - 1) * query.pageSize;
  const productWhere = buildWhereConditions(query);
  const facetWhere = buildWhereConditions(query, { forFacets: true });
  const orderBy = buildOrderBy(query);

  const [productRows, facetRows] = await Promise.all([
    prisma.$queryRaw<
      Array<CatalogProductRow & { totalCount: bigint }>
    >(Prisma.sql`
      SELECT
        id,
        slug,
        name,
        description,
        price,
        "originalPrice",
        stock,
        category,
        brand,
        images,
        "freeShipping",
        COUNT(*) OVER() AS "totalCount"
      FROM "Product"
      WHERE ${productWhere}
      ORDER BY ${orderBy}
      OFFSET ${skip}
      LIMIT ${query.pageSize}
    `),
    // DISTINCT en Postgres, no en JS: `extractFacets` deduplicaba después de
    // haber traído UNA FILA POR PRODUCTO que cumpliera el filtro. Con 5 000
    // productos activos eran ~160 KB por carga de /productos para construir dos
    // listas de unas decenas de valores. El resultado es idéntico.
    prisma.$queryRaw<Array<{ category: string; brand: string | null }>>(Prisma.sql`
      SELECT DISTINCT category, brand
      FROM "Product"
      WHERE ${facetWhere}
    `),
  ]);

  const total = productRows.length > 0 ? Number(productRows[0].totalCount) : 0;

  return {
    items: productRows.map(mapRowToCard),
    total,
    facets: extractFacets(facetRows),
  };
}

/** Sugerencias rápidas para autocomplete (máx. 7). */
export async function querySearchSuggestions(q: string, limit = 7): Promise<CatalogProductCard[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return [];

  const rows = await prisma.$queryRaw<CatalogProductRow[]>(Prisma.sql`
    SELECT id, slug, name, description, price, "originalPrice", stock, category, brand, images, "freeShipping"
    FROM "Product"
    WHERE ${textMatchWhere(trimmed)}
      AND "isActive" = true
      AND stock > 0
    ORDER BY ${relevanceOrderBy(trimmed)}
    LIMIT ${limit}
  `);

  return rows.map(mapRowToCard);
}

export { textMatchWhere, relevanceOrderBy, buildOrderBy, buildWhereConditions };
