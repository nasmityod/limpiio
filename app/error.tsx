"use client";

/**
 * error.tsx — Boundary de error global (Next.js App Router)
 * DEBE ser Client Component (Next.js requiere "use client").
 * Captura errores de runtime en rutas que no tienen su propio error.tsx.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, MessageCircle } from "lucide-react";
import {
  APP_CHUNK_RELOAD_KEY,
  isChunkLoadError,
  tryRecoverFromChunkLoadError,
} from "@/lib/chunk-load-error";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log silencioso: en producción puedes enviar a Sentry / Datadog aquí
    console.error("[GlobalError boundary]", error);
    if (isChunkLoadError(error)) {
      tryRecoverFromChunkLoadError(APP_CHUNK_RELOAD_KEY);
    }
  }, [error]);

  return (
    <div data-app-error className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full text-center">

        {/* Icono */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-50 border-2 border-red-100 mb-6">
          <AlertTriangle className="w-9 h-9 text-red-700" strokeWidth={1.5} />
        </div>

        {/* Título */}
        <h1 className="text-3xl font-black tracking-tight text-navy mb-3">
          Algo salió mal
        </h1>

        {/* Descripción */}
        <p className="text-slate-600 text-base leading-relaxed mb-2">
          Ocurrió un error inesperado. Puedes intentar recargar la página o
          volver al inicio.
        </p>

        {/* Digest visible solo en desarrollo */}
        {process.env.NODE_ENV === "development" && error?.digest && (
          <p className="text-xs text-slate-600 font-mono bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-4 break-all">
            digest: {error.digest}
          </p>
        )}
        {process.env.NODE_ENV === "development" && error?.message && (
          <p className="text-xs text-red-700 font-mono bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-6 break-all text-left">
            {error.message}
          </p>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 bg-navy text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-navy-700 active:scale-95 transition-all shadow-card"
          >
            <RefreshCw className="w-4 h-4" />
            Intentar de nuevo
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-sm px-6 py-3 rounded-xl hover:bg-surface-muted active:scale-95 transition-all shadow-soft"
          >
            <Home className="w-4 h-4" />
            Ir al inicio
          </Link>

          {/* H23: /#contacto no existía (enlace muerto) — la página de la
              tienda física tiene teléfonos, correo, horario y mapa */}
          <Link
            href="/tienda-barquisimeto"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-navy text-sm font-medium transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Contactar soporte
          </Link>
        </div>

        {/* Branding sutil */}
        <p className="mt-10 text-xs text-slate-600">
          <span className="font-black tracking-tight">
            Mundo<span className="text-amber-700">Tech</span>
          </span>{" "}
          — Si el problema persiste, contáctanos.
        </p>
      </div>
    </div>
  );
}
