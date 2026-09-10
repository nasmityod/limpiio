'use client';

/**
 * PRD-034: error boundary GLOBAL — captura fallos del root layout que
 * `app/error.tsx` no puede atrapar. Reemplaza todo el documento, por eso
 * define <html>/<body> y usa estilos inline (el CSS global no está disponible).
 * Reporta a Sentry (PRD-033) cuando está configurado.
 */
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';
import {
  APP_CHUNK_RELOAD_KEY,
  isChunkLoadError,
  tryRecoverFromChunkLoadError,
} from '@/lib/chunk-load-error';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error('[global-error]', error);
    if (isChunkLoadError(error)) {
      tryRecoverFromChunkLoadError(APP_CHUNK_RELOAD_KEY);
    }
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0B1220',
          color: '#fff',
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <p
            style={{
              display: 'inline-block',
              backgroundColor: '#FFD700',
              color: '#0B1220',
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              borderRadius: 999,
              padding: '6px 14px',
              marginBottom: 20,
            }}
          >
            MundoTech
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 12px' }}>
            Algo salió mal de nuestro lado
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)', margin: '0 0 24px' }}>
            Ya quedó registrado para revisarlo. Intenta de nuevo en unos segundos;
            si sigue fallando, escríbenos y te ayudamos a completar tu compra.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '0 0 24px' }}>
              Código de referencia: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              backgroundColor: '#FFD700',
              color: '#0B1220',
              border: 'none',
              borderRadius: 12,
              padding: '14px 28px',
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
          <p style={{ marginTop: 16 }}>
            <Link href="/" style={{ color: '#FFD700', fontSize: 14, fontWeight: 600 }}>
              Volver al inicio
            </Link>
          </p>
        </div>
      </body>
    </html>
  );
}
