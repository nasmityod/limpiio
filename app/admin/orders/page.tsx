'use client';

import { Suspense, useEffect, useCallback, useState, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Order, OrderStatus } from '@/lib/definitions';
import {
  TAB_LABELS,
  TAB_ORDER,
  parseOrderTab,
  type OrderTabCounts,
  type OrderTabKey,
} from '@/lib/orders/order-tabs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { DualOrderMoney } from '@/components/order/DualOrderMoney';
import { StatusUpdateMenu } from '@/app/components/admin/StatusUpdateMenu';
import ShipOrderDialog from '@/app/components/admin/ShipOrderDialog';
import { DataTable, type DataTableColumn } from '@/components/admin/DataTable';
import { Search, Truck, Download } from 'lucide-react';

const statusConfig: Record<string, string> = {
  'Pendiente verificación Binance': 'bg-amber-100 text-amber-900 border border-amber-200',
  Pendiente: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  'En Proceso': 'bg-gray-100 text-navy border border-gray-200',
  Enviado: 'bg-slate-100 text-slate-800 border border-slate-200',
  Entregado: 'bg-green-100 text-green-800 border border-green-200',
  Cancelado: 'bg-red-100 text-red-800 border border-red-200',
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-VE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

const EMPTY_TAB_COUNTS: OrderTabCounts = {
  all: 0,
  pending: 0,
  paid: 0,
  processing: 0,
  shipped: 0,
  completed: 0,
};

type OrdersPageResponse = {
  orders: Order[];
  nextCursor: string | null;
  total: number;
  counts: OrderTabCounts;
};

function buildOrdersQuery(limit: number, tab: OrderTabKey, q: string, cursor?: string): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (tab !== 'all') params.set('tab', tab);
  if (q.trim()) params.set('q', q.trim());
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

function OrdersPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseOrderTab(searchParams.get('tab'), searchParams.get('status'));
  const qFromUrl = searchParams.get('q') ?? '';

  const setTab = useCallback(
    (next: OrderTabKey) => {
      const p = new URLSearchParams(searchParams.toString());
      p.delete('status');
      if (next === 'all') p.delete('tab');
      else p.set('tab', next);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, searchParams, pathname],
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [tabCounts, setTabCounts] = useState<OrderTabCounts>(EMPTY_TAB_COUNTS);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState(qFromUrl);
  const [shipDialogOrder, setShipDialogOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const skipDebouncedUrlSync = useRef(true);
  const requestIdRef = useRef(0);

  const PAGE_SIZE = 50;

  // Sincronizar input al navegar atrás/adelante.
  useEffect(() => {
    setSearchInput(qFromUrl);
  }, [qFromUrl]);

  // Debounce → URL (?q=) → refetch servidor (resetea paginación).
  useEffect(() => {
    if (skipDebouncedUrlSync.current) {
      skipDebouncedUrlSync.current = false;
      return;
    }
    const trimmed = debouncedSearch.trim();
    const current = qFromUrl.trim();
    if (trimmed === current) return;

    const p = new URLSearchParams(searchParams.toString());
    if (trimmed) p.set('q', trimmed);
    else p.delete('q');
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSearch, qFromUrl, router, searchParams, pathname]);

  const fetchFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setSelectedOrders([]);
    try {
      const qs = buildOrdersQuery(PAGE_SIZE, tab, qFromUrl);
      const res = await fetch(`/api/orders?${qs}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? 'No se pudieron cargar los pedidos.');
      }
      const data = (await res.json()) as OrdersPageResponse;
      if (requestId !== requestIdRef.current) return;
      setOrders(data.orders);
      setNextCursor(data.nextCursor);
      setTotalFiltered(data.total);
      setTabCounts(data.counts);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [tab, qFromUrl]);

  useEffect(() => {
    void fetchFirstPage();
  }, [fetchFirstPage]);

  const loadMoreOrders = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const qs = buildOrdersQuery(PAGE_SIZE, tab, qFromUrl, nextCursor);
      const res = await fetch(`/api/orders?${qs}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? 'No se pudieron cargar más pedidos.');
      }
      const data = (await res.json()) as OrdersPageResponse;
      if (requestId !== requestIdRef.current) return;
      setOrders(curr => [...curr, ...data.orders]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudieron cargar más pedidos.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [nextCursor, loadingMore, tab, qFromUrl]);

  const handleUpdateStatus = async (status: OrderStatus, orderIds: string[]) => {
    if (status === 'Enviado' && orderIds.length === 1) {
      const target = orders.find(o => o.id === orderIds[0]);
      if (target) {
        setShipDialogOrder(target);
        return;
      }
    }

    const isBulk = orderIds.length > 1;
    const endpoint = isBulk ? '/api/orders/bulk-status-update' : `/api/orders/${orderIds[0]}/status`;
    const method = isBulk ? 'POST' : 'PUT';
    const body = isBulk ? JSON.stringify({ orderIds, status }) : JSON.stringify({ status });

    try {
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? 'Error al actualizar el estado');
      }
      if (!isBulk) {
        await response.json();
        await fetchFirstPage();
      } else {
        const result = await response.json() as { updatedCount: number };
        if (result.updatedCount > 0) {
          fetchFirstPage();
        }
        setSelectedOrders([]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo actualizar el estado de los pedidos.');
    }
  };

  const handleShipConfirm = async (tracking: {
    trackingNumber: string | null;
    trackingCarrier: string | null;
    trackingUrl: string | null;
    trackingPhotoUrl: string | null;
  }) => {
    if (!shipDialogOrder) return;
    const r = await fetch(`/api/orders/${shipDialogOrder.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Enviado', ...tracking }),
    });
    if (!r.ok) {
      const errorData = await r.json().catch(() => ({}));
      throw new Error(errorData.message ?? 'No se pudo guardar el tracking.');
    }
    await r.json();
    setShipDialogOrder(null);
    await fetchFirstPage();
  };

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'orderNumber',
      header: '#',
      primary: true,
      cell: o => <span className="font-mono font-bold text-navy">#{String(o.orderNumber).padStart(4, '0')}</span>,
    },
    {
      key: 'customer',
      header: 'Cliente',
      mobileLabel: 'Cliente',
      secondary: true,
      cell: o => <span className="truncate">{o.customerName}</span>,
    },
    {
      key: 'createdAt',
      header: 'Fecha',
      mobileLabel: 'Fecha',
      cell: o => <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(o.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      mobileLabel: 'Estado',
      align: 'center',
      cell: o => (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusConfig[o.status] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {o.status}
          </span>
          {o.channel === 'whatsapp' && (
            <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">
              WhatsApp
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      mobileLabel: 'Total',
      align: 'right',
      cell: o => <DualOrderMoney amount={o.total} order={o} variant="admin" />,
    },
    {
      key: 'tracking',
      header: 'Tracking',
      mobileLabel: 'Tracking',
      cell: o =>
        o.trackingNumber ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-navy font-semibold">
            <Truck size={12} /> {o.trackingNumber}
          </span>
        ) : (
          <span className="text-gray-500 text-xs">—</span>
        ),
    },
  ];

  const hasFilters = Boolean(qFromUrl.trim()) || tab !== 'all';

  // OBJETIVO A (UI): si algún pedido seleccionado es de WhatsApp sin stock
  // descontado, deshabilitar «En Proceso» en el menú de estado en lote. La
  // seguridad real vive en el endpoint bulk-status-update; esto solo evita el
  // error humano de intentarlo.
  const hasUndeductedStockSelected = selectedOrders.some(id => {
    const order = orders.find(o => o.id === id);
    return order?.stockDeducted === false;
  });

  const handleExportCsv = useCallback(() => {
    const scope =
      tab !== 'all' || qFromUrl.trim()
        ? `Se exportará SOLO la vista filtrada actual (${totalFiltered} pedido${totalFiltered !== 1 ? 's' : ''} · filtro: ${TAB_LABELS[tab]}${qFromUrl.trim() ? ` · búsqueda «${qFromUrl.trim()}»` : ''}).`
        : `Se exportarán TODOS los pedidos (${totalFiltered}).`;
    const ok = window.confirm(
      `${scope}\n\nEl archivo incluye datos personales de clientes y la exportación queda registrada. ¿Continuar?`,
    );
    if (!ok) return;

    const params = new URLSearchParams();
    if (tab !== 'all') params.set('tab', tab);
    if (qFromUrl.trim()) params.set('q', qFromUrl.trim());
    const qs = params.toString();
    window.location.href = `/api/orders/export.csv${qs ? `?${qs}` : ''}`;
  }, [totalFiltered, tab, qFromUrl]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Pedidos</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Gestiona y actualiza el estado de todos los pedidos.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={totalFiltered === 0}
          className="touch-manipulation select-none min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-navy shadow-soft hover:border-slate-300 hover:shadow-card active:bg-slate-50 transition-all disabled:opacity-40 disabled:pointer-events-none"
          title="Exportar la vista filtrada actual a CSV (incluye datos personales; queda registrado)"
        >
          <Download size={15} /> Exportar CSV
          {hasFilters && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
              vista filtrada
            </span>
          )}
        </button>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-[#0b1220] via-[#0f172a] to-[#020617] border border-slate-800/80 shadow-xl shadow-slate-900/20 overflow-hidden">
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Filtrar por estado</p>
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto overscroll-x-contain touch-pan-x pb-2 -mx-1 px-1 [-webkit-overflow-scrolling:touch] scrollbar-thin [scrollbar-color:rgba(100,116,139,0.35)_transparent]">
              {TAB_ORDER.map(key => {
                const selected = tab === key;
                const count = tabCounts[key];
                const showCount = key !== 'all';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={[
                      'touch-manipulation select-none shrink-0 whitespace-nowrap px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] active:opacity-90',
                      selected
                        ? 'bg-white text-[#0f172a] shadow-md shadow-black/20'
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800 active:bg-slate-700/50 border border-transparent',
                    ].join(' ')}
                  >
                    {TAB_LABELS[key]}
                    {showCount ? (
                      <span className={selected ? 'text-slate-600' : 'text-slate-500'}>
                        {' '}
                        ({count})
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative pt-1 border-t border-slate-700/60">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="none"
              placeholder="Buscar por #, nombre, teléfono, cédula o referencia…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 min-h-[48px] py-2.5 rounded-xl border border-slate-600/50 bg-slate-900/60 text-slate-100 placeholder:text-slate-500 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 focus:border-brand-yellow/50"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {selectedOrders.length > 0 && (
        <div className="flex flex-col gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-navy">
              {selectedOrders.length} seleccionado{selectedOrders.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => setSelectedOrders([])}
              className="touch-manipulation ml-auto sm:ml-0 text-xs text-gray-500 hover:text-gray-700 min-h-[44px] min-w-[44px] px-3 rounded-lg active:bg-amber-100/80"
            >
              Quitar selección
            </button>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Pasar selección a estado</p>
            {hasUndeductedStockSelected && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                Hay pedidos de WhatsApp sin inventario descontado en la selección: «En Proceso» está
                deshabilitado en lote. Valídalos primero uno a uno con «Validar pago».
              </p>
            )}
            <StatusUpdateMenu
              onUpdate={status => handleUpdateStatus(status, selectedOrders)}
              isBulk
              bulkCount={selectedOrders.length}
              disabledStatuses={
                hasUndeductedStockSelected
                  ? {
                      'En Proceso':
                        'Hay pedidos de WhatsApp sin inventario descontado. Valídalos individualmente con «Validar pago» antes de avanzar en lote.',
                    }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      <DataTable<Order>
        data={orders}
        columns={columns}
        rowKey={o => o.id}
        loading={loading}
        selectable
        selectedIds={selectedOrders}
        onSelectionChange={setSelectedOrders}
        emptyState={
          hasFilters
            ? 'No se encontraron pedidos con los filtros aplicados.'
            : 'No hay pedidos registrados todavía.'
        }
        onRowClick={o => router.push(`/admin/orders/${o.id}`)}
      />

      <div className="flex items-center justify-between mt-2">
        <p className="text-[11px] text-slate-600">
          Mostrando {orders.length} de {totalFiltered} pedidos{nextCursor ? ' (hay más)' : ''}
        </p>
        {nextCursor && (
          <button
            type="button"
            onClick={loadMoreOrders}
            disabled={loadingMore}
            className="touch-manipulation select-none text-xs font-semibold text-navy border border-slate-200 bg-white rounded-xl px-3.5 py-2 hover:border-slate-300 active:bg-slate-50 transition-all disabled:opacity-40 disabled:pointer-events-none"
          >
            {loadingMore ? 'Cargando…' : 'Cargar más pedidos'}
          </button>
        )}
      </div>

      <ShipOrderDialog
        open={!!shipDialogOrder}
        orderNumber={shipDialogOrder?.orderNumber ?? ''}
        initial={{
          trackingNumber: shipDialogOrder?.trackingNumber,
          trackingCarrier: shipDialogOrder?.trackingCarrier,
          trackingUrl: shipDialogOrder?.trackingUrl,
          trackingPhotoUrl: shipDialogOrder?.trackingPhotoUrl,
        }}
        onClose={() => setShipDialogOrder(null)}
        onConfirm={handleShipConfirm}
      />
    </div>
  );
}

function OrdersLoadingShell() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-14 bg-slate-200 rounded-xl" />
      <div className="h-36 bg-slate-800/40 rounded-2xl" />
      <div className="h-64 bg-white border border-slate-200 rounded-xl" />
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<OrdersLoadingShell />}>
      <OrdersPageContent />
    </Suspense>
  );
}
