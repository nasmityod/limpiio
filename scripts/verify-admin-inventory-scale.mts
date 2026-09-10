/**
 * Prueba de escalabilidad del Inventario admin (solo LECTURA).
 *
 * Mide, contra una base con el volumen que se le indique, lo que realmente
 * viaja y tarda al abrir/paginar/buscar en `/admin/products`, y comprueba que
 * la paginación keyset recorre el catálogo completo sin saltos ni duplicados.
 *
 * Uso (con la base sembrada por scripts/perf-seed.mjs):
 *   PERF_DATABASE_URL=postgres://…/mundotech_perf npm run verify:inventory-scale
 *
 * Criterio de aceptación que verifica: el número de productos recibidos en la
 * primera carga NO depende del total existente.
 */
import 'dotenv/config';
import {
  ADMIN_PRODUCTS_PAGE_SIZE,
  iterateAdminProductsForCsv,
  queryAdminProducts,
} from '../lib/products/admin-product-query';
import { prisma } from '../lib/prisma';

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

async function bench<T>(label: string, fn: () => Promise<T>, runs = 5): Promise<T> {
  await fn(); // calentamiento
  const times: number[] = [];
  let out!: T;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    out = await fn();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(46)} p50=${times[Math.floor(runs / 2)].toFixed(1).padStart(7)} ms   ` +
      `payload=${String(bytes(out)).padStart(8)} B`,
  );
  return out;
}

const total = await prisma.product.count();
console.log(`Productos en la base: ${total}\n`);

const page1 = await bench('Página 1 sin filtros', () =>
  queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE }),
);
console.log(
  `  → filas recibidas: ${page1.products.length} (pageSize ${page1.pageSize}) · ` +
    `total ${page1.total} · bajo ${page1.lowStockCount} · agotados ${page1.outOfStockCount}`,
);
if (page1.products.length > ADMIN_PRODUCTS_PAGE_SIZE) {
  console.error('✘ La primera carga devolvió más filas que pageSize.');
  process.exit(1);
}

await bench('Página 2 (keyset)', () =>
  queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE, cursor: page1.nextCursor }),
);
await bench('Búsqueda por texto', () =>
  queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE, search: 'cable' }),
);
await bench('Filtro por categoría', () =>
  queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE, category: 'Gaming' }),
);
await bench('Filtro agotados', () =>
  queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE, stockFilter: 'out' }),
);
await bench('Filtro despublicados', () =>
  queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE, status: 'inactive' }),
);
await bench('Rango de precio', () =>
  queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE, minPrice: 100, maxPrice: 300 }),
);

// ── Integridad de la paginación keyset ──────────────────────────────────────
const expected = await prisma.product.findMany({
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  select: { id: true },
});

const seen: string[] = [];
let cursor: string | null = null;
let pages = 0;
const tWalk = process.hrtime.bigint();
for (;;) {
  const page = await queryAdminProducts({ pageSize: ADMIN_PRODUCTS_PAGE_SIZE, cursor });
  seen.push(...page.products.map((p) => p.id));
  pages++;
  if (!page.nextCursor) break;
  cursor = page.nextCursor;
}
const msWalk = Number(process.hrtime.bigint() - tWalk) / 1e6;

const unique = new Set(seen).size;
const sameOrder = JSON.stringify(seen) === JSON.stringify(expected.map((p) => p.id));
console.log(
  `\nRecorrido keyset: ${pages} páginas · ${seen.length} filas · ${unique} únicas · ` +
    `${msWalk.toFixed(0)} ms (${(msWalk / pages).toFixed(1)} ms/página)`,
);
console.log(`Orden idéntico al de Prisma: ${sameOrder}`);

// ── Exportación CSV del filtro completo ─────────────────────────────────────
const tCsv = process.hrtime.bigint();
let csvRows = 0;
for await (const batch of iterateAdminProductsForCsv({})) csvRows += batch.length;
console.log(
  `Export CSV (servidor, conjunto filtrado completo): ${csvRows} filas en ` +
    `${(Number(process.hrtime.bigint() - tCsv) / 1e6).toFixed(0)} ms`,
);

const ok = seen.length === expected.length && unique === expected.length && sameOrder;
console.log(ok ? '\n✔ Paginación íntegra.' : '\n✘ La paginación pierde o duplica filas.');

await prisma.$disconnect();
process.exit(ok ? 0 : 1);
