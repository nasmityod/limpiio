'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CASHEA_STATUS_ADMIN_LABELS, Order, OrderStatus } from '@/lib/definitions';
import { getOrderDualMoney, hasFrozenBsPricing } from '@/lib/order-pricing';
import { isStorePickupOrderAddress } from '@/lib/shipping-charge';
import { DualOrderMoney, OrderFrozenRateBanner } from '@/components/order/DualOrderMoney';
import { StatusUpdateMenu } from '@/app/components/admin/StatusUpdateMenu';
import ShipOrderDialog from '@/app/components/admin/ShipOrderDialog';
import { PaymentVerificationPanel } from '@/components/admin/PaymentVerificationPanel';
import { CasheaAdminActions } from '@/components/admin/CasheaAdminActions';
import {
  ArrowLeft, Package, MapPin, Clock, Copy, Check, Hash,
  Truck, ExternalLink, Edit3, FileText, Loader2, Printer, Ticket, Mail,
} from 'lucide-react';

const statusConfig: Record<string, string> = {
  'Pendiente verificación Binance': 'bg-amber-100 text-amber-900 border border-amber-200',
  Pendiente: 'bg-yellow-100 text-yellow-800',
  'En Proceso': 'bg-gray-100 text-navy border border-gray-200',
  Enviado: 'bg-slate-100 text-slate-800 border border-gray-200',
  Entregado: 'bg-green-100 text-green-800',
  Cancelado: 'bg-red-100 text-red-800',
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('es-VE', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

function formatInternalId(id: string) {
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}…${id.slice(-8)}`;
}

export default function AdminOrderDetailPage() {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [idCopied, setIdCopied] = useState(false);
  const [showShipDialog, setShowShipDialog] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendEmailResult, setResendEmailResult] = useState<'ok' | 'error' | null>(null);
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  // RUN-10: distinguir "no existe" (404) de fallos transitorios (red/500/403) —
  // antes todo caía en "Pedido no encontrado" sin log.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/${id}`)
      .then(r => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setOrder(data);
        if (data) setNotesDraft(data.notes ?? '');
        setLoading(false);
      })
      .catch(err => {
        console.error('[admin/orders/:id] error cargando pedido:', err);
        setLoadFailed(true);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="py-16 text-center text-gray-400 text-sm">Cargando detalles del pedido...</div>;
  }

  if (loadFailed) {
    return (
      <div className="py-16 text-center text-sm">
        <p className="text-red-600 font-semibold">Error de conexión al cargar el pedido.</p>
        <p className="text-gray-500 mt-1">Revisa tu internet y recarga la página.</p>
      </div>
    );
  }

  if (!order) {
    return <div className="py-16 text-center text-red-500 text-sm">Pedido no encontrado.</div>;
  }

  const handleStatusChange = async (status: OrderStatus) => {
    if (!order) return;
    if (status === 'Enviado') {
      setShowShipDialog(true);
      return;
    }
    try {
      const r = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
      setOrder(await r.json());
    } catch {
      alert('No se pudo actualizar el estado del pedido.');
    }
  };

  const handleShipConfirm = async (tracking: {
    trackingNumber: string | null;
    trackingCarrier: string | null;
    trackingUrl: string | null;
    trackingPhotoUrl: string | null;
  }) => {
    const r = await fetch(`/api/orders/${order.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Enviado', ...tracking }),
    });
    if (!r.ok) {
      const errorData = await r.json().catch(() => ({}));
      throw new Error(errorData.message ?? 'No se pudo guardar el tracking.');
    }
    setOrder(await r.json());
  };

  const handleEditTracking = async (tracking: {
    trackingNumber: string | null;
    trackingCarrier: string | null;
    trackingUrl: string | null;
    trackingPhotoUrl: string | null;
  }) => {
    const r = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tracking),
    });
    if (!r.ok) {
      const errorData = await r.json().catch(() => ({}));
      throw new Error(errorData.error ?? 'No se pudo actualizar el tracking.');
    }
    setOrder(await r.json());
  };

  const subtotal = order.subtotalBeforeDiscount ?? order.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const isShipped = order.status === 'Enviado' || order.status === 'Entregado';
  const hasTracking = !!(order.trackingNumber || order.trackingCarrier || order.trackingUrl || order.trackingPhotoUrl);

  // PRD-051: reenviar email de confirmación al cliente desde el panel admin.
  const handleResendConfirmation = async () => {
    if (!order || resendingEmail) return;
    setResendingEmail(true);
    setResendEmailResult(null);
    try {
      const r = await fetch(`/api/orders/${order.id}/resend-confirmation`, { method: 'POST' });
      setResendEmailResult(r.ok ? 'ok' : 'error');
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert((err as { message?: string }).message ?? 'No se pudo reenviar el correo.');
      }
    } catch {
      setResendEmailResult('error');
      alert('No se pudo reenviar el correo.');
    } finally {
      setResendingEmail(false);
      window.setTimeout(() => setResendEmailResult(null), 3000);
    }
  };

  const copyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 2000);
    } catch {
      alert('No se pudo copiar al portapapeles.');
    }
  };

  const handleSaveNotes = async () => {
    if (!order) return;
    setSavingNotes(true);
    try {
      const r = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft.trim() || null }),
      });
      if (!r.ok) throw new Error();
      setOrder(await r.json());
      setNotesSaved(true);
      window.setTimeout(() => setNotesSaved(false), 2000);
    } catch {
      alert('No se pudieron guardar las notas.');
    } finally {
      setSavingNotes(false);
    }
  };

  const notesDirty = notesDraft.trim() !== (order.notes ?? '').trim();

  return (
    <div className="space-y-4">
      <button type="button"
        onClick={() => router.back()}
        className="hidden md:inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft size={14} /> Volver a pedidos
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pedido</p>
            <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight">
              #{String(order.orderNumber).padStart(4, '0')}
            </h1>
            <p className="text-xs text-gray-500 mt-1">{formatDateTime(order.createdAt)}</p>
          </div>
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
              {order.status}
            </span>
            {order.channel === 'whatsapp' && (
              <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">
                WhatsApp
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-stretch gap-2">
          <a
            href={`/admin/orders/${order.id}/etiqueta`}
            target="_blank"
            rel="noreferrer"
            className="touch-manipulation select-none min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy bg-navy px-3 sm:px-4 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-navy-700 active:bg-navy-800"
          >
            <Printer size={14} /> Imprimir etiqueta
          </a>
          {/* PRD-051: reenviar email de confirmación al cliente */}
          <button
            type="button"
            onClick={handleResendConfirmation}
            disabled={resendingEmail}
            title="Reenviar el email de confirmación al cliente"
            className="touch-manipulation select-none min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none"
          >
            {resendingEmail ? (
              <><Loader2 size={13} className="animate-spin" /> Enviando…</>
            ) : resendEmailResult === 'ok' ? (
              <><Check size={13} className="text-green-600" /> Enviado</>
            ) : (
              <><Mail size={13} /> Reenviar confirmación</>
            )}
          </button>
          <button
            type="button"
            onClick={copyOrderId}
            className="touch-manipulation select-none min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-3 text-[12px] sm:text-[13px] active:bg-slate-100"
            title={order.id}
          >
            <Hash size={12} className="text-slate-400" />
            <span className="font-mono text-slate-700">{formatInternalId(order.id)}</span>
            {idCopied
              ? <span className="ml-1 inline-flex items-center gap-1 text-green-700"><Check size={12} /> Copiado</span>
              : <span className="ml-1 inline-flex items-center gap-1 text-slate-500"><Copy size={12} /></span>
            }
          </button>
        </div>

        <div className="pt-4 border-t border-gray-100 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Estado del pedido / envío</p>
          {order.status === 'Pendiente verificación Binance' ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Verifica el pago en Binance y pulsa <strong>«Aprobar pago Binance»</strong> para continuar, o
              cancela el pedido si el pago no llegó.
            </p>
          ) : null}
          {order.status === 'Pendiente' && order.stockDeducted === false ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Pedido de WhatsApp: aún no se descontó inventario. Usa <strong>«Validar pago»</strong> para
              confirmar el pago y avanzar el estado.
            </p>
          ) : null}
          <StatusUpdateMenu
            onUpdate={handleStatusChange}
            currentStatus={order.status}
            allowedOnly={
              order.status === 'Pendiente verificación Binance'
                ? ['Cancelado']
                : order.status === 'Pendiente' && order.stockDeducted === false
                  ? ['Pendiente', 'Cancelado']
                  : undefined
            }
          />
        </div>
      </div>

      {/* Tracking destacado */}
      {(isShipped || hasTracking) && (
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
                <Truck size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-navy">Información de envío</p>
                {order.shippedAt && (
                  <p className="text-[11px] text-gray-500">Enviado el {formatDateTime(order.shippedAt)}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowShipDialog(true)}
              className="touch-manipulation select-none min-h-[44px] inline-flex items-center gap-1.5 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-navy bg-white border border-gray-200 rounded-xl active:bg-gray-50"
            >
              <Edit3 size={13} /> Editar
            </button>
          </div>

          {hasTracking ? (
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {order.trackingCarrier && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Transportista</dt>
                  <dd className="text-sm font-semibold text-navy mt-0.5">{order.trackingCarrier}</dd>
                </div>
              )}
              {order.trackingNumber && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Número de seguimiento</dt>
                  <dd className="font-mono text-sm font-bold text-navy mt-0.5 break-all">{order.trackingNumber}</dd>
                </div>
              )}
              {order.trackingUrl && (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Enlace de rastreo</dt>
                  <dd className="mt-0.5">
                    <a href={order.trackingUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-navy underline break-all">
                      Rastrear envío <ExternalLink size={12} />
                    </a>
                  </dd>
                </div>
              )}
              {order.trackingPhotoUrl && (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Comprobante / guía</dt>
                  <a href={order.trackingPhotoUrl} target="_blank" rel="noreferrer" className="block max-w-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={order.trackingPhotoUrl} alt="Comprobante de envío / guía" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full rounded-xl border border-gray-200" />
                  </a>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-xs text-gray-500">
              Aún no se ha registrado tracking. Haz clic en <strong>Editar</strong> para agregar el número de guía y/o foto.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Items */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Package size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-800">Artículos</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {order.items.map(item => (
              <li key={item.productId} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.productName}
                    <span
                      className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border align-middle ${
                        item.freeShipping
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-slate-500 bg-slate-50 border-slate-200'
                      }`}
                    >
                      {item.freeShipping ? 'Elegible MRW' : 'Sin beneficio MRW'}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 nums">
                    {hasFrozenBsPricing(order) ? (
                      <>
                        {getOrderDualMoney(item.price, order).bs}
                        <span className="text-gray-400"> · </span>
                        {getOrderDualMoney(item.price, order).usd}
                        <span className="text-gray-400"> c/u</span>
                        <span> × {item.quantity}</span>
                      </>
                    ) : (
                      <>{getOrderDualMoney(item.price, order).usd} c/u × {item.quantity}</>
                    )}
                  </p>
                </div>
                <DualOrderMoney amount={item.price * item.quantity} order={order} variant="admin" />
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600 items-start gap-2">
              <span>Subtotal</span>
              <DualOrderMoney amount={subtotal} order={order} variant="admin" />
            </div>
            {order.paymentDiscount != null && order.paymentDiscount > 0 ? (
              <div className="flex justify-between text-emerald-600 items-start gap-2">
                <span>
                  Descuento por pago en divisas
                  {order.paymentDiscountPercent != null && order.paymentDiscountPercent > 0
                    ? ` (${order.paymentDiscountPercent}%)`
                    : ''}
                </span>
                <span className="inline-flex items-center">−<DualOrderMoney amount={order.paymentDiscount} order={order} variant="admin" /></span>
              </div>
            ) : null}
            <div className="flex justify-between text-gray-600">
              <span>Envío</span>
              <span className={`font-medium ${isStorePickupOrderAddress(order.shippingDetails.address) || order.freeShipping ? 'text-green-600' : 'text-gray-700'}`}>
                {isStorePickupOrderAddress(order.shippingDetails.address)
                  ? 'Retiro en tienda'
                  : order.freeShipping
                    ? 'Envío gratis por MRW'
                    : 'Cobro a destino'}
              </span>
            </div>
            {order.couponDiscount && order.couponDiscount > 0 ? (
              <div className="flex justify-between text-emerald-600 items-start gap-2">
                <span className="inline-flex items-center gap-1">
                  <Ticket size={13} /> Cupón {order.couponCode}
                </span>
                <span className="inline-flex items-center">−<DualOrderMoney amount={order.couponDiscount} order={order} variant="admin" /></span>
              </div>
            ) : null}
            <div className="flex justify-between font-bold text-gray-900 text-base pt-1.5 border-t border-gray-200 items-end gap-2">
              <span>Total</span>
              <DualOrderMoney amount={order.total} order={order} variant="admin" emphasis="total" />
            </div>
          </div>
          <OrderFrozenRateBanner order={order} variant="admin" />
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <MapPin size={14} className="text-gray-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Envío a</h3>
            </div>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p className="font-semibold text-gray-900">{order.customerName}</p>
              <p>{order.shippingDetails.address}</p>
              <p>{order.shippingDetails.city}, {order.shippingDetails.state}</p>
              {order.shippingDetails.zipCode !== 'N/A' && <p>CP: {order.shippingDetails.zipCode}</p>}
              <p>{order.shippingDetails.country}</p>
              {order.customerPhone && (
                <p className="pt-1.5 mt-1.5 border-t border-gray-100 text-xs">
                  <span className="text-gray-400">Teléfono:</span> <span className="font-medium">{order.customerPhone}</span>
                </p>
              )}
            </div>
          </div>

          <PaymentVerificationPanel order={order} onUpdate={setOrder} />

          {/* Fase 7: bloque Cashea — solo visible cuando el pedido pasó por
              /api/cashea/session (casheaStatus no nulo). No expone datos
              sensibles; casheaOrderId es el idNumber devuelto por Cashea, no
              una credencial. */}
          {order.casheaStatus && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <Hash size={14} className="text-gray-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Cashea</h3>
                </div>
                <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {CASHEA_STATUS_ADMIN_LABELS[order.casheaStatus]}
                </span>
              </div>
              <dl className="text-sm space-y-1.5">
                {order.casheaOrderId && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">ID orden Cashea</dt>
                    <dd className="text-right font-mono font-semibold text-navy break-all">{order.casheaOrderId}</dd>
                  </div>
                )}
                {order.casheaInitialAmount != null && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Inicial verificada</dt>
                    <dd className="font-medium text-gray-800">
                      {order.casheaInitialAmount.toFixed(2)} {order.casheaCurrency ?? ''}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Intentos de verificación</dt>
                  <dd className="font-medium text-gray-800">{order.casheaAttemptCount ?? 0}</dd>
                </div>
                {order.casheaLastResponseCode && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Última respuesta</dt>
                    <dd className="font-mono text-gray-800">{order.casheaLastResponseCode}</dd>
                  </div>
                )}
                {order.casheaRedirectedAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Redirigido</dt>
                    <dd className="text-gray-800">{formatDateTime(order.casheaRedirectedAt)}</dd>
                  </div>
                )}
                {order.casheaReturnedAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Retornó</dt>
                    <dd className="text-gray-800">{formatDateTime(order.casheaReturnedAt)}</dd>
                  </div>
                )}
                {order.casheaConfirmedAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Confirmado</dt>
                    <dd className="text-gray-800">{formatDateTime(order.casheaConfirmedAt)}</dd>
                  </div>
                )}
                {order.casheaCancelledAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500">Cancelado</dt>
                    <dd className="text-gray-800">{formatDateTime(order.casheaCancelledAt)}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <CasheaAdminActions order={order} onUpdate={setOrder} />
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <Clock size={14} className="text-gray-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Cronología</h3>
            </div>
            <ul className="text-xs space-y-1.5 text-gray-600">
              <li><span className="text-gray-400">Creado:</span> {formatDateTime(order.createdAt)}</li>
              {order.paidAt && <li><span className="text-gray-400">Pago validado:</span> {formatDateTime(order.paidAt)}</li>}
              {order.shippedAt && <li><span className="text-gray-400">Enviado:</span> {formatDateTime(order.shippedAt)}</li>}
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <FileText size={14} className="text-gray-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Notas internas</h3>
            </div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Notas visibles solo para el equipo (no se envían al cliente)…"
              className="w-full rounded-xl border border-gray-200 bg-slate-50/60 px-3 py-2 text-sm text-navy placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-navy/30 focus:bg-white resize-y"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 nums">{notesDraft.length}/2000</span>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes || !notesDirty}
                className="touch-manipulation select-none min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 text-xs font-semibold text-white hover:bg-navy-700 active:bg-navy-800 disabled:opacity-40 disabled:pointer-events-none"
              >
                {savingNotes ? (
                  <><Loader2 size={13} className="animate-spin" /> Guardando…</>
                ) : notesSaved ? (
                  <><Check size={13} /> Guardado</>
                ) : (
                  'Guardar notas'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ShipOrderDialog
        open={showShipDialog}
        orderNumber={order.orderNumber}
        initial={{
          trackingNumber:   order.trackingNumber,
          trackingCarrier:  order.trackingCarrier,
          trackingUrl:      order.trackingUrl,
          trackingPhotoUrl: order.trackingPhotoUrl,
        }}
        editMode={isShipped && hasTracking}
        onClose={() => setShowShipDialog(false)}
        onConfirm={isShipped ? handleEditTracking : handleShipConfirm}
      />
    </div>
  );
}
