'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { Cookie } from 'lucide-react';
import { setAnalyticsConsent, type AnalyticsConsent } from '@/lib/ga4';
import { getMetaPixelId, setMetaPixelConsent, trackMetaPageView } from '@/lib/meta-pixel';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    __mtAnalyticsConsent?: AnalyticsConsent;
  }
}

type Consent = 'accepted' | 'essential';

const STORAGE_KEY = 'mt_cookie_consent';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const GA_ID = process.env.NEXT_PUBLIC_GA4_ID;
const META_PIXEL_ID = getMetaPixelId();

function persistConsent(value: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch { /* noop */ }
  try {
    document.cookie = `${STORAGE_KEY}=${value};max-age=${COOKIE_MAX_AGE};path=/;SameSite=Lax`;
  } catch { /* noop */ }
}

interface Props {
  /** Valor leído en servidor via cookie HTTP — evita flash en visitas recurrentes (PRD-287). */
  initialConsent?: Consent | null;
}

/**
 * PRD-286: Consent Mode v2 — gtag se carga siempre con consent denied por defecto;
 *   se actualiza dinámicamente cuando el usuario elige.
 * PRD-287: Banner SSR — acepta initialConsent del servidor vía cookie HTTP para
 *   eliminar el flash post-hidratación en visitas recurrentes.
 * Meta Pixel: base code en <head> (layout); aquí solo grant/revoke + PageView.
 */
export default function CookieConsent({ initialConsent = null }: Props) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent | null>(initialConsent);
  // Si el servidor ya conoce el consentimiento, ready=true desde el inicio.
  const [ready, setReady] = useState(initialConsent !== null);
  const metaInitialPageViewDone = useRef(false);

  useEffect(() => {
    if (initialConsent !== null) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Consent | null;
      if (stored === 'accepted' || stored === 'essential') {
        setConsent(stored);
      }
    } catch {
      setConsent('essential');
    }
    setReady(true);
  }, [initialConsent]);

  // PRD-286: actualizar gtag consent cuando cambia el estado (tanto al cargar
  // con valor previo como tras elección nueva del usuario).
  useEffect(() => {
    if (consent === null) {
      setAnalyticsConsent('denied');
      return;
    }
    const granted = consent === 'accepted' ? 'granted' : 'denied';
    setAnalyticsConsent(granted);
    if (!GA_ID || typeof window.gtag !== 'function') return;
    window.gtag('consent', 'update', {
      analytics_storage: granted,
      ad_storage: granted,
      ad_user_data: granted,
      ad_personalization: granted,
    });
  }, [consent]);

  // Meta Pixel Consent Mode + PageView (init está en <head> del layout).
  useEffect(() => {
    if (!META_PIXEL_ID || consent === null) return;

    if (consent !== 'accepted') {
      setMetaPixelConsent(false);
      metaInitialPageViewDone.current = false;
      return;
    }

    setMetaPixelConsent(true);

    if (!metaInitialPageViewDone.current) {
      metaInitialPageViewDone.current = true;
      trackMetaPageView();
      return;
    }

    trackMetaPageView();
  }, [pathname, consent]);

  const choose = useCallback((value: Consent) => {
    setConsent(value);
    persistConsent(value);
  }, []);

  const isAdmin = pathname?.startsWith('/admin') ?? false;
  const showBanner = ready && consent === null && !isAdmin;

  return (
    <>
      {GA_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          {/* PRD-286: Consent Mode v2 — inicializa gtag con todo denegado por defecto.
              El useEffect de arriba dispara el update cuando consent se resuelve. */}
          <Script id="ga4-consent-init" strategy="afterInteractive">
            {`
              window.__mtAnalyticsConsent = 'denied';
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent', 'default', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                wait_for_update: 500
              });
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true });
            `}
          </Script>
        </>
      ) : null}

      {/* PERF-02: entrada con animación CSS (animate-fade-up) — framer-motion
          fuera del bundle crítico de todas las páginas. */}
      {showBanner && (
          <div
            role="dialog"
            aria-label="Aviso de cookies"
            className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-lift sm:flex sm:items-center sm:gap-4 sm:p-5 animate-fade-up motion-reduce:animate-none"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-start gap-3 sm:flex-1">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-yellowSft text-navy">
                <Cookie size={17} aria-hidden />
              </span>
              <p className="text-[12.5px] leading-relaxed text-slate-600">
                Usamos cookies para que el carrito y tu sesión funcionen, y — solo
                si aceptas — para medir visitas, publicidad (Meta) y mejorar la tienda.{' '}
                <Link
                  href="/privacy-policy#cookies"
                  className="font-semibold text-navy underline decoration-brand-yellow decoration-2 underline-offset-2"
                >
                  Más detalles
                </Link>
              </p>
            </div>
            <div className="mt-3 flex shrink-0 items-center gap-2 sm:mt-0">
              <button
                type="button"
                onClick={() => choose('essential')}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-navy transition-colors hover:bg-slate-50 sm:flex-none"
              >
                Solo lo necesario
              </button>
              <button
                type="button"
                onClick={() => choose('accepted')}
                className="min-h-[44px] flex-1 rounded-xl border border-brand-yellowDk bg-brand-yellow px-4 text-[13px] font-black text-navy transition-all hover:bg-[#FFE03A] active:scale-[0.98] sm:flex-none"
              >
                Aceptar
              </button>
            </div>
          </div>
        )}
    </>
  );
}
