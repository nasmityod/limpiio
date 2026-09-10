'use client';

import { useEffect, useState } from 'react';
// PRD-083/225: el dashboard ya no consume el catálogo completo del
// ProductContext global ni GET /api/orders entero — solo KPIs agregados.
import {
  getAdminDashboardData,
  type AdminDashboardData,
  type DashboardRecentOrder,
} from '@/app/actions/adminDashboardActions';
import {
  Package, Tag, ShoppingCart, Clock, TrendingUp, AlertCircle,
  ArrowRight, Truck,
} from 'lucide-react';
import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/components/admin/DataTable';
import { getOrderDualMoney } from '@/lib/order-pricing';

const formatBs = (amount: number) =>
  new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(amount);

const formatUsd = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });

const statusConfig: Record<string, string> = {
  Pendiente:                        'bg-yellow-100 text-yellow-800 border border-yellow-200',
  'En Proceso':                     'bg-gray-100 text-navy border border-gray-200',
  Enviado:                          'bg-slate-100 text-slate-800 border border-slate-200',
  Entregado:                        'bg-green-100 text-green-800 border border-green-200',
  Cancelado:                        'bg-red-100 text-red-800 border border-red-200',
  'Pendiente verificación Binance': 'bg-orange-100 text-orange-800 border border-orange-200',
};

/** Saludo según la hora de Venezuela (VET), como en el mostrador. */
function venezuelanGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return '¡Buenos días!';
  if (hour < 19) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

function venezuelanDate(): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export default function AdminDashboardClient() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  // ADM-04: el operador debe VER que los KPIs no cargaron (antes solo console.error).
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdminDashboardData()
      .then(d => { if (!cancelled) { setData(d); setLoadingOrders(false); } })
      .catch(err => {
        // PRD-221: nunca tragar errores del panel en silencio
        console.error('[admin-dashboard] error cargando KPIs:', err);
        if (!cancelled) { setLoadError(true); setLoadingOrders(false); }
      });
    return () => { cancelled = true; };
  }, []);

  const totalProducts = data?.totalProducts ?? 0;
  const totalCategories = data?.totalCategories ?? 0;
  const lowStock = data?.lowStock ?? 0;
  const outOfStock = data?.outOfStock ?? 0;

  const totalOrders = data?.totalOrders ?? 0;
  const pendingOrders = data?.pendingOrders ?? 0;
  const inProcessOrders = data?.inProcessOrders ?? 0;
  const shippedOrders = data?.shippedOrders ?? 0;
  const revenueUsd = data?.revenueUsd ?? 0;
  const revenueBs = data?.revenueBs ?? 0;
  const hasLegacyUsdRevenue = data?.hasLegacyUsdRevenue ?? false;

  const recentOrders = data?.recentOrders ?? [];
  const lowStockProducts = data?.lowStockProducts ?? [];

  const orderColumns: DataTableColumn<DashboardRecentOrder>[] = [
    {
      key: 'orderNumber', header: '#', primary: true,
      cell: o => <span className="font-mono font-bold text-navy">#{String(o.orderNumber).padStart(4, '0')}</span>,
    },
    {
      key: 'customer', header: 'Cliente', secondary: true, mobileLabel: 'Cliente',
      cell: o => <span className="truncate">{o.customerName}</span>,
    },
    {
      key: 'date', header: 'Fecha', mobileLabel: 'Fecha',
      cell: o => <span className="text-xs text-gray-500">{formatShortDate(o.createdAt)}</span>,
    },
    {
      key: 'status', header: 'Estado', mobileLabel: 'Estado', align: 'center',
      cell: o => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusConfig[o.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {o.status}
        </span>
      ),
    },
    {
      key: 'total', header: 'Total', mobileLabel: 'Total', align: 'right',
      cell: o => {
        const money = getOrderDualMoney(o.total, o);
        return (
          <span className="whitespace-nowrap text-right leading-tight">
            <span className="block font-bold text-gray-900">{money.usd}</span>
            <span className="block text-[11px] text-gray-500">{money.bs}</span>
          </span>
        );
      },
    },
  ];

  const binancePending = data?.binancePendingOrders ?? 0;
  const bankingConfigured = data?.bankingConfigured ?? true;
  const bcvStale = data?.bcvStale ?? false;
  const bcvRateDate = data?.bcvRateDate ?? null;
  const lastBackupAt = data?.lastBackupAt ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-navy">{venezuelanGreeting()} Así va la tienda</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 capitalize">{venezuelanDate()} · Barquisimeto</p>
      </div>

      {/* ADM-04: error visible al operador */}
      {loadError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-bold">No se pudieron cargar los indicadores.</p>
            <p className="text-xs mt-0.5">Revisa tu conexión y recarga la página. Si persiste, la base de datos puede estar caída.</p>
          </div>
        </div>
      )}

      {/* ADM-13 / PRD-039: la tienda opera con DEFAULT_SETTINGS — checkout sin cuentas reales */}
      {!loadingOrders && !loadError && !bankingConfigured && (
        <Link
          href="/admin/settings"
          role="alert"
          className="flex items-start gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 active:bg-red-100"
        >
          <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-800 min-w-0">
            <p className="font-bold">⚠ Faltan los datos bancarios de la tienda.</p>
            <p className="text-xs mt-0.5">
              El checkout está mostrando datos de ejemplo (no tus cuentas reales).
              Toca aquí y guarda Pago Móvil / transferencia / Binance en Configuración.
            </p>
          </div>
          <ArrowRight size={16} className="text-red-600 flex-shrink-0 mt-1" />
        </Link>
      )}

      {/* Hero ingresos */}
      <div className="bg-gradient-to-br from-navy to-[#0f172a] rounded-2xl p-5 sm:p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-yellow/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Ingresos totales (USD)</p>
          <p className="text-3xl sm:text-4xl font-black mt-1.5 tabular-nums">
            {loadingOrders ? '—' : formatUsd(revenueUsd)}
          </p>
          {!loadingOrders && revenueBs > 0 && (
            <p className="text-sm font-semibold opacity-80 mt-0.5 tabular-nums">
              ≈ {formatBs(revenueBs)}{hasLegacyUsdRevenue ? ' + pedidos legado USD' : ''}
            </p>
          )}
          <p className="text-[11px] text-white/80 mt-1">Solo pagos validados · USD principal, Bs según la tasa congelada de cada pedido</p>
        </div>
      </div>

      {/* KPIs grid 2 cols mobile / 4 cols desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <KpiCard label="Pedidos totales" value={loadingOrders ? '—' : totalOrders} icon={ShoppingCart} accent="navy" href="/admin/orders" />
        <KpiCard
          label={binancePending > 0 ? `Por verificar (${binancePending} Binance)` : 'Por verificar pago'}
          value={loadingOrders ? '—' : pendingOrders}
          icon={Clock}
          accent="yellow"
          href="/admin/orders?tab=pending"
        />
        <KpiCard label="Para despachar" value={loadingOrders ? '—' : inProcessOrders} icon={TrendingUp} accent="navy" href="/admin/orders?tab=processing" />
        <KpiCard label="En camino" value={loadingOrders ? '—' : shippedOrders} icon={Truck} accent="success" href="/admin/orders?tab=shipped" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <KpiCard label="Productos" value={totalProducts} icon={Package} accent="navy" href="/admin/products" />
        <KpiCard label="Categorías" value={totalCategories} icon={Tag} accent="navy" href="/admin/categories" />
        <KpiCard label="Stock bajo" value={lowStock} icon={AlertCircle} accent={lowStock > 0 ? 'warning' : 'navy'} href="/admin/products" />
        <KpiCard label="Agotados" value={outOfStock} icon={AlertCircle} accent={outOfStock > 0 ? 'danger' : 'navy'} href="/admin/products" />
      </div>

      {/* Pedidos recientes */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-black text-navy uppercase tracking-wide">Pedidos recientes</h2>
          <Link href="/admin/orders" className="min-h-[36px] inline-flex items-center gap-1 text-xs text-navy font-semibold active:bg-gray-100 px-2 rounded">
            Ver todos <ArrowRight size={12} />
          </Link>
        </div>
        <DataTable<DashboardRecentOrder>
          data={recentOrders}
          columns={orderColumns}
          rowKey={o => o.id}
          loading={loadingOrders}
          emptyState="Aún no hay pedidos."
          onRowClick={o => { window.location.href = `/admin/orders/${o.id}`; }}
        />
      </section>

      {/* ADM-12 / INF-05: observabilidad — tasa BCV y último backup */}
      {!loadingOrders && !loadError && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className={`rounded-2xl border px-4 py-3 ${bcvStale ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white'}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Tasa BCV (cron nocturno)</p>
            <p className={`text-sm font-bold mt-0.5 ${bcvStale ? 'text-orange-700' : 'text-navy'}`}>
              {bcvRateDate
                ? `Actualizada: ${new Date(bcvRateDate).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`
                : 'Sin registro'}
              {bcvStale ? ' · ⚠ desactualizada (+72 h)' : ' · al día'}
            </p>
            {bcvStale && (
              <p className="text-[11px] text-orange-700 mt-0.5">
                Los precios en Bs pueden estar viejos — revisa el cron del VPS o actualiza la tasa en Configuración.
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Último backup de la base de datos</p>
            <p className="text-sm font-bold text-navy mt-0.5">
              {lastBackupAt
                ? new Date(lastBackupAt).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'Sin registro aún'}
            </p>
          </div>
        </section>
      )}

      {/* Stock bajo */}
      {lowStockProducts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black text-red-700 uppercase tracking-wide flex items-center gap-1.5">
              <AlertCircle size={14} /> Stock crítico
            </h2>
            <Link href="/admin/products?stock=low" className="min-h-[36px] inline-flex items-center gap-1 text-xs text-navy font-semibold active:bg-gray-100 px-2 rounded">
              Reabastecer <ArrowRight size={12} />
            </Link>
          </div>
          <ul className="bg-white border border-red-200 rounded-2xl divide-y divide-red-100 overflow-hidden">
            {lowStockProducts.map(p => (
              <li key={p.id}>
                <Link href={`/admin/products`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-red-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{p.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{p.category}</p>
                  </div>
                  <span className={`flex-shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    p.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {p.stock === 0 ? 'Agotado' : `${p.stock} uds`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function KpiCard({
  label, value, icon: Icon, accent, href,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: 'navy' | 'yellow' | 'warning' | 'danger' | 'success';
  href?: string;
}) {
  const styles = {
    navy:    { bg: 'bg-gray-100',    iconColor: 'text-navy' },
    yellow:  { bg: 'bg-yellow-50',   iconColor: 'text-yellow-600' },
    warning: { bg: 'bg-orange-50',   iconColor: 'text-orange-600' },
    danger:  { bg: 'bg-red-50',      iconColor: 'text-red-600' },
    success: { bg: 'bg-green-50',    iconColor: 'text-green-600' },
  }[accent];

  const cardClass = 'bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 active:bg-gray-50 transition flex flex-col';
  const inner = (
    <>
      <div className={`w-9 h-9 rounded-xl ${styles.bg} flex items-center justify-center mb-2`}>
        <Icon size={17} className={styles.iconColor} />
      </div>
      <p className="text-2xl sm:text-3xl font-black text-navy tabular-nums leading-tight">{value}</p>
      <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 truncate">{label}</p>
    </>
  );

  return href
    ? <Link href={href} className={cardClass}>{inner}</Link>
    : <div className={cardClass}>{inner}</div>;
}
