'use client';

/**
 * app/components/checkout/CasheaCheckoutButton.tsx — Fase 6 ("Frontend del
 * checkout Cashea con el SDK oficial", ver
 * docs/MundoTech-Cashea-Orquestacion-Cursor.md).
 *
 * Monta el botón oficial de `cashea-web-checkout-sdk@1.1.19`. El SDK se
 * importa dinámicamente (nunca en el bundle de servidor) y solo se
 * instancia con `publicApiKey` — la clave privada de Cashea vive
 * exclusivamente en `lib/cashea-config.ts` / `lib/cashea.ts` (servidor) y
 * nunca llega a este componente.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { CasheaPayload } from '@/lib/cashea';

export interface CasheaCheckoutButtonProps {
  /** `NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY` recibida de POST /api/cashea/session — nunca la clave privada. */
  publicApiKey: string;
  payload: CasheaPayload;
  /** Notifica al padre si el SDK no pudo montar el botón (red, script bloqueado, etc.). */
  onError?: (message: string) => void;
}

type MountState = 'loading' | 'ready' | 'error';

const CasheaCheckoutButton = ({ publicApiKey, payload, onError }: CasheaCheckoutButtonProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<MountState>('loading');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';
    setState('loading');

    // Import dinámico: el SDK de Cashea es exclusivamente de cliente y no
    // debe formar parte del bundle de servidor ni ejecutarse durante SSR.
    import('cashea-web-checkout-sdk')
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        const CheckoutSDK = mod.default;
        const sdk = new CheckoutSDK({ apiKey: publicApiKey });
        sdk.createCheckoutButton({ payload, container: containerRef.current });
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[cashea-checkout-button] no se pudo cargar el SDK:', err);
        setState('error');
        onError?.('No pudimos cargar el botón de Cashea. Revisa tu conexión e intenta de nuevo.');
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = '';
    };
    // `payload`/`publicApiKey` no deben re-disparar el montaje: cada sesión
    // Cashea es de un solo uso — el padre fuerza un remount completo con
    // `key={orderId}` cuando genera una sesión nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
          <Loader2 size={16} className="animate-spin" /> Cargando botón de Cashea…
        </div>
      )}
      {state === 'error' && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            No pudimos cargar el botón de Cashea. Revisa tu conexión e intenta de nuevo.
          </p>
        </div>
      )}
      <div ref={containerRef} data-testid="cashea-checkout-button-container" />
    </div>
  );
};

export default CasheaCheckoutButton;
