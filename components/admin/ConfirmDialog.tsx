'use client';

import { useRef } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación accesible.
 *
 * - `role="alertdialog"` para diálogos destructivos/de advertencia.
 * - `aria-describedby` enlazado al mensaje.
 * - El foco inicial va al botón **Cancelar** (no a la acción peligrosa),
 *   usando `focusLast` para que el último elemento enfocable reciba foco.
 * - Escape cierra, Tab/Shift+Tab ciclan dentro del diálogo.
 * - Targets de 44px mínimo.
 * - Scroll lock con compensación de scrollbar.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);
  // focusLast = true: el foco inicial va al último elemento (Cancelar),
  // no al botón peligroso de confirmación.
  useFocusTrap({ containerRef: dialogRef, enabled: open, focusLast: true, onClose: onCancel });

  if (!open) return null;

  const iconColors = variant === 'danger'
    ? 'bg-red-100 text-red-600'
    : 'bg-amber-100 text-amber-600';

  const confirmColors = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-amber-500 hover:bg-amber-600 text-white';

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6">
          <div className={`w-12 h-12 rounded-full ${iconColors} flex items-center justify-center mx-auto mb-4`}>
            <AlertTriangle size={24} />
          </div>

          <h2
            id="confirm-dialog-title"
            className="text-lg font-bold text-navy text-center mb-2"
          >
            {title}
          </h2>

          <p
            id="confirm-dialog-message"
            className="text-sm text-slate-600 text-center leading-relaxed"
          >
            {message}
          </p>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 min-h-[48px] rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 min-h-[48px] rounded-xl text-sm font-bold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 ${confirmColors}`}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          aria-label="Cerrar"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
