import type { Prisma } from '@prisma/client';
import type { Order, OrderStatus } from '@/lib/definitions';
import { roundMoney2 } from '@/lib/exchange-rate';

/**
 * Estados con pago validado (ingresos reales). Excluye pendientes y cancelados.
 * Equivale a PAID + pipeline + COMPLETED en flujo típico.
 */
export const VALIDATED_REVENUE_STATUSES: readonly OrderStatus[] = [
  'En Proceso',
  'Enviado',
  'Entregado',
] as const;

/** Zona horaria fija de la tienda para analítica. No aceptar valores arbitrarios en la API. */
export const ANALYTICS_TIMEZONE = 'America/Caracas' as const;

export const STATS_RANGE_VALUES = ['7d', '30d', '90d', 'year', 'all'] as const;
export type StatsRange = (typeof STATS_RANGE_VALUES)[number];

/** Venezuela (America/Caracas): UTC-4 fijo, sin horario de verano. */
export const CARACAS_UTC_OFFSET_HOURS = 4;

const MS_PER_DAY = 86_400_000;
const CARACAS_OFFSET_MS = CARACAS_UTC_OFFSET_HOURS * 60 * 60 * 1000;

const RANGE_DAY_COUNTS: Record<Exclude<StatsRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  'year': 365,
};

export interface StatsPeriodBounds {
  range: StatsRange;
  /** Medianoche Caracas del primer día del período. Null si range=all. */
  start: Date | null;
  /** Fin del período (ahora). */
  end: Date;
  /** Inicio del período anterior inmediato de igual duración. Null si range=all. */
  previousStart: Date | null;
  /** Fin del período anterior (= start del actual). Null si range=all. */
  previousEnd: Date | null;
}

/**
 * Convierte un instante UTC al inicio de su día calendario en Caracas (UTC-4 fijo).
 * Ej.: 2026-07-10T03:59:59Z → 2026-07-09T04:00:00Z; 2026-07-10T04:00:00Z → 2026-07-10T04:00:00Z.
 */
export function caracasDayStartUtc(instant: Date): Date {
  const shiftedMs = instant.getTime() - CARACAS_OFFSET_MS;
  const dayFloorMs = Math.floor(shiftedMs / MS_PER_DAY) * MS_PER_DAY;
  return new Date(dayFloorMs + CARACAS_OFFSET_MS);
}

/** Clave YYYY-MM-DD del día calendario Caracas para un instante UTC. */
export function formatCaracasDateKey(instant: Date): string {
  const shifted = new Date(instant.getTime() - CARACAS_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calcula los límites del período actual y el anterior inmediato.
 * Para 7d: hoy + 6 días previos; end = now. Previous = mismo span justo antes de start.
 */
export function computeStatsPeriodBounds(
  range: StatsRange,
  now: Date = new Date(),
): StatsPeriodBounds {
  if (range === 'all') {
    return {
      range,
      start: null,
      end: now,
      previousStart: null,
      previousEnd: null,
    };
  }

  const days = RANGE_DAY_COUNTS[range];
  const todayStart = caracasDayStartUtc(now);
  const start = new Date(todayStart.getTime() - (days - 1) * MS_PER_DAY);
  const durationMs = now.getTime() - start.getTime();

  return {
    range,
    start,
    end: now,
    previousStart: new Date(start.getTime() - durationMs),
    previousEnd: start,
  };
}

export function orderCountsTowardValidatedRevenue(status: OrderStatus): boolean {
  return (VALIDATED_REVENUE_STATUSES as readonly string[]).includes(status);
}

/**
 * Fecha usada para agrupar ventas validadas por período: día de pago real si existe; si no, creado (legado).
 */
export function orderAnalyticsPeriodDate(order: {
  createdAt: Date | string;
  paidAt?: Date | string | null;
}): Date {
  if (order.paidAt) return new Date(order.paidAt);
  return new Date(order.createdAt);
}

/**
 * Total almacenado en el pedido (Bs con tasa registrada al comprar o USD legado). No aplicar tasa actual del sitio.
 */
export function orderStoredRevenueTotal(order: Pick<Order, 'total'>): number {
  return order.total;
}

/**
 * Convierte el total almacenado en el pedido a su equivalente en USD.
 * Si el pedido tiene exchangeRateUsdBs (pedido moderno en Bs), divide por la tasa.
 * Si no (legado), el total ya está en USD.
 */
export function storedTotalToUsd(totalStored: number, exchangeRate: number | null): number {
  if (exchangeRate != null && exchangeRate > 0) {
    return roundMoney2(totalStored / exchangeRate);
  }
  return roundMoney2(totalStored);
}

/** Métricas operativas: pedidos creados en el período (orderCount, byStatus, cancelación). */
export function createdAtPeriodWhere(bounds: StatsPeriodBounds): Prisma.OrderWhereInput {
  if (bounds.start === null) return {};
  return {
    createdAt: {
      gte: bounds.start,
      lte: bounds.end,
    },
  };
}

/**
 * Métricas de ingreso: cobro validado en el período por paidAt.
 * Legado sin paidAt: solo si status validado y createdAt cae en el período.
 */
export function revenuePeriodWhere(bounds: StatsPeriodBounds): Prisma.OrderWhereInput {
  const statusFilter: Prisma.OrderWhereInput = {
    status: { in: [...VALIDATED_REVENUE_STATUSES] },
  };

  if (bounds.start === null) {
    return statusFilter;
  }

  return {
    ...statusFilter,
    OR: [
      {
        paidAt: {
          gte: bounds.start,
          lte: bounds.end,
        },
      },
      {
        paidAt: null,
        createdAt: {
          gte: bounds.start,
          lte: bounds.end,
        },
      },
    ],
  };
}

// ── Ingresos validados del dashboard ────────────────────────────────────────

export interface ValidatedRevenueRow {
  /** Total tal como está guardado: Bs si hay tasa, USD si es legado. */
  total: number;
  /** Tasa Bs/USD congelada al crear el pedido. Null/0 = pedido legado en USD. */
  exchangeRateUsdBs: number | null;
}

export interface ValidatedRevenueTotals {
  /** Ingresos validados expresados en USD. */
  revenueUsd: number;
  /** Suma en Bs de los pedidos con tasa congelada (excluye legado USD). */
  revenueBs: number;
  /** True si hay pedidos validados legado guardados en USD (sin equivalente Bs). */
  hasLegacyUsdRevenue: boolean;
}

/**
 * Implementación de REFERENCIA de los ingresos del dashboard, fila a fila.
 *
 * Es exactamente lo que hacía `getAdminDashboardData()` en memoria después de
 * traerse TODOS los pedidos validados con `findMany`. Se conserva exportada
 * porque:
 *   1. documenta sin ambigüedad la semántica que debe respetar la agregación
 *      en SQL (qué se redondea, cuándo, y qué cuenta como legado); y
 *   2. los tests de equivalencia la comparan contra el resultado agregado.
 *
 * No usarla para calcular el KPI en producción: obliga a materializar N filas.
 */
export function accumulateValidatedRevenue(
  rows: readonly ValidatedRevenueRow[],
): ValidatedRevenueTotals {
  let revenueUsd = 0;
  let revenueBs = 0;
  let hasLegacyUsdRevenue = false;

  for (const row of rows) {
    const total = row.total;
    const rate = row.exchangeRateUsdBs;
    if (rate != null && rate > 0) {
      revenueUsd += roundMoney2(total / rate); // total en Bs → USD
      revenueBs += total;                       // Bs congelado
    } else {
      revenueUsd += total;                      // legado: total ya está en USD
      hasLegacyUsdRevenue = true;
    }
  }

  return {
    revenueUsd: roundMoney2(revenueUsd),
    revenueBs: roundMoney2(revenueBs),
    hasLegacyUsdRevenue,
  };
}
