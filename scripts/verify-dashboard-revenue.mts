/**
 * Verificación de equivalencia de los ingresos del dashboard (solo LECTURA).
 *
 * Compara, contra una base de datos real:
 *   ANTES  — `prisma.order.findMany` de todos los pedidos validados + suma en
 *            Node (`accumulateValidatedRevenue`, la implementación original).
 *   AHORA  — la agregación en PostgreSQL que usa `getAdminDashboardData()`.
 *
 * Además informa el tiempo y los bytes transferidos por cada camino, que es la
 * razón del cambio (ver docs/AUDITORIA-RENDIMIENTO-PANEL-ADMIN.md, RC-07).
 *
 * Uso:
 *   npm run verify:dashboard-revenue
 *   DATABASE_URL=… DIRECT_URL=… npx tsx scripts/verify-dashboard-revenue.mts
 *
 * No escribe nada. Sale con código 1 si los tres valores no coinciden.
 */
import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { VALIDATED_REVENUE_STATUSES, accumulateValidatedRevenue } from '../lib/analytics-orders';
import { d, dn } from '../lib/decimal';
import { roundMoney2 } from '../lib/exchange-rate';

const VALIDATED = Prisma.join(VALIDATED_REVENUE_STATUSES);

// ── ANTES ────────────────────────────────────────────────────────────────────
const tBefore = process.hrtime.bigint();
const rows = await prisma.order.findMany({
  where: { status: { in: [...VALIDATED_REVENUE_STATUSES] } },
  select: { total: true, exchangeRateUsdBs: true },
});
const before = accumulateValidatedRevenue(
  rows.map((r) => ({ total: d(r.total), exchangeRateUsdBs: dn(r.exchangeRateUsdBs) })),
);
const msBefore = Number(process.hrtime.bigint() - tBefore) / 1e6;
const bytesBefore = Buffer.byteLength(JSON.stringify(rows));

// ── AHORA ────────────────────────────────────────────────────────────────────
const tAfter = process.hrtime.bigint();
const agg = await prisma.$queryRaw<
  Array<{ revenue_usd: number; revenue_bs: number; legacy_count: number }>
>(Prisma.sql`
  SELECT
    COALESCE(SUM(
      CASE
        WHEN o."exchangeRateUsdBs" IS NOT NULL AND o."exchangeRateUsdBs" > 0
          THEN ROUND(o."total" / o."exchangeRateUsdBs", 2)
        ELSE o."total"
      END
    ), 0)::float8 AS revenue_usd,
    COALESCE(SUM(
      CASE
        WHEN o."exchangeRateUsdBs" IS NOT NULL AND o."exchangeRateUsdBs" > 0
          THEN o."total"
        ELSE 0
      END
    ), 0)::float8 AS revenue_bs,
    COUNT(*) FILTER (
      WHERE o."exchangeRateUsdBs" IS NULL OR o."exchangeRateUsdBs" <= 0
    )::int AS legacy_count
  FROM "Order" o
  WHERE o.status IN (${VALIDATED})
`);
const after = {
  revenueUsd: roundMoney2(Number(agg[0]?.revenue_usd ?? 0)),
  revenueBs: roundMoney2(Number(agg[0]?.revenue_bs ?? 0)),
  hasLegacyUsdRevenue: Number(agg[0]?.legacy_count ?? 0) > 0,
};
const msAfter = Number(process.hrtime.bigint() - tAfter) / 1e6;
const bytesAfter = Buffer.byteLength(JSON.stringify(agg));

// ── Informe ──────────────────────────────────────────────────────────────────
console.log(`pedidos validados: ${rows.length}`);
console.log(
  `ANTES   usd=${before.revenueUsd} bs=${before.revenueBs} legado=${before.hasLegacyUsdRevenue}` +
    `  ${msBefore.toFixed(1)} ms · ${bytesBefore} bytes`,
);
console.log(
  `DESPUÉS usd=${after.revenueUsd} bs=${after.revenueBs} legado=${after.hasLegacyUsdRevenue}` +
    `  ${msAfter.toFixed(1)} ms · ${bytesAfter} bytes`,
);

const equal =
  before.revenueUsd === after.revenueUsd &&
  before.revenueBs === after.revenueBs &&
  before.hasLegacyUsdRevenue === after.hasLegacyUsdRevenue;

console.log(equal ? '\n✔ Equivalencia exacta.' : '\n✘ DIFERENCIA detectada.');
if (!equal) {
  console.log(`  Δ usd = ${(after.revenueUsd - before.revenueUsd).toFixed(6)}`);
  console.log(`  Δ bs  = ${(after.revenueBs - before.revenueBs).toFixed(6)}`);
}

await prisma.$disconnect();
process.exit(equal ? 0 : 1);
