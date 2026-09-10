'use client';

import { useEffect, useState, useRef } from 'react';
import { Truck, X, Loader2 } from 'lucide-react';
import PhotoUploader from '@/components/admin/PhotoUploader';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface ShipOrderDialogProps {
  open: boolean;
  orderNumber: number | string;
  /** Datos previos (si el pedido ya fue marcado y se está editando). */
  initial?: {
    trackingNumber?:   string | null;
    trackingCarrier?:  string | null;
    trackingUrl?:      string | null;
    trackingPhotoUrl?: string | null;
  };
  onClose: () => void;
  onConfirm: (payload: {
    trackingNumber:   string | null;
    trackingCarrier:  string | null;
    trackingUrl:      string | null;
    trackingPhotoUrl: string | null;
  }) => Promise<void> | void;
  /** Si true muestra "Guardar tracking" y no menciona el cambio de estado. */
  editMode?: boolean;
}

const CARRIERS = [
  'MRW',
  'Zoom',
  'Tealca',
  'Domesa',
  'Liberty Express',
  'Mensajería propia',
  'Retiro en tienda',
  'Otro',
];

export default function ShipOrderDialog({
  open,
  orderNumber,
  initial,
  onClose,
  onConfirm,
  editMode = false,
}: ShipOrderDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [trackingNumber, setTrackingNumber]     = useState('');
  const [trackingCarrier, setTrackingCarrier]   = useState('');
  const [trackingUrl, setTrackingUrl]           = useState('');
  const [trackingPhotoUrl, setTrackingPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting]             = useState(false);
  const [error, setError]                       = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTrackingNumber(initial?.trackingNumber ?? '');
      setTrackingCarrier(initial?.trackingCarrier ?? '');
      setTrackingUrl(initial?.trackingUrl ?? '');
      setTrackingPhotoUrl(initial?.trackingPhotoUrl ?? null);
      setError(null);
    }
  }, [open, initial]);

  // Scroll lock compartido con compensación de scrollbar
  useBodyScrollLock(open);

  // Focus trap: foco inicial en el primer campo, Tab/Shift+Tab dentro, Escape cierra
  useFocusTrap({ containerRef: dialogRef, enabled: open, onClose });

  if (!open) return null;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        trackingNumber:   trackingNumber.trim()  || null,
        trackingCarrier:  trackingCarrier.trim() || null,
        trackingUrl:      trackingUrl.trim()     || null,
        trackingPhotoUrl: trackingPhotoUrl,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ship-dialog-title"
      className="fixed inset-0 z-50 flex sm:items-center sm:justify-center"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full sm:w-[460px] sm:max-w-[92vw] sm:my-6 bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-screen max-h-[100dvh] sm:max-h-[88vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header
          className="sticky top-0 bg-white sm:rounded-t-2xl border-b border-gray-100 px-4 py-3.5 flex items-center gap-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}
        >
          <span className="w-9 h-9 rounded-xl bg-amber-50 text-navy flex items-center justify-center">
            <Truck size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="ship-dialog-title" className="text-base font-black text-navy leading-tight truncate">
              {editMode ? 'Tracking del pedido' : 'Marcar como Enviado'}
            </h2>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5 truncate">
              Pedido #{String(orderNumber).padStart(4, '0')} · todos los campos son opcionales
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 touch-manipulation"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
              Número de seguimiento
              <span className="ml-1.5 text-[10px] font-medium text-gray-400 normal-case">(opcional)</span>
            </label>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="Ej: 12345678"
              className="w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
            />
            <p className="text-[11px] text-gray-500 mt-1">El cliente lo verá en el detalle de su pedido.</p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
              Empresa de envío
              <span className="ml-1.5 text-[10px] font-medium text-gray-400 normal-case">(opcional)</span>
            </label>
            <select
              value={CARRIERS.includes(trackingCarrier) ? trackingCarrier : (trackingCarrier ? '__custom__' : '')}
              onChange={e => {
                if (e.target.value === '__custom__') return;
                setTrackingCarrier(e.target.value);
              }}
              className="w-full min-h-[48px] px-3 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20"
            >
              <option value="">— Sin especificar —</option>
              {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">Personalizado…</option>
            </select>
            {(trackingCarrier === '__custom__' || (trackingCarrier && !CARRIERS.includes(trackingCarrier))) && (
              <input
                type="text"
                value={trackingCarrier === '__custom__' ? '' : trackingCarrier}
                onChange={e => setTrackingCarrier(e.target.value)}
                placeholder="Nombre de la empresa o transportista"
                className="mt-2 w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
              URL de seguimiento
              <span className="ml-1.5 text-[10px] font-medium text-gray-400 normal-case">(opcional)</span>
            </label>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              value={trackingUrl}
              onChange={e => setTrackingUrl(e.target.value)}
              placeholder="https://www.mrw.com.ve/track/12345678"
              className="w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
            <p className="text-[11px] text-gray-500 mt-1">Si la pegas, el cliente verá un botón &ldquo;Rastrear envío&rdquo;.</p>
          </div>

          <PhotoUploader
            value={trackingPhotoUrl}
            onChange={setTrackingPhotoUrl}
            purpose="tracking"
            label="Foto de la guía / paquete"
            hint="Opcional. Toma foto desde el celular o sube desde galería. Sirve como comprobante para el cliente."
          />

          {error && (
            <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <footer
          className="sticky bottom-0 bg-white sm:rounded-b-2xl border-t border-gray-100 px-4 py-3 flex gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 min-h-[52px] touch-manipulation inline-flex items-center justify-center bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-[2] min-h-[52px] touch-manipulation inline-flex items-center justify-center gap-2 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase tracking-wide rounded-xl active:bg-yellow-300 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
            {editMode ? 'Guardar tracking' : 'Marcar como Enviado'}
          </button>
        </footer>
      </div>
    </div>
  );
}
