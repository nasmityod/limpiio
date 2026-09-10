'use server';

/**
 * adminDashboardActions.ts (PRD-083 / PRD-225)
 * KPIs agregados para el dashboard admin calculados en el servidor.
 *
 * Antes el dashboard cargaba el catálogo completo vía ProductContext (PRD-083)
 * y TODOS los pedidos con PII vía GET /api/orders (PRD-225 — mismo OOM que
 * PRD-195). Aquí solo viajan contadores, sumas y dos listas mínimas.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermissionAction } from '@/lib/admin-access-server';
import {
  VALIDATED_REVENUE_STATUSES,
  type ValidatedRevenueTotals,
} from '@/lib/analytics-orders';
import type { OrderStatus } from '@/lib/definitions';
import { d, dn } from '@/lib/decimal';
import { roundMoney2 } from '@/lib/exchange-rate';
import { parseTimestamp, BACKUP_LAST_SUCCESS_KEY } from '@/lib/operations-health';

const LOW_STOCK_THRESHOLD = 3;

export interface DashboardRecentOrder {
  id:           string;
  orderNumber:  number;
  customerName: string;
  createdAt:    string;
  status:       string;
  total:        number;
  exchangeRateUsdBs: number | null;
}

export interface DashboardLowStockProduct {
  id:       string;
  name:     string;
  category: string;
  stock:    number;
}

export interface AdminDashboardData {
  totalProducts:   number;
  totalCategories: number;
  lowStock:        number;
  outOfStock:      number;
  lowStockProducts: DashboardLowStockProduct[];
  totalOrders:     number;
  pendingOrders:   number;
  /** ADM-05: desglose del KPI "por verificar" — pagos Binance pendientes. */
  binancePendingOrders: number;
  inProcessOrders: number;
  shippedOrders:   number;
  /** Ingresos validados expresados en USD (moneda principal del panel). */
  revenueUsd: number;
  /** Suma en Bs de los pedidos validados con tasa congelada (excluye legado USD). */
  revenueBs: number;
  /** True si hay pedidos validados legado guardados en USD (sin equivalente Bs). */
  hasLegacyUsdRevenue: boolean;
  recentOrders:    DashboardRecentOrder[];
  /** ADM-13 / PRD-039: false si AppConfig no tiene store_settings — el checkout
   *  estaría mostrando DEFAULT_SETTINGS sin datos bancarios reales. */
  bankingConfigured: boolean;
  /** INF-05 / ADM-12: fecha de la tasa BCV vigente (ISO) y si está desactualizada. */
  bcvRateDate: string | null;
  bcvStale: boolean;
  /** ADM-12: última corrida exitosa del backup (ISO), si el script la registró. */
  lastBackupAt: string | null;
}

/** La tasa BCV se considera vieja si su fecha tiene más de 2 días hábiles (~72 h). */
const BCV_STALE_MS = 72 * 60 * 60 * 1000;

const VALIDATED_STATUS_LIST = Prisma.join(VALIDATED_REVENUE_STATUSES);

/**
 * Ingresos validados agregados en PostgreSQL.
 *
 * ANTES (RC-07 de la auditoría de rendimiento): el dashboard hacía
 *
 *     prisma.order.findMany({
 *       where: { status: { in: VALIDATED_REVENUE_STATUSES } },
 *       select: { total: true, exchangeRateUsdBs: true },
 *     })
 *
 * y sumaba en Node. Con 20 000 pedidos ya son ~10 000 filas y ~500 KB movidos
 * desde Postgres en cada carga del dashboard, sólo para producir tres números.
 * Con 100 000 pedidos el patrón es una bomba de memoria (mismo fallo que el
 * PRD-195/225 que este archivo dice haber cerrado).
 *
 * AHORA: una sola fila agregada. La semántica se preserva literalmente respecto
 * de `accumulateValidatedRevenue()` (lib/analytics-orders.ts), que sigue siendo
 * la implementación de referencia usada por los tests de equivalencia:
 *
 *  • Pedido CON tasa (> 0): aporta ROUND(total / tasa, 2) a los ingresos USD y
 *    `total` completo a los ingresos Bs. El redondeo es POR PEDIDO, igual que
 *    en el bucle original — no se redondea sólo al final.
 *  • Pedido SIN tasa (legado): `total` ya está en USD; aporta tal cual a USD,
 *    nada a Bs, y marca `hasLegacyUsdRevenue`.
 *  • Estados válidos: exactamente VALIDATED_REVENUE_STATUSES.
 *
 * `ROUND(numeric, 2)` de PostgreSQL redondea medio hacia arriba para valores
 * positivos, igual que `Math.round(n * 100) / 100`, y opera sobre aritmética
 * decimal exacta en lugar de coma flotante binaria.
 */
async function fetchValidatedRevenueTotals(): Promise<ValidatedRevenueTotals> {
  const rows = await prisma.$queryRaw<
    Array<{
      revenue_usd: string | number | null;
      revenue_bs: string | number | null;
      legacy_count: number | bigint;
    }>
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
    WHERE o.status IN (${VALIDATED_STATUS_LIST})
  `);

  const row = rows[0];
  return {
    revenueUsd: roundMoney2(Number(row?.revenue_usd ?? 0)),
    revenueBs: roundMoney2(Number(row?.revenue_bs ?? 0)),
    hasLegacyUsdRevenue: Number(row?.legacy_count ?? 0) > 0,
  };
}

/** Número de categorías distintas presentes en el catálogo (un solo escalar). */
async function countDistinctProductCategories(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(
    Prisma.sql`SELECT COUNT(DISTINCT category) AS total FROM "Product"`,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  await requirePermissionAction('DASHBOARD');

  const [
    totalProducts,
    totalCategories,
    lowStock,
    outOfStock,
    lowStockProducts,
    totalOrders,
    pendingOrders,
    binancePendingOrders,
    inProcessOrders,
    shippedOrders,
    revenueTotals,
    recentOrders,
    opsConfigRows,
  ] = await Promise.all([
    prisma.product.count(),
    // Antes: findMany({ distinct: ['category'] }) sólo para hacer `.length`.
    // Con muchas categorías traía una fila por cada una; ahora es un escalar.
    countDistinctProductCategories(),
    prisma.product.count({ where: { stock: { gt: 0, lt: LOW_STOCK_THRESHOLD } } }),
    prisma.product.count({ where: { stock: 0 } }),
    prisma.product.findMany({
      where:   { stock: { lt: LOW_STOCK_THRESHOLD } },
      orderBy: [{ stock: 'asc' }, { createdAt: 'desc' }],
      take:    10,
      select:  { id: true, name: true, category: true, stock: true },
    }),
    prisma.order.count(),
    prisma.order.count({
      where: {
        status: {
          in: ['Pendiente', 'Pendiente verificación Binance'] satisfies OrderStatus[],
        },
      },
    }),
    prisma.order.count({
      where: { status: 'Pendiente verificación Binance' satisfies OrderStatus },
    }),
    prisma.order.count({ where: { status: 'En Proceso' satisfies OrderStatus } }),
    prisma.order.count({ where: { status: 'Enviado' satisfies OrderStatus } }),
    fetchValidatedRevenueTotals(),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take:    8,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        createdAt: true,
        status: true,
        total: true,
        exchangeRateUsdBs: true,
      },
    }),
    prisma.appConfig.findMany({
      where: {
        key: { in: ['store_settings', 'exchange_rate_bcv_date', 'backup_last_success_at'] },
      },
      select: { key: true, value: true },
    }),
  ]);

  const { revenueUsd, revenueBs, hasLegacyUsdRevenue } = revenueTotals;

  const opsMap = new Map(opsConfigRows.map((r) => [r.key, r.value]));
  const bankingConfigured = opsMap.has('store_settings');
  const bcvRateDateRaw = opsMap.get('exchange_rate_bcv_date') ?? null;
  const bcvRateDateMs = bcvRateDateRaw ? Date.parse(bcvRateDateRaw) : NaN;
  const bcvRateDate = Number.isFinite(bcvRateDateMs)
    ? new Date(bcvRateDateMs).toISOString()
    : null;
  const bcvStale = bcvRateDate == null || Date.now() - bcvRateDateMs > BCV_STALE_MS;
  const lastBackupRaw = opsMap.get(BACKUP_LAST_SUCCESS_KEY) ?? null;
  const lastBackupAt = parseTimestamp(lastBackupRaw);

  return {
    totalProducts,
    totalCategories,
    lowStock,
    outOfStock,
    lowStockProducts,
    totalOrders,
    pendingOrders,
    binancePendingOrders,
    inProcessOrders,
    shippedOrders,
    revenueUsd,
    revenueBs,
    hasLegacyUsdRevenue,
    bankingConfigured,
    bcvRateDate,
    bcvStale,
    lastBackupAt,
    recentOrders: recentOrders.map((o) => ({
      id:           o.id,
      orderNumber:  o.orderNumber,
      customerName: o.customerName,
      createdAt:    o.createdAt.toISOString(),
      status:       o.status,
      total:        d(o.total),
      exchangeRateUsdBs: dn(o.exchangeRateUsdBs),
    })),
  };
}
