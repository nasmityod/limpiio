/**
 * Instrumentation de Next.js (server/edge).
 *
 * 1. Normaliza `DATABASE_URL` antes que cualquier import de `pg`/Prisma —
 *    evita el SECURITY WARNING de pg-connection-string cuando la URL trae
 *    sslmode=require|prefer|verify-ca (p. ej. Neon en Vercel).
 * 2. PRD-033/152: inicializa Sentry en runtime nodejs/edge cuando SENTRY_DSN
 *    está configurada (sin DSN es un no-op — cero impacto en dev).
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { normalizePostgresUrlForNodePg } = await import(
      './lib/normalize-postgres-url-for-node-pg'
    );
    const raw = process.env.DATABASE_URL;
    const next = normalizePostgresUrlForNodePg(raw);
    if (next != null && next !== '' && next !== raw) {
      process.env.DATABASE_URL = next;
    }
  }

  if (process.env.SENTRY_DSN) {
    const { sanitizeText } = await import('./lib/safe-logger');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      // Muestreo bajo de traces: suficiente para detectar endpoints lentos
      // sin consumir cuota; los errores se capturan siempre.
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      // SEC-2026-09: los mensajes de error (Prisma, CheckoutError, fetch) pasan por
      // el mismo saneado que safe-logger antes de salir hacia Sentry.
      beforeSend(event) {
        if (event.message) event.message = sanitizeText(event.message);
        for (const ex of event.exception?.values ?? []) {
          if (ex.value) ex.value = sanitizeText(ex.value);
        }
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.data;
        }
        return event;
      },
    });
  }
}

/** PRD-033: captura errores de Server Components / Route Handlers / Server
 *  Actions con contexto de request. No-op si Sentry no fue inicializado. */
export const onRequestError = Sentry.captureRequestError;
