'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';

const DEFAULT_RATE        = Number(process.env.NEXT_PUBLIC_BS_RATE ?? '36.5');
const STALE_THRESHOLD_MS  = 15 * 60 * 1000; // 15 min — una tasa más vieja necesita refresco
const REFRESH_INTERVAL_MS = STALE_THRESHOLD_MS;

interface ExchangeRateContextType {
  rate: number;
  loading: boolean;
  /**
   * true mientras la tasa mostrada NO proviene de un fetch exitoso reciente
   * (fallback inicial o último fetch fallido). La UI que muestre Bs puede
   * marcar el monto como estimado.
   */
  stale: boolean;
}

const ExchangeRateContext = createContext<ExchangeRateContextType>({
  rate: DEFAULT_RATE,
  loading: false,
  stale: true,
});

/**
 * SESIÓN 17: Provider de tasa USD/Bs con hidratación server-side y refresco
 * eficiente.
 *
 * - Recibe `initialRate` (> 0) y `initialUpdatedAt` (ISO string | null) desde
 *   el Server Component padre. Si la tasa es válida y fresca (< 15 min), omite
 *   el fetch inicial.
 * - El timer de refresco es cada 15 min (no cada 60 s) y solo corre mientras
 *   la pestaña es visible.
 * - Al volver visible: refresca solo si la tasa está stale y pasaron >= 15 min
 *   desde el último fetch.
 * - Una Promise/ref compartida deduplica requests concurrentes.
 * - Ante error: conserva la última tasa válida y marca stale: true.
 */
export function ExchangeRateProvider({
  children,
  initialRate,
  initialUpdatedAt,
}: {
  children: ReactNode;
  initialRate?: number;
  initialUpdatedAt?: string | null;
}) {
  const [rate, setRate]       = useState<number>(initialRate && initialRate > 0 ? initialRate : DEFAULT_RATE);
  const [loading, setLoading] = useState<boolean>(false);
  const [stale, setStale]     = useState<boolean>(!(initialRate && initialRate > 0));

  const lastRefreshedAtRef = useRef<number>(
    initialUpdatedAt ? new Date(initialUpdatedAt).getTime() : 0,
  );
  const currentFetchRef = useRef<Promise<void> | null>(null);
  const staleRef = useRef(stale);
  const mountedRef = useRef(true);

  useEffect(() => {
    staleRef.current = stale;
  }, [stale]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchRate = useCallback(async (): Promise<void> => {
    // SESIÓN 17: deduplicar requests concurrentes compartiendo la misma Promise
    if (currentFetchRef.current) {
      return currentFetchRef.current;
    }

    const promise = fetch('/api/config/exchange-rate')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ rate: number }>;
      })
      .then(data => {
        if (!mountedRef.current) return;
        if (typeof data.rate === 'number' && data.rate > 0) {
          setRate(data.rate);
          setStale(false);
          lastRefreshedAtRef.current = Date.now();
        } else {
          setStale(true);
        }
      })
      .catch(() => {
        // SESIÓN 17: conservar última tasa válida, solo marcar stale
        if (mountedRef.current) {
          setStale(true);
        }
      })
      .finally(() => {
        currentFetchRef.current = null;
        if (mountedRef.current) {
          setLoading(false);
        }
      });

    currentFetchRef.current = promise;
    return promise;
  }, []);

  // Efecto de montaje: fetch inicial solo si la tasa no es fresca
  useEffect(() => {
    const now = Date.now();
    const isFresh =
      rate > 0 &&
      lastRefreshedAtRef.current > 0 &&
      (now - lastRefreshedAtRef.current) < STALE_THRESHOLD_MS;

    if (!isFresh) {
      setLoading(true);
      fetchRate();
    } else {
      setLoading(false);
      setStale(false);
    }

    // Timer cada 15 min, solo cuando la pestaña es visible
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        fetchRate();
      }, REFRESH_INTERVAL_MS);
    };

    const stopTimer = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // SESIÓN 17: sin polling en hidden; visibilitychange lee staleRef (no closure)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopTimer();
      } else {
        const elapsed = Date.now() - lastRefreshedAtRef.current;
        if (staleRef.current || elapsed >= STALE_THRESHOLD_MS) {
          fetchRate();
        }
        startTimer();
      }
    };

    // Arranque inicial
    if (document.visibilityState !== 'hidden') {
      startTimer();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ExchangeRateContext.Provider value={{ rate, loading, stale }}>
      {children}
    </ExchangeRateContext.Provider>
  );
}

export function useExchangeRate() {
  return useContext(ExchangeRateContext);
}
