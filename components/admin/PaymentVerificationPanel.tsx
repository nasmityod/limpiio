'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  ShieldCheck, ShieldAlert, CreditCard, ImageOff, XCircle, Loader2, ExternalLink, X, RotateCcw,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/definitions';
import { DualOrderMoney } from '@/components/order/DualOrderMoney';
import { ApproveBinanceButton } from '@/components/admin/ApproveBinanceButton';
import { ValidatePaymentAdminButton } from '@/components/admin/ValidatePaymentAdminButton';
import { rejectOrderPayment } from '@/app/actions/orderActions';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString('es-VE', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

type ProofState =
  | { type: 'loading' }
  | { type: 'private'; url: string }
  | { type: 'legacy'; url: string }
  | { type: 'blocked' }
  | { type: 'none' }
  | { type: 'error'; message: string };

function PaymentDetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono font-semibold text-navy break-all' : 'font-medium text-gray-800'}`}>{value}</dd>
    </div>
  );
}

export function PaymentVerificationPanel({
  order,
  onUpdate,
}: {
  order: Order;
  onUpdate: (o: Order) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [proofState, setProofState] = useState<ProofState>({ type: 'none' });
  const mountedRef = useRef(false);

  const isPendingBinance = order.status === 'Pendiente verificación Binance';
  const isPending = order.status === 'Pendiente';
  const isVerified = !!order.paidAt && ['En Proceso', 'Enviado', 'Entregado'].includes(order.status);
  const isRejected = order.status === 'Cancelado' && !!order.paymentRejectionReason;
  const canAct = isPending || isPendingBinance;

  // SESIÓN 04: solicitar URL del comprobante al abrir el panel (no al cargar la página).
  // No guarda en localStorage; limpia estado al cerrar (cleanup del effect).
  useEffect(() => {
    mountedRef.current = true;
    // Si no hay ningún comprobante, no hacer fetch
    if (!order.paymentProofKey && !order.paymentProofUrl) {
      setProofState({ type: 'none' });
      return;
    }

    setProofState({ type: 'loading' });

    const controller = new AbortController();
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    fetch(`/api/orders/${order.id}/payment-proof`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!mountedRef.current) return;
        if (res.status === 404) {
          setProofState({ type: 'none' });
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setProofState({ type: 'blocked' });
          return;
        }
        if (!res.ok) {
          setProofState({ type: 'error', message: `Error ${res.status}` });
          return;
        }
        const data: { url?: string; expiresIn?: number; legacyUrl?: string } =
          await res.json();
        if (!mountedRef.current) return;
        if (data.url) {
          setProofState({ type: 'private', url: data.url });
          if (typeof data.expiresIn === 'number' && data.expiresIn > 0) {
            expiryTimer = setTimeout(() => {
              if (mountedRef.current) {
                setProofState({ type: 'none' });
              }
            }, data.expiresIn * 1000);
          }
        } else if (data.legacyUrl) {
          setProofState({ type: 'legacy', url: data.legacyUrl });
        } else {
          setProofState({ type: 'none' });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!mountedRef.current) return;
        setProofState({ type: 'error', message: 'Error de conexión.' });
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
      if (expiryTimer) clearTimeout(expiryTimer);
      setProofState({ type: 'none' });
    };
  }, [order.id, order.paymentProofKey, order.paymentProofUrl]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-gray-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Verificación de pago</h3>
        </div>
        {isVerified && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <ShieldCheck size={12} /> Verificado
          </span>
        )}
        {isRejected && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
            <ShieldAlert size={12} /> Rechazado
          </span>
        )}
      </div>

      {/* Datos declarados por el cliente */}
      <dl className="text-sm space-y-1.5">
        <PaymentDetailRow label="Método" value={order.paymentMethod} />
        <PaymentDetailRow label="ID método" value={order.paymentMethodId} mono />
        <PaymentDetailRow label="Moneda" value={order.paymentCurrency} />
        <PaymentDetailRow
          label="Descuento divisas"
          value={
            order.paymentDiscount != null && order.paymentDiscount > 0
              ? `${order.paymentDiscountPercent ?? ''}% → snapshot`
              : null
          }
        />
        {order.paymentDiscount != null && order.paymentDiscount > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">Monto descuento</dt>
            <dd><DualOrderMoney amount={order.paymentDiscount} order={order} variant="admin" /></dd>
          </div>
        )}
        {order.subtotalBeforeDiscount != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">Subtotal original</dt>
            <dd><DualOrderMoney amount={order.subtotalBeforeDiscount} order={order} variant="admin" /></dd>
          </div>
        )}
        <PaymentDetailRow label="Banco" value={order.paymentBank} />
        <PaymentDetailRow label="Referencia" value={order.paymentReference} mono />
        <PaymentDetailRow label="Cédula titular" value={order.paymentHolderIdNumber} />
        <PaymentDetailRow label="Teléfono titular" value={order.paymentHolderPhone} />
        <div className="flex justify-between gap-2 pt-1.5 mt-1.5 border-t border-gray-100 items-end">
          <dt className="text-gray-500 font-semibold">Monto a verificar</dt>
          <dd><DualOrderMoney amount={order.total} order={order} variant="admin" emphasis="total" /></dd>
        </div>
      </dl>

      {order.paymentDiscount != null && order.paymentDiscount > 0 && (
        <div className="mt-3">
          <RevertDivisaDiscountButton order={order} onReverted={onUpdate} />
        </div>
      )}

      {/* SESIÓN 04: comprobante servido desde endpoint autenticado o legacy */}
      <div className="mt-3">
        {proofState.type === 'loading' && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-gray-200 text-gray-500 text-xs px-3 py-6 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Cargando comprobante…
          </div>
        )}

        {proofState.type === 'private' && (
          <a href={proofState.url} target="_blank" rel="noreferrer" className="group block relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofState.url}
              alt="Comprobante de pago"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              className="w-full rounded-xl border border-gray-200 max-h-72 object-contain bg-slate-50"
            />
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-black/60 rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Ampliar <ExternalLink size={11} />
            </span>
          </a>
        )}

        {proofState.type === 'legacy' && (
          <a href={proofState.url} target="_blank" rel="noreferrer" className="group block relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofState.url}
              alt="Comprobante de pago"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              className="w-full rounded-xl border border-gray-200 max-h-72 object-contain bg-slate-50"
            />
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-black/60 rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Ampliar <ExternalLink size={11} />
            </span>
          </a>
        )}

        {proofState.type === 'blocked' && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2.5">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            <span>
              El comprobante adjunto apunta a un origen no confiable y fue bloqueado
              por seguridad. No abras el enlace. Verifica el pago directamente en el
              banco antes de validar.
            </span>
          </div>
        )}

        {proofState.type === 'none' && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5">
            <ImageOff size={14} className="shrink-0" />
            El cliente no adjuntó comprobante. Verifica el pago manualmente antes de validar.
          </div>
        )}

        {proofState.type === 'error' && (
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2.5">
            <ShieldAlert size={14} className="shrink-0" />
            No se pudo cargar el comprobante ({proofState.message}).
          </div>
        )}
      </div>

      {/* Acciones de verificación */}
      {canAct && (
        <div className="mt-4 space-y-2">
          {isPendingBinance && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Confirma el pago en Binance con <strong>«Aprobar pago Binance»</strong>; luego usa <strong>«Validar pago»</strong> para preparar el envío.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <ApproveBinanceButton order={order} onApproved={onUpdate} />
            <ValidatePaymentAdminButton order={order} onValidated={onUpdate} />
            <button
              type="button"
              onClick={() => setShowReject(true)}
              className="touch-manipulation select-none min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 sm:px-4 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 active:bg-rose-100"
            >
              <XCircle size={14} /> Rechazar pago
            </button>
          </div>
        </div>
      )}

      {/* Auditoría */}
      {(isVerified || isRejected) && (
        <div className="mt-4 pt-3 border-t border-gray-100 text-xs space-y-1">
          {isVerified && order.paidAt && (
            <p className="text-emerald-700">
              <ShieldCheck size={12} className="inline mr-1" />
              Pago verificado el {formatDateTime(order.paidAt)}
            </p>
          )}
          {isRejected && (
            <p className="text-rose-700">
              <ShieldAlert size={12} className="inline mr-1" />
              Motivo del rechazo: <strong>{order.paymentRejectionReason}</strong>
            </p>
          )}
          {order.paymentVerifiedBy && (
            <p className="text-gray-400">Gestionado por: {order.paymentVerifiedBy}</p>
          )}
        </div>
      )}

      {showReject && (
        <RejectPaymentDialog
          order={order}
          onClose={() => setShowReject(false)}
          onDone={(o) => { setShowReject(false); onUpdate(o); }}
        />
      )}
    </div>
  );
}

function RevertDivisaDiscountButton({
  order,
  onReverted,
}: {
  order: Order;
  onReverted: (o: Order) => void;
}) {
  const [pending, startTransition] = useTransition();

  const handleRevert = () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        '¿Revertir el descuento por pago en divisas? El total del pedido volverá al precio full (subtotal − cupón). Esta acción no se puede deshacer desde aquí.',
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}/revert-divisa-discount`, {
          method: 'POST',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.message ?? 'No se pudo revertir el descuento.');
        }
        onReverted(data as Order);
        toast({
          title: 'Descuento revertido',
          description: 'El pedido quedó a precio full (sin descuento por divisas).',
        });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'No se pudo revertir',
          description: err instanceof Error ? err.message : 'Error inesperado.',
        });
      }
    });
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleRevert}
      className="touch-manipulation select-none w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs sm:text-sm font-semibold text-amber-900 hover:bg-amber-100 active:bg-amber-200 disabled:opacity-60"
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
      Revertir descuento por divisas
    </button>
  );
}

function RejectPaymentDialog({
  order,
  onClose,
  onDone,
}: {
  order: Order;
  onClose: () => void;
  onDone: (o: Order) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  useBodyScrollLock(true);
  useFocusTrap({ containerRef: dialogRef, enabled: true, onClose });

  const submit = () => {
    startTransition(async () => {
      const result = await rejectOrderPayment(order.id, reason);
      if (result.success) {
        toast({ title: 'Pago rechazado', description: result.message });
        onDone(result.order);
      } else {
        toast({ variant: 'destructive', title: 'No se pudo rechazar', description: result.message });
      }
    });
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-payment-title"
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full sm:w-[440px] sm:max-w-[92vw] bg-white sm:rounded-2xl shadow-2xl flex flex-col">
        <header className="border-b border-gray-100 px-4 py-3.5 flex items-center justify-between gap-3">
          <h2 id="reject-payment-title" className="text-base font-black text-navy">Rechazar pago</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </header>
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-gray-600">
            El pedido <strong className="text-navy">#{String(order.orderNumber).padStart(4, '0')}</strong> se cancelará,
            el stock se restaurará y se notificará al cliente por correo.
          </p>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">Motivo (visible para el cliente)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej: No recibimos el pago / referencia no encontrada en el banco."
              className="w-full px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400 resize-y"
            />
          </div>
        </div>
        <footer className="border-t border-gray-100 px-4 py-3 flex gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="flex-1 min-h-[52px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={pending} className="flex-[2] min-h-[52px] inline-flex items-center justify-center gap-2 bg-rose-600 text-white text-sm font-black uppercase rounded-xl hover:bg-rose-700 active:bg-rose-800 disabled:opacity-60">
            {pending ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
            Rechazar y cancelar
          </button>
        </footer>
      </div>
    </div>
  );
}
