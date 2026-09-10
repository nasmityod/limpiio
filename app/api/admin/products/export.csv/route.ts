import Papa from 'papaparse';
import { requirePermission } from '@/lib/admin-access-server';
import { logInfo, logWarn } from '@/lib/safe-logger';
import {
  countAdminProducts,
  iterateAdminProductsForCsv,
  type AdminProductCsvRow,
  type AdminProductFilters,
  type AdminStatusFilter,
  type AdminStockFilter,
} from '@/lib/products/admin-product-query';

/**
 * GET /api/admin/products/export.csv
 *   ?search=&category=&minPrice=&maxPrice=&stock=all|low|out&status=all|active|inactive
 *
 * Exporta el inventario **filtrado completo**, no la página visible.
 *
 * Por qué existe: «Exportar inventario» construía el CSV con el array que el
 * navegador ya tenía cargado. Eso funcionaba sólo porque el listado descargaba
 * TODO el catálogo. Al paginar el listado (auditoría de rendimiento, RC-01), el
 * export habría pasado en silencio a contener únicamente los productos de la
 * página — una regresión funcional. La exportación se resuelve ahora en
 * servidor, recorriendo el conjunto filtrado por lotes keyset.
 *
 * Mismo criterio que /api/orders/export.csv: cabeceras canónicas (round-trip
 * con `importProductsFromCSV`), tope de filas y BOM UTF-8 para Excel.
 */

const MAX_EXPORT_ROWS = 20_000;
const BATCH_SIZE = 500;

function parseStock(value: string | null): AdminStockFilter {
  return value === 'low' || value === 'out' ? value : 'all';
}

function parseStatus(value: string | null): AdminStatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

function parsePrice(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const filters: AdminProductFilters = {
    search: searchParams.get('search') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    minPrice: parsePrice(searchParams.get('minPrice')),
    maxPrice: parsePrice(searchParams.get('maxPrice')),
    stockFilter: parseStock(searchParams.get('stock')),
    status: parseStatus(searchParams.get('status')),
  };

  try {
    const totalMatching = await countAdminProducts(filters);

    if (totalMatching > MAX_EXPORT_ROWS) {
      logWarn('products_export_limit_exceeded', {
        count: totalMatching,
        operation: 'export',
      });
      const message =
        `Exportación cancelada: ${totalMatching} productos coinciden con el filtro, ` +
        `pero el límite es ${MAX_EXPORT_ROWS}. Refina los filtros e intenta de nuevo.`;
      const accept = request.headers.get('accept') ?? '';
      if (accept.includes('application/json')) {
        return Response.json({ message }, { status: 413 });
      }
      return new Response(message, {
        status: 413,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const rows: AdminProductCsvRow[] = [];
    for await (const batch of iterateAdminProductsForCsv(filters, {
      batchSize: BATCH_SIZE,
      maxRows: MAX_EXPORT_ROWS,
    })) {
      rows.push(...batch);
    }

    logInfo('products_export_executed', { count: rows.length, operation: 'export' });

    // Cabeceras canónicas idénticas a las que espera importProductsFromCSV
    // → round-trip completo exportar → editar → importar, con SKU como clave.
    const csv = Papa.unparse(rows, {
      quotes: true,
      columns: [
        'sku',
        'name',
        'brand',
        'category',
        'price',
        'stock',
        'description',
        'imageUrl',
        'freeShipping',
      ],
    });
    const stamp = new Date().toISOString().slice(0, 10);

    // BOM para que Excel respete acentos (mismo criterio que lib/csv-export.ts)
    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inventario-mundotech-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logWarn('products_export_failed', {
      route: '/api/admin/products/export.csv',
      operation: 'export',
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return new Response('No se pudo generar la exportación del inventario.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
