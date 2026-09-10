import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { logError } from '@/lib/safe-logger';
import { d } from '@/lib/decimal';
import { roundMoney2 } from '@/lib/exchange-rate';
import {
  ANALYTICS_TIMEZONE,
  STATS_RANGE_VALUES,
  VALIDATED_REVENUE_STATUSES,
  computeStatsPeriodBounds,
  createdAtPeriodWhere,
  formatCaracasDateKey,
  orderAnalyticsPeriodDate,
  orderCountsTowardValidatedRevenue,
  storedTotalToUsd,
  type StatsPeriodBounds,
  type StatsRange,
} from '@/lib/analytics-orders';

// ── Zod validation ──────────────────────────────────────────────────────────

const RangeSchema = z.enum(STATS_RANGE_VALUES);

const QuerySchema = z.object({
  range: RangeSchema.default('30d'),
  tz: z.literal(ANALYTICS_TIMEZONE).default(ANALYTICS_TIMEZONE),
});

// ── DTO types ───────────────────────────────────────────────────────────────

export interface StatsSummary {
  revenue: number;
  orderCount: number;
  paidOrderCount: number;
  averageTicket: number;
  cancellationRate: number;
}

export interface DailyStats {
  date: string;
  revenue: number;
  orders: number;
}

export interface ByStatusStats {
  status: string;
  count: number;
}

export interface ByPaymentStats {
  method: string;
  count: number;
  revenue: number;
}

export interface TopProductStats {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface AdminStatsDTO {
  summary: StatsSummary;
  previousSummary: StatsSummary | null;
  daily: DailyStats[];
  byStatus: ByStatusStats[];
  byPayment: ByPaymentStats[];
  topProducts: TopProductStats[];
}

// ── SQL helpers ───────────────────────────────────────────────────────────────

const VALIDATED_STATUS_LIST = Prisma.join(VALIDATED_REVENUE_STATUSES);

function usdRevenueExpr(tableAlias: string): Prisma.Sql {
  return Prisma.sql`
    CASE
      WHEN ${Prisma.raw(`${tableAlias}."exchangeRateUsdBs"`)} IS NOT NULL
        AND ${Prisma.raw(`${tableAlias}."exchangeRateUsdBs"`)} > 0
      THEN ${Prisma.raw(`${tableAlias}."total"`)} / ${Prisma.raw(`${tableAlias}."exchangeRateUsdBs"`)}
      ELSE ${Prisma.raw(`${tableAlias}."total"`)}
    END
  `;
}

function itemUsdRevenueExpr(): Prisma.Sql {
  return Prisma.sql`
    CASE
      WHEN o."exchangeRateUsdBs" IS NOT NULL AND o."exchangeRateUsdBs" > 0
      THEN (oi.price * oi.quantity) / o."exchangeRateUsdBs"
      ELSE oi.price * oi.quantity
    END
  `;
}

function revenueDateFilterSql(bounds: StatsPeriodBounds, tableAlias: string): Prisma.Sql {
  if (bounds.start === null) {
    return Prisma.sql`TRUE`;
  }

  const paidAt = Prisma.raw(`${tableAlias}."paidAt"`);
  const createdAt = Prisma.raw(`${tableAlias}."createdAt"`);

  return Prisma.sql`
    (
      (${paidAt} >= ${bounds.start} AND ${paidAt} <= ${bounds.end})
      OR (
        ${paidAt} IS NULL
        AND ${createdAt} >= ${bounds.start}
        AND ${createdAt} <= ${bounds.end}
      )
    )
  `;
}

function caracasDateExpr(tableAlias: string): Prisma.Sql {
  const ts = Prisma.raw(`COALESCE(${tableAlias}."paidAt", ${tableAlias}."createdAt")`);
  return Prisma.sql`TO_CHAR((${ts} AT TIME ZONE 'UTC') - INTERVAL '4 hours', 'YYYY-MM-DD')`;
}

// ── Fetchers ────────────────────────────────────────────────────────────────

interface OperationalSnapshot {
  orderCount: number;
  byStatus: ByStatusStats[];
  cancelledCount: number;
  validatedCreatedCount: number;
}

async function fetchOperationalSnapshot(bounds: StatsPeriodBounds): Promise<OperationalSnapshot> {
  const where = createdAtPeriodWhere(bounds);

  const [orderCount, statusGroups, cancelledCount, validatedCreatedCount] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.order.count({
      where: {
        ...where,
        status: 'Cancelado',
      },
    }),
    prisma.order.count({
      where: {
        ...where,
        status: { in: [...VALIDATED_REVENUE_STATUSES] },
      },
    }),
  ]);

  const byStatus = statusGroups
    .map((row) => ({
      status: row.status,
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    orderCount,
    byStatus,
    cancelledCount,
    validatedCreatedCount,
  };
}

interface RevenueSnapshot {
  revenue: number;
  paidOrderCount: number;
}

async function fetchRevenueSnapshot(bounds: StatsPeriodBounds): Promise<RevenueSnapshot> {
  const rows = await prisma.$queryRaw<Array<{ revenue: number | string | null; paid_count: number | bigint }>>(
    Prisma.sql`
      SELECT
        COALESCE(SUM(${usdRevenueExpr('o')}), 0)::float8 AS revenue,
        COUNT(*)::int AS paid_count
      FROM "Order" o
      WHERE o.status IN (${VALIDATED_STATUS_LIST})
        AND ${revenueDateFilterSql(bounds, 'o')}
    `,
  );

  const row = rows[0];
  const revenue = roundMoney2(Number(row?.revenue ?? 0));
  const paidOrderCount = Number(row?.paid_count ?? 0);

  return { revenue, paidOrderCount };
}

async function fetchDailyStats(bounds: StatsPeriodBounds): Promise<DailyStats[]> {
  const rows = await prisma.$queryRaw<Array<{ date: string; revenue: number | string | null; orders: number | bigint }>>(
    Prisma.sql`
      SELECT
        ${caracasDateExpr('o')} AS date,
        COUNT(*)::int AS orders,
        COALESCE(SUM(${usdRevenueExpr('o')}), 0)::float8 AS revenue
      FROM "Order" o
      WHERE o.status IN (${VALIDATED_STATUS_LIST})
        AND ${revenueDateFilterSql(bounds, 'o')}
      GROUP BY 1
      ORDER BY 1
    `,
  );

  return rows.map((row) => ({
    date: row.date,
    orders: Number(row.orders),
    revenue: roundMoney2(Number(row.revenue ?? 0)),
  }));
}

async function fetchByPayment(bounds: StatsPeriodBounds): Promise<ByPaymentStats[]> {
  const rows = await prisma.$queryRaw<Array<{ method: string; count: number | bigint; revenue: number | string | null }>>(
    Prisma.sql`
      SELECT
        COALESCE(NULLIF(o."paymentMethod", ''), 'Sin método') AS method,
        COUNT(*)::int AS count,
        COALESCE(SUM(${usdRevenueExpr('o')}), 0)::float8 AS revenue
      FROM "Order" o
      WHERE o.status IN (${VALIDATED_STATUS_LIST})
        AND ${revenueDateFilterSql(bounds, 'o')}
      GROUP BY 1
      ORDER BY revenue DESC
    `,
  );

  return rows.map((row) => ({
    method: row.method,
    count: Number(row.count),
    revenue: roundMoney2(Number(row.revenue ?? 0)),
  }));
}

async function fetchTopProducts(bounds: StatsPeriodBounds, take: number): Promise<TopProductStats[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      productId: string;
      name: string;
      quantity: number | bigint;
      revenue: number | string | null;
    }>
  >(
    Prisma.sql`
      SELECT
        oi."productId" AS "productId",
        MAX(oi."productName") AS name,
        SUM(oi.quantity)::int AS quantity,
        COALESCE(SUM(${itemUsdRevenueExpr()}), 0)::float8 AS revenue
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON oi."orderId" = o.id
      WHERE o.status IN (${VALIDATED_STATUS_LIST})
        AND ${revenueDateFilterSql(bounds, 'o')}
      GROUP BY oi."productId"
      ORDER BY revenue DESC
      LIMIT ${take}
    `,
  );

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    quantity: Number(row.quantity),
    revenue: roundMoney2(Number(row.revenue ?? 0)),
  }));
}

function buildSummary(
  operational: OperationalSnapshot,
  revenue: RevenueSnapshot,
): StatsSummary {
  const averageTicket =
    revenue.paidOrderCount > 0
      ? roundMoney2(revenue.revenue / revenue.paidOrderCount)
      : 0;

  const cancelBase = operational.validatedCreatedCount + operational.cancelledCount;
  const cancellationRate =
    cancelBase > 0
      ? roundMoney2((operational.cancelledCount / cancelBase) * 100)
      : 0;

  return {
    revenue: revenue.revenue,
    orderCount: operational.orderCount,
    paidOrderCount: revenue.paidOrderCount,
    averageTicket,
    cancellationRate,
  };
}

async function buildStatsPayload(bounds: StatsPeriodBounds): Promise<{
  summary: StatsSummary;
  daily: DailyStats[];
  byStatus: ByStatusStats[];
  byPayment: ByPaymentStats[];
  topProducts: TopProductStats[];
}> {
  const [operational, revenue, daily, byPayment, topProducts] = await Promise.all([
    fetchOperationalSnapshot(bounds),
    fetchRevenueSnapshot(bounds),
    fetchDailyStats(bounds),
    fetchByPayment(bounds),
    fetchTopProducts(bounds, 20),
  ]);

  return {
    summary: buildSummary(operational, revenue),
    daily,
    byStatus: operational.byStatus,
    byPayment,
    topProducts,
  };
}

// ── Pure helpers (testable) ─────────────────────────────────────────────────

interface OrderRow {
  id: string;
  total: unknown;
  exchangeRateUsdBs: unknown;
  status: string;
  paymentMethod: string;
  paidAt: Date | null;
  createdAt: Date;
}

interface OrderItemRow {
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: unknown;
}

function decimalToNumber(val: unknown): number {
  return d(val as Parameters<typeof d>[0]);
}

function isValidRevenueStatus(status: string): boolean {
  return orderCountsTowardValidatedRevenue(status as (typeof VALIDATED_REVENUE_STATUSES)[number]);
}

function periodDate(order: { paidAt: Date | null; createdAt: Date }): Date {
  return orderAnalyticsPeriodDate({
    paidAt: order.paidAt,
    createdAt: order.createdAt,
  });
}

function orderInRevenuePeriod(
  order: OrderRow,
  bounds: StatsPeriodBounds,
): boolean {
  if (!isValidRevenueStatus(order.status)) return false;
  if (bounds.start === null) return true;

  const eventDate = periodDate(order);
  return eventDate >= bounds.start && eventDate <= bounds.end;
}

function orderInCreatedPeriod(
  order: OrderRow,
  bounds: StatsPeriodBounds,
): boolean {
  if (bounds.start === null) return true;
  return order.createdAt >= bounds.start && order.createdAt <= bounds.end;
}

function buildPeriodStats(
  orders: OrderRow[],
  items: OrderItemRow[],
  bounds: StatsPeriodBounds,
): {
  validatedOrders: OrderRow[];
  allPeriodOrders: OrderRow[];
  items: Map<string, OrderItemRow[]>;
} {
  const allPeriodOrders = orders.filter((o) => orderInCreatedPeriod(o, bounds));
  const validatedOrders = orders.filter((o) => orderInRevenuePeriod(o, bounds));
  const validatedIds = new Set(validatedOrders.map((o) => o.id));

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    if (!validatedIds.has(item.orderId)) continue;
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return {
    validatedOrders,
    allPeriodOrders,
    items: itemsByOrder,
  };
}

function toSummary(stats: {
  validatedOrders: OrderRow[];
  allPeriodOrders: OrderRow[];
}): StatsSummary {
  const revenue = stats.validatedOrders.reduce((sum, o) => {
    const totalNum = decimalToNumber(o.total);
    const rate = decimalToNumber(o.exchangeRateUsdBs) || 0;
    const rateNonNull = rate > 0 ? rate : null;
    return sum + storedTotalToUsd(totalNum, rateNonNull);
  }, 0);

  const orderCount = stats.allPeriodOrders.length;
  const paidOrderCount = stats.validatedOrders.length;
  const averageTicket = paidOrderCount > 0 ? roundMoney2(revenue / paidOrderCount) : 0;

  const cancelledCount = stats.allPeriodOrders.filter((o) => o.status === 'Cancelado').length;
  const validatedCreatedCount = stats.allPeriodOrders.filter((o) => isValidRevenueStatus(o.status)).length;
  const cancelBase = validatedCreatedCount + cancelledCount;
  const cancellationRate = cancelBase > 0 ? roundMoney2((cancelledCount / cancelBase) * 100) : 0;

  return {
    revenue: roundMoney2(revenue),
    orderCount,
    paidOrderCount,
    averageTicket,
    cancellationRate,
  };
}

function aggregateDaily(orders: OrderRow[], bounds: StatsPeriodBounds): DailyStats[] {
  const map = new Map<string, { revenue: number; orders: number }>();

  for (const o of orders) {
    if (!orderInRevenuePeriod(o, bounds)) continue;

    const key = formatCaracasDateKey(periodDate(o));
    const totalNum = decimalToNumber(o.total);
    const rate = decimalToNumber(o.exchangeRateUsdBs) || 0;
    const rateNonNull = rate > 0 ? rate : null;
    const usd = storedTotalToUsd(totalNum, rateNonNull);

    const cur = map.get(key) ?? { revenue: 0, orders: 0 };
    cur.revenue += usd;
    cur.orders += 1;
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .map(([date, v]) => ({ date, revenue: roundMoney2(v.revenue), orders: v.orders }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateByStatus(orders: OrderRow[], bounds: StatsPeriodBounds): ByStatusStats[] {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (!orderInCreatedPeriod(o, bounds)) continue;
    map.set(o.status, (map.get(o.status) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

function aggregateByPayment(orders: OrderRow[], bounds: StatsPeriodBounds): ByPaymentStats[] {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    if (!orderInRevenuePeriod(o, bounds)) continue;
    const method = o.paymentMethod || 'Sin método';
    const totalNum = decimalToNumber(o.total);
    const rate = decimalToNumber(o.exchangeRateUsdBs) || 0;
    const rateNonNull = rate > 0 ? rate : null;
    const usd = storedTotalToUsd(totalNum, rateNonNull);
    const cur = map.get(method) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += usd;
    map.set(method, cur);
  }
  return Array.from(map.entries())
    .map(([method, v]) => ({ method, count: v.count, revenue: roundMoney2(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

function aggregateTopProducts(
  items: OrderItemRow[],
  orders: OrderRow[],
  bounds: StatsPeriodBounds,
  options: { take: number },
): TopProductStats[] {
  const validatedOrderIds = new Set(
    orders.filter((o) => orderInRevenuePeriod(o, bounds)).map((o) => o.id),
  );

  const rateMap = new Map<string, number | null>();
  for (const o of orders) {
    const rate = decimalToNumber(o.exchangeRateUsdBs);
    rateMap.set(o.id, rate > 0 ? rate : null);
  }

  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const item of items) {
    if (!validatedOrderIds.has(item.orderId)) continue;
    const existing = productMap.get(item.productId) ?? {
      name: item.productName,
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += item.quantity;
    const itemPrice = decimalToNumber(item.price);
    const rate = rateMap.get(item.orderId) ?? null;
    existing.revenue += storedTotalToUsd(itemPrice * item.quantity, rate);
    productMap.set(item.productId, existing);
  }

  return Array.from(productMap.entries())
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      quantity: v.quantity,
      revenue: roundMoney2(v.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, options.take);
}

// ── Route Handler ───────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requirePermission('ANALYTICS');
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const rawRange = searchParams.get('range') ?? '30d';
    const rawTz = searchParams.get('tz') ?? ANALYTICS_TIMEZONE;

    const parsed = QuerySchema.safeParse({ range: rawRange, tz: rawTz });
    if (!parsed.success) {
      const message = parsed.error.issues.some((issue) => issue.path[0] === 'tz')
        ? `Timezone inválida. Valor aceptado: ${ANALYTICS_TIMEZONE}`
        : `Rango inválido. Valores aceptados: ${STATS_RANGE_VALUES.join(', ')}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { range } = parsed.data;
    const bounds = computeStatsPeriodBounds(range as StatsRange);
    const current = await buildStatsPayload(bounds);

    let previousSummary: StatsSummary | null = null;
    if (bounds.previousStart !== null && bounds.previousEnd !== null) {
      const previousBounds: StatsPeriodBounds = {
        range: bounds.range,
        start: bounds.previousStart,
        end: bounds.previousEnd,
        previousStart: null,
        previousEnd: null,
      };
      const previous = await buildStatsPayload(previousBounds);
      previousSummary = previous.summary;
    }

    const dto: AdminStatsDTO = {
      summary: current.summary,
      previousSummary,
      daily: current.daily,
      byStatus: current.byStatus,
      byPayment: current.byPayment,
      topProducts: current.topProducts,
    };

    return NextResponse.json(dto, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    logError('admin_stats_error', err, { route: '/api/admin/stats' });
    return NextResponse.json(
      { error: 'Error al obtener estadísticas.' },
      { status: 500 },
    );
  }
}

// ── Exports for testing ──────────────────────────────────────────────────────

export {
  buildPeriodStats,
  toSummary,
  aggregateDaily,
  aggregateByStatus,
  aggregateByPayment,
  aggregateTopProducts,
  decimalToNumber,
  isValidRevenueStatus,
  periodDate,
  orderInRevenuePeriod,
  orderInCreatedPeriod,
  buildSummary,
};
