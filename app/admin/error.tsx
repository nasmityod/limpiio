'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  ADMIN_CHUNK_RELOAD_KEY,
  isChunkLoadError,
  tryRecoverFromChunkLoadError,
} from '@/lib/chunk-load-error';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] Error en panel de administración:', error);
    if (isChunkLoadError(error)) {
      tryRecoverFromChunkLoadError(ADMIN_CHUNK_RELOAD_KEY);
    }
  }, [error]);

  return (
    <div
      data-admin-error
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
        <AlertTriangle size={26} strokeWidth={2} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-navy">Algo salió mal</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ocurrió un error inesperado en el panel. Intenta recargar.
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Código: {error.digest}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-navy px-5 text-sm font-semibold text-white transition active:opacity-80"
      >
        <RefreshCw size={14} />
        Reintentar
      </button>
    </div>
  );
}
