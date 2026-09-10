'use client';

import { useEffect, useState, useMemo } from 'react';
import type { AdminStatsDTO } from '@/app/api/admin/stats/route';
import { BarChart2, TrendingUp, ShoppingCart, Package, Award, Eye, CreditCard, MapPin, Users, UserPlus, Wallet, BellRing, XCircle } from 'lucide-react';
import Link from 'next/link';

interface TopViewedProduct {
  productId:   string;
  productName: string;
  viewCount:   number;
}

type Period = '7d' | '30d' | '90d' | 'year' | 'all';

const formatUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 Días',
  '30d': '30 Días',
  '90d': '90 Días',
  'year': '1 Año',
  'all': 'Todo',
};

function DeltaBadge({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null) return null;
  if (previous === 0) {
    return current > 0
      ? <span className="text-[11px] font-semibold text-green-600">▲ nuevo vs. período anterior</span>
      : null;
  }
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% vs. período anterior
    </span>
  );
}

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');
  const [sortBy, setSortBy] = useState<'quantity' | 'revenue'>('revenue');
  const [topViewed, setTopViewed] = useState<TopViewedProduct[]>([]);
  const [loadingViews, setLoadingViews] = useState(true);
  const [productCosts, setProductCosts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState(false);

  // Estadísticas del período. Una respuesta lenta de un período anterior no
  // debe pisar la del período que el operador acaba de seleccionar.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/admin/stats?range=${period}&tz=America/Caracas`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        // Validate DTO shape
        if (data && typeof data === 'object' && 'summary' in data) {
          setStats(data as AdminStatsDTO);
          setLoadError(false);
        } else {
          setLoadError(true);
        }
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[admin-stats] error cargando estadísticas:', err);
        setLoadError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [period]);

  // «Más vistos» NO depende del período: antes se volvía a pedir cada vez que
  // el operador cambiaba de 7d a 30d, 90d… sin que la respuesta cambiara.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/events/top-viewed', { signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (Array.isArray(data)) setTopViewed(data);
        setLoadingViews(false);
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[admin-stats] error cargando más vistos:', err);
        setLoadingViews(false);
      });
    return () => controller.abort();
  }, []);

  const summary = stats?.summary;
  const prevSummary = stats?.previousSummary;

  // Wrap derived data in useMemo to avoid dependency changes on every render
  const topProducts = useMemo(() => stats?.topProducts ?? [], [stats?.topProducts]);

  // Costes SOLO de los productos que aparecen en la estadística (≤20).
  // Antes se descargaba el mapa de costes del catálogo completo, y además se
  // repetía en cada cambio de período.
  const topProductIds = useMemo(
    () => topProducts.map(p => p.productId).filter(Boolean),
    [topProducts],
  );
  const topProductIdsKey = topProductIds.join(',');

  useEffect(() => {
    if (!topProductIdsKey) {
      setProductCosts({});
      return;
    }
    const controller = new AbortController();
    fetch(`/api/admin/product-costs?ids=${encodeURIComponent(topProductIdsKey)}`, {
      signal: controller.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (data && typeof data === 'object' && !Array.isArray(data)) setProductCosts(data);
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[admin-stats] error cargando costos:', err);
      });
    return () => controller.abort();
  }, [topProductIdsKey]);

  const sortedProducts = useMemo(() => {
    const sorted = [...topProducts];
    if (sortBy === 'quantity') {
      sorted.sort((a, b) => b.quantity - a.quantity);
    } else {
      sorted.sort((a, b) => b.revenue - a.revenue);
    }
    return sorted;
  }, [topProducts, sortBy]);

  const maxQuantity = Math.max(1, ...sortedProducts.map(p => p.quantity));
  const maxRevenue = Math.max(1, ...sortedProducts.map(p => p.revenue));

  const totalProductRevenue = sortedProducts.reduce((s, p) => s + p.revenue, 0);

  const dailyRevenueSeries = stats?.daily ?? [];
  const maxDailyRevenue = Math.max(1, ...dailyRevenueSeries.map(d => d.revenue ?? 0));

  // Ganancia estimada: usamos los datos de topProducts y productCosts
  const profitStats = useMemo(() => {
    let revenue = 0, cost = 0, uncovered = 0;
    for (const p of sortedProducts) {
      revenue += p.revenue;
      const unitCost = productCosts[p.productId];
      if (unitCost != null && unitCost > 0) cost += unitCost * p.quantity;
      else uncovered += p.quantity;
    }
    const profit = revenue - cost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { profit, cost, marginPct, uncovered };
  }, [sortedProducts, productCosts]);

  // Pending verify orders (from the byStatus breakdown)
  const pendingVerifyCount = useMemo(() => {
    const entry = stats?.byStatus?.find(s => s.status === 'Pendiente' || s.status === 'Pendiente verificación Binance');
    return entry ? entry.count : 0;
  }, [stats]);

  const MEDAL_COLORS = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

  return (
    <div>
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={24} className="text-navy" /> Estadísticas de Ventas
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Productos más vendidos — {PERIOD_LABELS[period]}
          </p>
        </div>

        {/* Filtro de período */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button type="button"
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === p
                  ? 'bg-white text-navy border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-gray-100 border border-gray-200 flex items-center justify-center">
              <ShoppingCart size={18} className="text-navy" />
            </div>
            <p className="text-sm text-gray-500">Pedidos validados en el período</p>
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {loading ? '—' : summary?.paidOrderCount ?? 0}
          </p>
          {!loading && <div className="mt-1"><DeltaBadge current={summary?.paidOrderCount ?? 0} previous={prevSummary?.paidOrderCount ?? null} /></div>}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
              <Package size={18} className="text-green-500" />
            </div>
            <p className="text-sm text-gray-500">Unidades vendidas</p>
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {loading ? '—' : topProducts.reduce((s, p) => s + p.quantity, 0)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
              <TrendingUp size={18} className="text-purple-500" />
            </div>
            <p className="text-sm text-gray-500">Ingresos validados del período</p>
          </div>
          {loading ? (
            <p className="text-2xl font-bold text-gray-900 mt-2">—</p>
          ) : (
            <div className="mt-2 space-y-0.5">
              <p className="text-2xl font-bold text-gray-900">{formatUsd(summary?.revenue ?? 0)}</p>
              {summary && (
                <>
                  <p className="text-xs text-gray-500">
                    Ticket promedio: <span className="font-semibold text-gray-700">{formatUsd(summary.averageTicket)}</span>
                  </p>
                  <DeltaBadge current={summary.revenue} previous={prevSummary?.revenue ?? null} />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RUN-03: aviso visible cuando la carga de pedidos falló */}
      {loadError && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <XCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-bold">No se pudieron cargar las estadísticas.</p>
            <p className="text-xs mt-0.5">Las cifras de abajo pueden estar vacías. Recarga la página; si persiste, vuelve a iniciar sesión.</p>
          </div>
        </div>
      )}

      {/* Pendientes de verificación y cancelaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          href="/admin/orders?tab=pending"
          className={`block rounded-xl p-5 border transition-colors ${pendingVerifyCount > 0 ? 'bg-amber-50 border-amber-200 active:bg-amber-100' : 'bg-white border-gray-200 active:bg-gray-50'}`}
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
              <BellRing size={18} className="text-amber-600" />
            </div>
            <p className="text-sm text-gray-500">Pendientes de verificación</p>
          </div>
          {loading ? (
            <p className="text-2xl font-bold text-gray-900 mt-2">—</p>
          ) : pendingVerifyCount === 0 ? (
            <div className="mt-2">
              <p className="text-2xl font-bold text-green-600">Todo al día ✓</p>
              <p className="text-xs text-gray-500 mt-0.5">No hay órdenes por revisar.</p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-3xl font-bold text-amber-700">{pendingVerifyCount}</p>
              <p className="text-xs text-gray-600 mt-0.5">orden{pendingVerifyCount !== 1 ? 'es' : ''} por revisar</p>
            </div>
          )}
        </Link>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
              <XCircle size={18} className="text-red-500" />
            </div>
            <p className="text-sm text-gray-500">Tasa de cancelación</p>
          </div>
          {loading ? (
            <p className="text-2xl font-bold text-gray-900 mt-2">—</p>
          ) : (
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900">{summary?.cancellationRate.toFixed(1) ?? '0.0'}%</p>
              <p className="text-xs text-gray-500 mt-0.5">del total de pedidos (validados + cancelados)</p>
            </div>
          )}
        </div>
      </div>

      {/* Tendencia de ingresos (USD) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-purple-500" />
          <h2 className="font-semibold text-gray-800">Tendencia de ingresos (USD)</h2>
          <span className="ml-2 text-xs text-gray-400">{PERIOD_LABELS[period]}</span>
        </div>
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Cargando…</div>
        ) : dailyRevenueSeries.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">Sin ingresos en el período.</div>
        ) : (
          <>
            <div className="flex items-end gap-1 h-40">
              {dailyRevenueSeries.map(d => (
                <div key={d.date} className="flex-1 flex flex-col justify-end min-w-0">
                  <div
                    className="w-full bg-brand-yellow rounded-t hover:bg-yellow-400 transition-colors"
                    style={{ height: `${Math.max(2, (d.revenue / maxDailyRevenue) * 100)}%` }}
                    title={`${d.date}: ${formatUsd(d.revenue)}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-2">
              <span>{dailyRevenueSeries[0].date}</span>
              <span>{dailyRevenueSeries[dailyRevenueSeries.length - 1].date}</span>
            </div>
          </>
        )}
      </div>

      {/* Desgloses: método de pago y estado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-navy" />
            <h2 className="font-semibold text-gray-800">Por método de pago</h2>
          </div>
          {!stats || stats.byPayment.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin datos en el período.</p>
          ) : (
            <ul className="space-y-3">
              {stats.byPayment.map(p => {
                const share = summary && summary.revenue > 0 ? (p.revenue / summary.revenue) * 100 : 0;
                return (
                  <li key={p.method}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">{p.method}</span>
                      <span className="text-gray-900 font-semibold">{formatUsd(p.revenue)} <span className="text-xs text-gray-400">({p.count})</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-yellow rounded-full" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-navy" />
            <h2 className="font-semibold text-gray-800">Por estado (pedido)</h2>
          </div>
          {!stats || stats.byStatus.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Sin datos en el período.</p>
          ) : (
            <ul className="space-y-3">
              {stats.byStatus.slice(0, 8).map(s => {
                const share = stats.byStatus.length > 0 ? (s.count / stats.byStatus.reduce((a, b) => a + b.count, 0)) * 100 : 0;
                return (
                  <li key={s.status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium">{s.status}</span>
                      <span className="text-gray-900 font-semibold">{s.count} <span className="text-xs text-gray-400">({share.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-yellow rounded-full" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Clientes — removed from aggregated endpoint, keep basic info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-navy" />
            <h2 className="font-semibold text-gray-800">Pedidos del período</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-green-50 rounded-lg py-4">
              <p className="text-3xl font-bold text-green-600">{summary?.paidOrderCount ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Validados</p>
            </div>
            <div className="text-center bg-blue-50 rounded-lg py-4">
              <p className="text-3xl font-bold text-blue-600">{summary?.orderCount ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">Totales</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus size={18} className="text-navy" />
            <h2 className="font-semibold text-gray-800">Resumen</h2>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Ticket promedio</span>
              <span className="text-lg font-bold text-gray-900">{formatUsd(summary?.averageTicket ?? 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Cancelación</span>
              <span className="text-lg font-bold text-gray-900">{summary?.cancellationRate.toFixed(1) ?? '0.0'}%</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-500">Total pedidos</span>
              <span className="text-lg font-bold text-gray-900">{summary?.orderCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ganancia estimada */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={18} className="text-green-600" />
          <h2 className="font-semibold text-gray-800">Ganancia estimada (USD)</h2>
          <span className="ml-2 text-xs text-gray-400">costo actual del producto · aproximado</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">Ganancia bruta</p>
            <p className="text-2xl font-bold text-green-600">{formatUsd(profitStats.profit)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Costo de lo vendido</p>
            <p className="text-2xl font-bold text-gray-900">{formatUsd(profitStats.cost)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Margen</p>
            <p className="text-2xl font-bold text-gray-900">{profitStats.marginPct.toFixed(1)}%</p>
          </div>
        </div>
        {profitStats.uncovered > 0 && (
          <p className="text-xs text-amber-600 mt-3">⚠️ {profitStats.uncovered} unidades sin costo registrado — el margen las ignora. Carga el costo en cada producto para mayor precisión.</p>
        )}
      </div>

      {/* Tabla de productos */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Ranking de Productos</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button type="button"
              onClick={() => setSortBy('quantity')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                sortBy === 'quantity' ? 'bg-white text-navy border border-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Por unidades
            </button>
            <button type="button"
              onClick={() => setSortBy('revenue')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                sortBy === 'revenue' ? 'bg-white text-navy border border-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Por ingresos
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Cargando estadísticas...</div>
        ) : sortedProducts.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            No hay ventas registradas para el período seleccionado.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortedProducts.map((stat, index) => {
              const barWidth = sortBy === 'quantity'
                ? (stat.quantity / maxQuantity) * 100
                : (stat.revenue / maxRevenue) * 100;
              const revenueShare = totalProductRevenue > 0
                ? ((stat.revenue / totalProductRevenue) * 100).toFixed(1)
                : '0';

              return (
                <div key={stat.productId} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-8 flex-shrink-0 text-center">
                      {index < 3 ? (
                        <Award size={20} className={MEDAL_COLORS[index]} />
                      ) : (
                        <span className="text-sm font-bold text-gray-400">#{index + 1}</span>
                      )}
                    </div>

                    <div className="flex-grow min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{stat.name}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span>{stat.quantity} unidade{stat.quantity !== 1 ? 's' : ''}</span>
                        <span className="text-purple-600 font-medium">{revenueShare}% del total</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-yellow rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <p className="font-bold text-gray-900">{formatUsd(stat.revenue)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{stat.quantity} uds.</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sortedProducts.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 text-right">
          {sortedProducts.length} productos distintos vendidos en este período
        </p>
      )}

      {/* Top productos más vistos */}
      <div className="mt-8 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <Eye size={18} className="text-navy" />
          <h2 className="font-semibold text-gray-800">Productos Más Vistos</h2>
          <span className="ml-2 text-xs text-gray-400">(vistas: últimos 90 días · conversión = unidades del período ÷ vistas, aprox.)</span>
        </div>
        {loadingViews ? (
          <div className="py-8 text-center text-gray-400 text-sm">Cargando vistas…</div>
        ) : topViewed.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">Sin datos todavía. Las vistas se acumulan conforme los clientes visiten productos.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {topViewed.map((item, i) => {
              const sold = topProducts.find(p => p.productId === item.productId)?.quantity ?? 0;
              const conv = item.viewCount > 0 ? (sold / item.viewCount) * 100 : 0;
              return (
                <li key={item.productId} className="flex items-center gap-4 px-6 py-3">
                  <span className="text-sm font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.productId.slice(0, 10)}…</p>
                  </div>
                  <div className="text-right mr-2">
                    <p className="text-sm font-semibold text-green-600">{conv.toFixed(1)}%</p>
                    <p className="text-[10px] text-gray-400">{sold} vendidas</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm font-bold text-navy">
                    <Eye size={13} className="text-gray-400" />
                    {item.viewCount.toLocaleString()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
