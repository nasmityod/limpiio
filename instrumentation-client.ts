/**
 * PRD-033: Sentry en el navegador. Solo se activa si NEXT_PUBLIC_SENTRY_DSN
 * está configurada (sin DSN es no-op y no añade requests).
 *
 * DEPENDENCIA-01 (middleware.ts / CSP): al activar el DSN público hay que
 * añadir el dominio de ingesta de Sentry (https://*.ingest.sentry.io o el
 * propio del DSN) a `connect-src` en la CSP, o los eventos serán bloqueados.
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
