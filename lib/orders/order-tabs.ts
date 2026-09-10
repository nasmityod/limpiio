import type { OrderStatus } from '@/lib/definitions';
import type { Prisma } from '@prisma/client';

export type OrderTabKey = 'all' | 'pending' | 'paid' | 'processing' | 'shipped' | 'completed';

export const TAB_ORDER: OrderTabKey[] = [
  'all',
  'pending',
  'paid',
  'processing',
  'shipped',
  'completed',
];

export const TAB_LABELS: Record<OrderTabKey, string> = {
  all: 'Todos',
  pending: 'Pendientes',
  paid: 'Pagados',
  processing: 'En Proceso',
  shipped: 'Enviados',
  completed: 'Completados',
};

const TAB_STATUSES: Record<Exclude<OrderTabKey, 'all'>, OrderStatus[]> = {
  pending: ['Pendiente', 'Pendiente verificación Binance'],
  paid: ['En Proceso', 'Enviado', 'Entregado'],
  processing: ['En Proceso'],
  shipped: ['Enviado'],
  completed: ['Entregado'],
};

export function parseOrderTab(raw: string | null, legacyStatus?: string | null): OrderTabKey {
  if (raw && TAB_ORDER.includes(raw as OrderTabKey)) return raw as OrderTabKey;
  if (
    legacyStatus === 'Pendiente' ||
    legacyStatus === 'Pendiente verificación Binance'
  ) {
    return 'pending';
  }
  return 'all';
}

export function orderMatchesTab(status: OrderStatus, tab: OrderTabKey): boolean {
  if (tab === 'all') return true;
  return TAB_STATUSES[tab].includes(status);
}

/** Filtro Prisma por pestaña; `undefined` = sin filtro de estado. */
export function tabToStatusWhere(tab: OrderTabKey): Prisma.OrderWhereInput | undefined {
  if (tab === 'all') return undefined;
  return { status: { in: TAB_STATUSES[tab] } };
}

export type OrderTabCounts = Record<OrderTabKey, number>;

/** Mapea groupBy de status a contadores de pestañas del panel admin. */
export function computeTabCounts(
  groups: { status: string; _count: { _all: number } }[],
): OrderTabCounts {
  const byStatus = new Map<string, number>();
  let all = 0;
  for (const g of groups) {
    byStatus.set(g.status, g._count._all);
    all += g._count._all;
  }

  const sumStatuses = (statuses: OrderStatus[]) =>
    statuses.reduce((acc, s) => acc + (byStatus.get(s) ?? 0), 0);

  return {
    all,
    pending: sumStatuses(TAB_STATUSES.pending),
    paid: sumStatuses(TAB_STATUSES.paid),
    processing: sumStatuses(TAB_STATUSES.processing),
    shipped: sumStatuses(TAB_STATUSES.shipped),
    completed: sumStatuses(TAB_STATUSES.completed),
  };
}

/** Estados Prisma asociados a una pestaña (para export CSV y filtros server-side). */
export function tabToStatuses(tab: OrderTabKey): OrderStatus[] | undefined {
  if (tab === 'all') return undefined;
  return TAB_STATUSES[tab];
}
