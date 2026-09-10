import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Auditoría de rendimiento del Panel Admin — RC-01/RC-02/RC-05.
 *
 * Cubre el contrato de `lib/products/admin-product-query.ts`:
 *  · el cursor keyset (ida y vuelta, entradas maliciosas)
 *  · la normalización de filtros y el tope de `pageSize`
 *  · que la consulta del listado SIEMPRE lleva LIMIT y nunca selecciona los
 *    campos pesados de edición
 *  · que la expresión de búsqueda coincide con la del índice GIN de la
 *    migración (si divergen, Postgres deja de usar el índice en silencio)
 */

const queryRawMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

const {
  ADMIN_PRODUCTS_MAX_PAGE_SIZE,
  ADMIN_PRODUCTS_PAGE_SIZE,
  ADMIN_SEARCH_EXPR,
  clampAdminPageSize,
  decodeAdminProductCursor,
  encodeAdminProductCursor,
  normalizeAdminProductFilters,
  queryAdminProducts,
} = await import('@/lib/products/admin-product-query');

function sqlOf(call: unknown): string {
  const value = call as { strings?: string[]; sql?: string; text?: string };
  if (Array.isArray(value.strings)) return value.strings.join('?');
  return value.sql ?? value.text ?? String(call);
}

beforeEach(() => {
  queryRawMock.mockReset();
});

describe('cursor keyset del inventario admin', () => {
  it('codifica y decodifica sin pérdida', () => {
    const createdAt = new Date('2026-03-04T05:06:07.008Z');
    const token = encodeAdminProductCursor({ createdAt, id: 'ckabc123' });
    const back = decodeAdminProductCursor(token);
    expect(back?.id).toBe('ckabc123');
    expect(back?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it('el token es opaco (no expone el id en claro)', () => {
    const token = encodeAdminProductCursor({ createdAt: new Date(0), id: 'ckabc123' });
    expect(token).not.toContain('ckabc123');
  });

  it('devuelve null ante entradas inválidas en lugar de lanzar', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'no-es-base64!!',
      Buffer.from('sinseparador', 'utf8').toString('base64url'),
      Buffer.from(':sinfecha', 'utf8').toString('base64url'),
      Buffer.from('abc:id', 'utf8').toString('base64url'),
      Buffer.from('-1:id', 'utf8').toString('base64url'),
      'a'.repeat(600),
    ]) {
      expect(decodeAdminProductCursor(bad as string)).toBeNull();
    }
  });
});

describe('normalización de filtros', () => {
  it('aplica los valores por defecto del panel', () => {
    const filters = normalizeAdminProductFilters({});
    expect(filters.stockFilter).toBe('all');
    expect(filters.status).toBe('all');
    expect(filters.lowThreshold).toBe(3);
    expect(filters.search).toBeUndefined();
    expect(filters.category).toBeUndefined();
  });

  it('recorta la búsqueda y descarta cadenas vacías', () => {
    expect(normalizeAdminProductFilters({ search: '   ' }).search).toBeUndefined();
    expect(normalizeAdminProductFilters({ search: '  cable  ' }).search).toBe('cable');
    expect(normalizeAdminProductFilters({ search: 'x'.repeat(500) }).search).toHaveLength(120);
  });

  it('ignora precios no numéricos', () => {
    const filters = normalizeAdminProductFilters({
      minPrice: Number.NaN,
      maxPrice: Number.POSITIVE_INFINITY,
    });
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });

  it('acota pageSize entre 1 y el máximo', () => {
    expect(clampAdminPageSize(undefined)).toBe(ADMIN_PRODUCTS_PAGE_SIZE);
    expect(clampAdminPageSize(0)).toBe(1);
    expect(clampAdminPageSize(-5)).toBe(1);
    expect(clampAdminPageSize(10_000)).toBe(ADMIN_PRODUCTS_MAX_PAGE_SIZE);
    expect(clampAdminPageSize(40)).toBe(40);
  });
});

describe('queryAdminProducts', () => {
  const row = {
    id: 'p1',
    sku: 'MT-1',
    name: 'Cable',
    category: 'Tecnología',
    brand: 'Anker',
    price: '12.50',
    originalPrice: null,
    stock: 4,
    isActive: true,
    freeShipping: false,
    images: ['https://cdn.test/a.webp', 'https://cdn.test/b.webp'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  function mockOnePage(rows: unknown[], counts = { total: 1n, low: 0n, out: 0n }) {
    queryRawMock
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([counts]);
  }

  it('la consulta del listado SIEMPRE lleva LIMIT (nunca findMany sin tope)', async () => {
    mockOnePage([row]);
    await queryAdminProducts({ pageSize: 30 });
    const listSql = sqlOf(queryRawMock.mock.calls[0][0]);
    expect(listSql).toContain('LIMIT');
    expect(listSql).toContain('ORDER BY "createdAt" DESC, id DESC');
  });

  it('no selecciona los campos pesados de edición', async () => {
    mockOnePage([row]);
    await queryAdminProducts({});
    const listSql = sqlOf(queryRawMock.mock.calls[0][0]);
    for (const heavy of ['description', 'specs', 'cost', 'profitMarginPct', 'media']) {
      expect(listSql).not.toContain(heavy);
    }
  });

  it('devuelve la miniatura resuelta en servidor, no el array de imágenes', async () => {
    mockOnePage([row]);
    const result = await queryAdminProducts({});
    expect(result.products[0].image).toBe('https://cdn.test/a.webp');
    expect(result.products[0]).not.toHaveProperty('images');
  });

  it('convierte Decimal a number en la frontera servidor→cliente', async () => {
    mockOnePage([row]);
    const result = await queryAdminProducts({});
    expect(result.products[0].price).toBe(12.5);
    expect(result.products[0].originalPrice).toBeNull();
  });

  it('pide pageSize+1 filas y expone nextCursor sólo si hay más', async () => {
    // 2 filas devueltas con pageSize 1 ⇒ hay página siguiente
    mockOnePage([row, { ...row, id: 'p2' }], { total: 2n, low: 0n, out: 0n });
    const withMore = await queryAdminProducts({ pageSize: 1 });
    expect(withMore.products).toHaveLength(1);
    expect(withMore.nextCursor).toBeTruthy();

    queryRawMock.mockReset();
    mockOnePage([row], { total: 1n, low: 0n, out: 0n });
    const lastPage = await queryAdminProducts({ pageSize: 1 });
    expect(lastPage.nextCursor).toBeNull();
  });

  it('el cursor de la página siguiente apunta a la última fila devuelta', async () => {
    mockOnePage([row, { ...row, id: 'p2' }], { total: 2n, low: 0n, out: 0n });
    const page = await queryAdminProducts({ pageSize: 1 });
    const decoded = decodeAdminProductCursor(page.nextCursor);
    expect(decoded?.id).toBe('p1');
    expect(decoded?.createdAt.getTime()).toBe(row.createdAt.getTime());
  });

  it('un cursor inválido no rompe: se sirve la primera página', async () => {
    mockOnePage([row]);
    await expect(queryAdminProducts({ cursor: 'basura###' })).resolves.toBeTruthy();
    expect(sqlOf(queryRawMock.mock.calls[0][0])).not.toContain('("createdAt", id) <');
  });

  it('aplica el keyset cuando el cursor es válido', async () => {
    mockOnePage([row]);
    const cursor = encodeAdminProductCursor({ createdAt: new Date(), id: 'p0' });
    await queryAdminProducts({ cursor });
    expect(sqlOf(queryRawMock.mock.calls[0][0])).toContain('("createdAt", id) <');
  });

  it('los contadores salen de agregados SQL, no de la página', async () => {
    mockOnePage([row], { total: 5000n, low: 215n, out: 611n });
    const result = await queryAdminProducts({ pageSize: 30 });
    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(5000);
    expect(result.lowStockCount).toBe(215);
    expect(result.outOfStockCount).toBe(611);
    const countSql = sqlOf(queryRawMock.mock.calls[1][0]);
    expect(countSql).toContain('COUNT(*)');
    expect(countSql).toContain('FILTER');
  });

  it('la búsqueda usa la expresión trigram, no ILIKE por columna', async () => {
    mockOnePage([row]);
    await queryAdminProducts({ search: 'cable' });
    const listSql = sqlOf(queryRawMock.mock.calls[0][0]);
    expect(listSql).toContain('immutable_unaccent');
    expect(listSql).not.toMatch(/ILIKE/i);
  });

  it('los filtros de stock y estado se traducen a SQL', async () => {
    mockOnePage([row]);
    await queryAdminProducts({ stockFilter: 'out', status: 'inactive' });
    const listSql = sqlOf(queryRawMock.mock.calls[0][0]);
    expect(listSql).toContain('stock = 0');
    expect(listSql).toContain('"isActive" = false');
  });
});

describe('paridad con el índice GIN de la migración', () => {
  it('ADMIN_SEARCH_EXPR coincide con product_admin_search_trgm_idx', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260826120000_add_admin_performance_indexes/migration.sql',
      ),
      'utf8',
    );

    // Comparación literal: la migración escribe la expresión en una sola línea
    // precisamente para que esto sea posible. Si alguien cambia una sin la otra,
    // el planificador deja de usar el índice y la búsqueda vuelve a ser un Seq
    // Scan sin que nada falle a la vista.
    const codeExpr = sqlOf(ADMIN_SEARCH_EXPR);
    expect(codeExpr).toBe(
      "immutable_unaccent(lower(coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(brand,'')))",
    );
    expect(migration).toContain(codeExpr);
  });

  it('la migración crea todos los índices que consumen las consultas admin', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260826120000_add_admin_performance_indexes/migration.sql',
      ),
      'utf8',
    );
    for (const idx of [
      'Product_createdAt_id_idx',
      'Product_category_createdAt_id_idx',
      'Product_stock_createdAt_idx',
      'Product_updatedAt_idx',
      'product_admin_search_trgm_idx',
      'Review_status_createdAt_idx',
    ]) {
      expect(migration).toContain(idx);
    }
    // Todos con IF NOT EXISTS: la migración debe ser reejecutable.
    expect(migration.match(/CREATE INDEX IF NOT EXISTS/g)?.length).toBe(6);
  });
});
