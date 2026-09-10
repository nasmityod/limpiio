/**
 * Consulta paginada del inventario administrativo (`/admin/products`).
 *
 * Por qué existe este módulo
 * ──────────────────────────
 * Hasta la auditoría de rendimiento del Panel Admin, `getProductsAdmin()`
 * ejecutaba `prisma.product.findMany({ where, orderBy, select: PRODUCT_ADMIN_SELECT })`
 * SIN `take`/`skip`/cursor: cada carga de Inventario (y cada búsqueda con
 * debounce, y cada guardado) descargaba el catálogo COMPLETO con descripción,
 * specs y media incluidas. Con 5 000 productos eso son ~6,4 MB de JSON por
 * interacción. Ver docs/AUDITORIA-RENDIMIENTO-PANEL-ADMIN.md (RC-01/RC-02).
 *
 * Diseño
 * ──────
 * • Paginación **keyset (cursor)** sobre `("createdAt" DESC, id DESC)`. No usa
 *   OFFSET: el coste de la página N no crece con N y el orden es estable aunque
 *   se creen productos mientras se navega.
 * • Búsqueda por nombre / SKU / marca resuelta con `pg_trgm` sobre la misma
 *   expresión normalizada que indexa `product_admin_search_trgm_idx`
 *   (`immutable_unaccent(lower(...))`), de modo que `ILIKE '%texto%'` deja de
 *   ser un Seq Scan y además pasa a ser insensible a acentos.
 * • Sólo se seleccionan las columnas que pinta una fila/card del listado. El
 *   detalle completo para editar se pide aparte (`getAdminProductById`).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { d, dn } from '@/lib/decimal';
import { firstCardImage } from '@/lib/product-media';
import {
  clampAdminPageSize,
  normalizeAdminProductFilters,
  type AdminProductCsvRow,
  type AdminProductFilters,
  type AdminProductListItem,
  type AdminProductListParams,
  type AdminProductListResult,
  type NormalizedAdminProductFilters,
} from '@/lib/products/admin-product-dto';

// El contrato (tipos, constantes y saneado de filtros) vive en un módulo puro
// para que el Client Component de `/admin/products` pueda importarlo sin
// arrastrar Prisma —y por tanto `pg`— al bundle del navegador.
export * from '@/lib/products/admin-product-dto';

// ── Cursor ──────────────────────────────────────────────────────────────────

export interface AdminProductCursor {
  createdAt: Date;
  id: string;
}

/**
 * Serializa el cursor keyset. Base64url de `<epochMs>:<id>` — opaco para el
 * cliente y estable frente a diferencias de zona horaria.
 */
export function encodeAdminProductCursor(cursor: AdminProductCursor): string {
  return Buffer.from(`${cursor.createdAt.getTime()}:${cursor.id}`, 'utf8').toString('base64url');
}

/** Devuelve null si el cursor no es válido (nunca lanza: entrada no confiable). */
export function decodeAdminProductCursor(raw: string | null | undefined): AdminProductCursor | null {
  if (!raw || typeof raw !== 'string' || raw.length > 512) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator <= 0) return null;
  const millis = Number(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (!Number.isSafeInteger(millis) || millis < 0 || id.length === 0 || id.length > 128) return null;
  return { createdAt: new Date(millis), id };
}

// ── SQL ─────────────────────────────────────────────────────────────────────

/**
 * Expresión normalizada de búsqueda admin. DEBE coincidir carácter a carácter
 * con la del índice `product_admin_search_trgm_idx`, o Postgres no lo usará.
 */
export const ADMIN_SEARCH_EXPR = Prisma.sql`immutable_unaccent(lower(coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(brand,'')))`;

function buildAdminWhere(filters: NormalizedAdminProductFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];

  if (filters.search) {
    conditions.push(
      Prisma.sql`${ADMIN_SEARCH_EXPR} LIKE '%' || immutable_unaccent(lower(${filters.search})) || '%'`,
    );
  }
  if (filters.category) {
    conditions.push(Prisma.sql`category = ${filters.category}`);
  }
  if (filters.minPrice !== undefined) {
    conditions.push(Prisma.sql`price >= ${filters.minPrice}`);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(Prisma.sql`price <= ${filters.maxPrice}`);
  }
  if (filters.stockFilter === 'out') {
    conditions.push(Prisma.sql`stock = 0`);
  } else if (filters.stockFilter === 'low') {
    conditions.push(Prisma.sql`stock > 0 AND stock <= ${filters.lowThreshold}`);
  }
  if (filters.status === 'active') {
    conditions.push(Prisma.sql`"isActive" = true`);
  } else if (filters.status === 'inactive') {
    conditions.push(Prisma.sql`"isActive" = false`);
  }

  return Prisma.join(conditions, ' AND ');
}

interface AdminProductRow {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  brand: string | null;
  /** `numeric` de Postgres: llega como string o Decimal según el driver. */
  price: string | number | { toNumber(): number };
  originalPrice: string | number | { toNumber(): number } | null;
  stock: number;
  isActive: boolean;
  freeShipping: boolean;
  images: string[];
  createdAt: Date;
}

function mapRow(row: AdminProductRow): AdminProductListItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    brand: row.brand ?? '',
    price: d(row.price),
    originalPrice: dn(row.originalPrice),
    stock: row.stock,
    isActive: row.isActive,
    freeShipping: row.freeShipping === true,
    image: firstCardImage(row.images),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Una página del inventario admin + los contadores del conjunto filtrado.
 *
 * `total`, `lowStockCount` y `outOfStockCount` se calculan con agregados en
 * PostgreSQL: antes salían de `products.length` / `products.filter(...)` sobre
 * el array completo en el navegador, que es justamente lo que ya no viaja.
 */
export async function queryAdminProducts(
  params: AdminProductListParams,
): Promise<AdminProductListResult> {
  const filters = normalizeAdminProductFilters(params);
  const pageSize = clampAdminPageSize(params.pageSize);
  const where = buildAdminWhere(filters);
  const cursor = decodeAdminProductCursor(params.cursor);

  const keyset = cursor
    ? Prisma.sql`AND ("createdAt", id) < (${cursor.createdAt}, ${cursor.id})`
    : Prisma.empty;

  const [rows, counts] = await Promise.all([
    // `take + 1` detecta si hay página siguiente sin un COUNT extra.
    prisma.$queryRaw<AdminProductRow[]>(Prisma.sql`
      SELECT id, sku, name, category, brand, price, "originalPrice", stock,
             "isActive", "freeShipping", images, "createdAt"
      FROM "Product"
      WHERE ${where}
      ${keyset}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${pageSize + 1}
    `),
    prisma.$queryRaw<
      Array<{ total: bigint | number; low: bigint | number; out: bigint | number }>
    >(Prisma.sql`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE stock > 0 AND stock < ${filters.lowThreshold}) AS low,
        COUNT(*) FILTER (WHERE stock = 0)                                     AS out
      FROM "Product"
      WHERE ${where}
    `),
  ]);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const aggregate = counts[0];

  return {
    products: page.map(mapRow),
    nextCursor:
      hasMore && last ? encodeAdminProductCursor({ createdAt: last.createdAt, id: last.id }) : null,
    total: Number(aggregate?.total ?? 0),
    lowStockCount: Number(aggregate?.low ?? 0),
    outOfStockCount: Number(aggregate?.out ?? 0),
    pageSize,
  };
}

interface AdminProductCsvDbRow {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category: string;
  price: string | number | { toNumber(): number };
  stock: number;
  description: string | null;
  images: string[];
  freeShipping: boolean;
  createdAt: Date;
}

/** Cuenta cuántos productos exportaría el filtro actual (sin traerlos). */
export async function countAdminProducts(filters: AdminProductFilters): Promise<number> {
  const normalized = normalizeAdminProductFilters(filters);
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*) AS total FROM "Product" WHERE ${buildAdminWhere(normalized)}
  `);
  return Number(rows[0]?.total ?? 0);
}

/**
 * Recorre TODO el conjunto filtrado en lotes keyset para exportar a CSV.
 *
 * «Exportar inventario» siempre significó *todo lo filtrado*, no la vista
 * visible; al paginar el listado, mantener esa promesa exige esta consulta
 * dedicada en servidor. El lote acota la memoria: nunca hay más de
 * `batchSize` filas materializadas a la vez.
 */
export async function* iterateAdminProductsForCsv(
  filters: AdminProductFilters,
  { batchSize = 500, maxRows = 20_000 }: { batchSize?: number; maxRows?: number } = {},
): AsyncGenerator<AdminProductCsvRow[]> {
  const normalized = normalizeAdminProductFilters(filters);
  const where = buildAdminWhere(normalized);

  let cursor: AdminProductCursor | null = null;
  let emitted = 0;

  while (emitted < maxRows) {
    const keyset: Prisma.Sql = cursor
      ? Prisma.sql`AND ("createdAt", id) < (${cursor.createdAt}, ${cursor.id})`
      : Prisma.empty;
    const take = Math.min(batchSize, maxRows - emitted);

    const rows = await prisma.$queryRaw<AdminProductCsvDbRow[]>(Prisma.sql`
      SELECT id, sku, name, brand, category, price, stock, description, images,
             "freeShipping", "createdAt"
      FROM "Product"
      WHERE ${where}
      ${keyset}
      ORDER BY "createdAt" DESC, id DESC
      LIMIT ${take}
    `);

    if (rows.length === 0) return;

    yield rows.map((row) => ({
      sku: row.sku ?? '',
      name: row.name,
      brand: row.brand ?? '',
      category: row.category,
      price: d(row.price),
      stock: row.stock,
      description: row.description ?? '',
      imageUrl: row.images?.[0] ?? '',
      freeShipping: row.freeShipping ? 'true' : 'false',
    }));

    emitted += rows.length;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
    if (rows.length < take) return;
  }
}
