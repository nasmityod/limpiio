import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Pool } from 'pg';
import type { ProductQuery } from '@/lib/products/filter';

// This suite never follows DATABASE_URL and cannot target another database.
const auditUrl = process.env.CATALOG_SCALE_DATABASE_URL;
const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined, pool: undefined as Pool | undefined }));
vi.mock('@/lib/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { Pool } = await import('pg');
  const url = process.env.CATALOG_SCALE_DATABASE_URL;
  if (url && url !== 'postgresql://audit_local@127.0.0.1:55439/limpio_audit_test') throw new Error('Only the isolated audit PostgreSQL fixture is allowed.');
  state.pool = new Pool({ connectionString: url || 'postgresql://test:test@127.0.0.1:1/test', max: 10, connectionTimeoutMillis: 5_000, options: '-c statement_timeout=30000 -c lock_timeout=10000' });
  state.db = new PrismaClient({ adapter: new PrismaPg(state.pool) });
  return { prisma: state.db };
});

import { queryCatalogProducts } from '@/lib/products/query-products';

const prefix = `audit_catalog_${randomUUID().replaceAll('-', '')}`;
const category = `${prefix}_category`;
const createdAt = new Date('2026-10-04T12:00:00.000Z');
const fixture = Array.from({ length: 5_000 }, (_, i) => ({
  id: `${prefix}_${String(i).padStart(5, '0')}`,
  slug: `${prefix}_${String(i).padStart(5, '0')}`,
  sku: `${prefix}_${String(i).padStart(5, '0')}`,
  name: `Escala Moto ${String(i).padStart(5, '0')}`,
  description: 'Producto sintético de prueba local.',
  price: (i % 200) + 1,
  originalPrice: i % 4 === 0 ? (i % 200) + 11 : null,
  stock: i % 7 === 0 ? 0 : (i % 20) + 1,
  isActive: i % 10 !== 0,
  freeShipping: i % 3 === 0,
  category,
  brand: ['Marca A', 'Marca B', 'Marca C'][i % 3],
  images: ['/placeholder-product.png'],
  createdAt,
}));
const byId = new Map(fixture.map((p) => [p.id, p]));
const db = () => state.db!;
const baseQuery: ProductQuery = { category, sort: 'newest', page: 1, pageSize: 24 };
const scenarios: Array<{ name: string; query: ProductQuery }> = [
  { name: 'available-newest-page1', query: baseQuery },
  { name: 'available-newest-page2', query: { ...baseQuery, page: 2 } },
  { name: 'available-price-asc', query: { ...baseQuery, sort: 'price-asc' } },
  { name: 'available-price-desc-page4', query: { ...baseQuery, sort: 'price-desc', page: 4 } },
  { name: 'available-name-asc', query: { ...baseQuery, sort: 'name-asc' } },
  { name: 'available-last-page', query: { ...baseQuery, sort: 'name-desc', page: Math.ceil(fixture.filter((p) => p.isActive && p.stock > 0).length / 24) } },
  { name: 'include-empty-stock-page2', query: { ...baseQuery, includeOutOfStock: true, sort: 'price-asc', page: 2 } },
  { name: 'brand-price-range', query: { ...baseQuery, brand: 'Marca B', minPrice: 31, maxPrice: 100, sort: 'price-asc' } },
  { name: 'beyond-last-page', query: { ...baseQuery, page: 10_000 } },
  { name: 'text-search-relevance', query: { ...baseQuery, q: 'moto', sort: 'relevance' } },
];

function matching(query: ProductQuery, forFacets = false) {
  return fixture.filter((p) => p.isActive && (query.includeOutOfStock || p.stock > 0) &&
    (forFacets || !query.brand || p.brand === query.brand) &&
    (query.minPrice == null || p.price >= query.minPrice) &&
    (query.maxPrice == null || p.price <= query.maxPrice));
}
function ordered(query: ProductQuery) {
  const rows = matching(query);
  const compareString = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  rows.sort((a, b) => {
    if (query.sort === 'price-asc') return a.price - b.price || compareString(a.id, b.id);
    if (query.sort === 'price-desc') return b.price - a.price || compareString(b.id, a.id);
    if (query.sort === 'name-asc') return compareString(a.name, b.name) || compareString(a.id, b.id);
    if (query.sort === 'name-desc') return compareString(b.name, a.name) || compareString(b.id, a.id);
    return compareString(b.id, a.id); // identical createdAt deliberately exercises ties
  });
  return rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
}
function quantile(values: number[], percentile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)].toFixed(3));
}

type Sample = { index: number; scenario: string; elapsedMs: number; returnedRows: number; total: number };
type Evidence = {
  measuredAt: string;
  fixture: { database: string; prefix: string; syntheticProducts: number; activeProducts: number; availableProducts: number; deletedProducts?: number; remainingOwnProducts?: number };
  workload: { concurrentReads: number; databaseStatementsPerRead: number; poolMax: number; pageSize: number; warmedScenarios: number; transport: string; sourceModule: string };
  timings: { batchElapsedMs: number; p50Ms: number; p95Ms: number; p99Ms: number; minMs: number; maxMs: number };
  checks: string[];
  samples: Sample[];
  limitations: string[];
};
let evidence: Evidence | undefined;

describe.skipIf(!auditUrl)('isolated PostgreSQL: public catalog correctness and local scale', () => {
  beforeAll(async () => {
    for (let offset = 0; offset < fixture.length; offset += 1_000) {
      await db().product.createMany({ data: fixture.slice(offset, offset + 1_000) });
    }
    expect(await db().product.count({ where: { category } })).toBe(5_000);
  }, 60_000);

  afterAll(async () => {
    try {
      if (state.db && auditUrl) {
        // Only identifiers created by this invocation; never reseed/truncate shared data.
        const deleted = await db().product.deleteMany({ where: { id: { in: fixture.map((p) => p.id) }, category } });
        const remaining = await db().product.count({ where: { category } });
        if (evidence) {
          evidence.fixture.deletedProducts = deleted.count;
          evidence.fixture.remainingOwnProducts = remaining;
          const output = path.resolve('docs/auditoria-2026-10-04/evidencia/escala-catalogo-local.json');
          await mkdir(path.dirname(output), { recursive: true });
          await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
        }
        expect(remaining).toBe(0);
      }
    } finally {
      await state.db?.$disconnect();
      await state.pool?.end();
    }
  }, 60_000);

  it('preserves page size, totals on empty pages, active/stock filters, money, freeShipping and stable ordering', async () => {
    for (const { query } of scenarios) {
      const result = await queryCatalogProducts(query);
      const expected = matching(query);
      expect(result.total).toBe(expected.length);
      expect(result.items).toHaveLength(Math.max(0, Math.min(24, expected.length - (query.page - 1) * 24)));
      for (const item of result.items) {
        const original = byId.get(item.id)!;
        expect(original).toBeDefined();
        expect(original.isActive).toBe(true);
        if (!query.includeOutOfStock) expect(item.stock).toBeGreaterThan(0);
        expect(item.stock).toBe(original.stock);
        expect(item.freeShipping).toBe(original.freeShipping);
        expect(item.price).toBe(original.price);
        expect(item.originalPrice).toBe(original.originalPrice);
        expect(item.category).toBe(category);
        if (query.brand) expect(item.brand).toBe(query.brand);
      }
      expect(result.facets.categories).toEqual([category]);
      expect(result.facets.brands).toEqual([...new Set(matching(query, true).map((p) => p.brand))].sort());
      if (query.sort !== 'relevance') expect(result.items.map((p) => p.id)).toEqual(ordered(query).map((p) => p.id));
      const replay = await queryCatalogProducts(query);
      expect(replay.items.map((p) => p.id)).toEqual(result.items.map((p) => p.id));
    }
    const unavailableQuery = { ...baseQuery, brand: '不存在' };
    expect((await queryCatalogProducts(unavailableQuery)).total).toBe(0);
    expect((await queryCatalogProducts({ ...baseQuery, q: 'm' })).items).toEqual([]);
  }, 60_000);

  it('completes fifty simultaneous real catalog reads with a ten-connection pool and records measured percentiles', async () => {
    const baselines = await Promise.all(scenarios.map(({ query }) => queryCatalogProducts(query)));
    const started = performance.now();
    const samples = await Promise.all(Array.from({ length: 50 }, async (_, index): Promise<Sample> => {
      const scenarioIndex = index % scenarios.length;
      const scenario = scenarios[scenarioIndex];
      const requestStarted = performance.now();
      const result = await queryCatalogProducts(scenario.query);
      const elapsedMs = performance.now() - requestStarted;
      expect(result).toEqual(baselines[scenarioIndex]);
      return { index, scenario: scenario.name, elapsedMs: Number(elapsedMs.toFixed(3)), returnedRows: result.items.length, total: result.total };
    }));
    const elapsedMs = samples.map((s) => s.elapsedMs);
    evidence = {
      measuredAt: new Date().toISOString(),
      fixture: { database: '127.0.0.1:55439/limpio_audit_test', prefix, syntheticProducts: fixture.length, activeProducts: fixture.filter((p) => p.isActive).length, availableProducts: fixture.filter((p) => p.isActive && p.stock > 0).length },
      workload: { concurrentReads: samples.length, databaseStatementsPerRead: 3, poolMax: 10, pageSize: 24, warmedScenarios: scenarios.length, transport: 'Direct local module calls and PostgreSQL TCP; no HTTP', sourceModule: 'lib/products/query-products.ts' },
      timings: { batchElapsedMs: Number((performance.now() - started).toFixed(3)), p50Ms: quantile(elapsedMs, 0.50), p95Ms: quantile(elapsedMs, 0.95), p99Ms: quantile(elapsedMs, 0.99), minMs: Number(Math.min(...elapsedMs).toFixed(3)), maxMs: Number(Math.max(...elapsedMs).toFixed(3)) },
      checks: ['24 rows per full page', 'total retained beyond final page', 'inactive products always excluded', 'out-of-stock excluded unless requested', 'brand and monetary filters', 'freeShipping snapshot and decimal monetary mapping', 'stable tied order and non-overlapping pages', 'literal category fixture isolation', 'fifty concurrent results match warmed baselines'],
      samples,
      limitations: ['Local synthetic fixture; this does not certify production VPS capacity.', 'No HTTP, rendering, authentication, media transfer, browser, CDN or external provider load.', 'Warm scenario baselines precede the measured batch; no cold-cache claim.', 'Each read issues three real SQL statements; timings include connection-pool queuing.', 'No writes run concurrently during measurements; this does not prove snapshot consistency while the catalog changes.', 'Nearest-rank percentiles over fifty samples; p99 is the maximum sample.'],
    };
    expect(samples).toHaveLength(50);
    expect(evidence.timings.p95Ms).toBeGreaterThan(0);
  }, 60_000);
});
