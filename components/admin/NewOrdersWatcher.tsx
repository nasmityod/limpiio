'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Bell, BellOff, Truck, X, Volume2, MonitorSmartphone } from 'lucide-react';
import { formatOrderDualInline } from '@/lib/order-pricing';

interface NewOrder {
  id:           string;
  orderNumber:  number;
  customerName: string;
  total:        number;
  exchangeRateUsdBs?: number | null;
  createdAt:    string;
  status:       string;
}

/*
 * PRD-265: las claves de localStorage van sufijadas por operador (user id).
 * En un PC de mostrador compartido por varios admins, el "visto hasta" y las
 * preferencias de notificación de un operador no pisan los del siguiente.
 */
const STORAGE_KEY        = 'mt-admin-orders-since';
const SOUND_KEY          = 'mt-admin-orders-sound';
const TOAST_KEY          = 'mt-admin-orders-toast';
/** Key legacy del único flag previo (solo sonido). Se migra a la de sonido. */
const LEGACY_ENABLED_KEY = 'mt-admin-orders-notify';
const POLL_INTERVAL_MS   = 25_000;

interface NotifyPrefs { sound: boolean; toast: boolean; }

function readPrefs(operatorId: string | null): NotifyPrefs {
  if (typeof window === 'undefined' || !operatorId) return { sound: true, toast: true };
  const s = localStorage.getItem(`${SOUND_KEY}:${operatorId}`);
  const t = localStorage.getItem(`${TOAST_KEY}:${operatorId}`);
  const legacy = localStorage.getItem(`${LEGACY_ENABLED_KEY}:${operatorId}`);
  return {
    sound: s !== null ? s === '1' : legacy !== null ? legacy === '1' : true,
    toast: t !== null ? t === '1' : true,
  };
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });

const formatOrderTotal = (o: Pick<NewOrder, 'total' | 'exchangeRateUsdBs'>) =>
  formatOrderDualInline(o.total, o);

function PrefToggle({ checked, onChange, label }: {
  checked: boolean; onChange: () => void; label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-navy' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Vigila pedidos nuevos cada 25s y muestra:
 * - Toast in-app (si "Avisos en pantalla" está activo)
 * - Notificación nativa del navegador (si el operador dio permiso)
 * - Sonido + vibración (si "Sonido" está activo)
 * La campanita flotante abre un menú para configurar ambas preferencias
 * (persisten por operador en localStorage — PRD-265).
 */
export default function NewOrdersWatcher() {
  const { data: session } = useSession();
  const operatorId = session?.user?.id ?? null;
  const sinceKey   = operatorId ? `${STORAGE_KEY}:${operatorId}` : null;

  const [prefs, setPrefs] = useState<NotifyPrefs>({ sound: true, toast: true });
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<NewOrder[]>([]);
  const [showToast, setShowToast] = useState(false);
  const sinceRef = useRef<string>(new Date().toISOString());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Cargar estado persistido del operador actual (PRD-265)
  useEffect(() => {
    if (!sinceKey || !operatorId) return;
    const stored = localStorage.getItem(sinceKey);
    if (stored) sinceRef.current = stored;
    setPrefs(readPrefs(operatorId));
  }, [sinceKey, operatorId]);

  useEffect(() => {
    if ('Notification' in window) {
      setHasPermission(Notification.permission === 'granted');
    }

    // Beep WAV embebido (1 kHz, 250 ms) para no depender de un asset externo
    audioRef.current = new Audio(
      'data:audio/wav;base64,UklGRpQGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YXAGAACA' +
      'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA' +
      'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIB/' +
      'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICA',
    );
  }, []);

  // Cerrar el menú al tocar fuera
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [menuOpen]);

  const updatePref = (key: keyof NotifyPrefs, value: boolean) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    if (operatorId) {
      const base = key === 'sound' ? SOUND_KEY : TOAST_KEY;
      localStorage.setItem(`${base}:${operatorId}`, value ? '1' : '0');
    }
  };

  const toggleSound = () => updatePref('sound', !prefs.sound);

  const toggleToast = async () => {
    const next = !prefs.toast;
    // Al activar avisos, pedir permiso de notificación nativa si hace falta.
    if (next && 'Notification' in window && Notification.permission === 'default') {
      try {
        const result = await Notification.requestPermission();
        setHasPermission(result === 'granted');
      } catch { /* ignore */ }
    }
    updatePref('toast', next);
  };

  const playAlert = (count = 1) => {
    if (!prefs.sound) return;
    // Un beep por cada pedido nuevo (máx. 6 para no saturar), espaciados 350 ms.
    const beeps = Math.min(Math.max(count, 1), 6);
    let played = 0;
    const beepOnce = () => {
      const a = audioRef.current;
      if (a) {
        try { a.currentTime = 0; } catch {}
        a.play().catch(() => {});
      }
      played++;
      if (played < beeps) setTimeout(beepOnce, 350);
    };
    beepOnce();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.([200, 100, 200]);
    }
  };

  const showNativeNotification = (orders: NewOrder[]) => {
    if (!hasPermission || !('Notification' in window)) return;
    const main = orders[0];
    // PRD-227: la notificación del sistema operativo persiste y se ve en pantalla
    // bloqueada → solo número de pedido, sin nombre de cliente ni montos.
    new Notification(`${orders.length} pedido${orders.length !== 1 ? 's' : ''} nuevo${orders.length !== 1 ? 's' : ''}`, {
      body: `Pedido #${String(main.orderNumber).padStart(4, '0')}${orders.length > 1 ? ` y ${orders.length - 1} más` : ''} · abre el panel para ver el detalle`,
      tag: 'mt-new-order',
      icon: '/icon.svg',
      badge: '/icon.svg',
    });
  };

  // Polling
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      // PRD-230: con la pestaña oculta no se gasta batería/datos del admin móvil
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/api/orders/new-count?since=${encodeURIComponent(sinceRef.current)}`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const data: { count: number; latest: NewOrder[] } = await res.json();

        const trulyNew = data.latest.filter(o => !seenIdsRef.current.has(o.id));
        if (trulyNew.length > 0) {
          // Se marcan como vistos SIEMPRE, para no acumular backlog si luego se reactiva.
          trulyNew.forEach(o => seenIdsRef.current.add(o.id));
          if (prefs.toast) {
            setPendingOrders(prev => [...trulyNew, ...prev].slice(0, 30));
            setShowToast(true);
            showNativeNotification(trulyNew);
          }
          playAlert(trulyNew.length);
        }
      } catch (err) {
        // PRD-221: el polling de pedidos no puede fallar en silencio absoluto
        console.error('[NewOrdersWatcher] error consultando pedidos nuevos:', err);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    // PRD-230: al volver a la pestaña se consulta de inmediato
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.sound, prefs.toast, hasPermission]);

  const acknowledge = () => {
    setShowToast(false);
    setPendingOrders([]);
    sinceRef.current = new Date().toISOString();
    if (sinceKey) localStorage.setItem(sinceKey, sinceRef.current);
  };

  // Cierre suave: oculta el aviso sin marcar el lote como "visto"
  // (así no pierdes pedidos; solo se marcan vistos al abrirlos).
  const dismissToast = () => {
    setShowToast(false);
    setPendingOrders([]);
  };

  // Auto-cierre a los 8 s. El conteo solo corre mientras la pestaña está
  // visible y se reinicia cuando llega un pedido nuevo.
  useEffect(() => {
    if (!showToast) return;
    let remaining = 8000;
    let startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      startedAt = Date.now();
      timer = setTimeout(() => dismissToast(), remaining);
    };
    const pause = () => {
      if (timer) { clearTimeout(timer); timer = null; remaining -= Date.now() - startedAt; }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') start(); else pause();
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast, pendingOrders]);

  const allMuted = !prefs.sound && !prefs.toast;

  return (
    <>
      {/* Campanita flotante + menú de configuración (sobre el bottom-nav móvil) */}
      <div
        ref={menuRef}
        className="fixed right-3 z-30 md:bottom-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+12px)]"
      >
        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-bold text-navy">Notificaciones de pedidos</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar"
                className="w-7 h-7 inline-flex items-center justify-center text-gray-400 active:bg-black/10 rounded-full"
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-4 py-3 space-y-4">
              <p className="text-[11px] text-gray-500">Solo para este dispositivo y operador.</p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Volume2 size={17} className="text-navy mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Sonido</p>
                    <p className="text-[11px] text-gray-500">Sonido y vibración al llegar un pedido.</p>
                  </div>
                </div>
                <PrefToggle checked={prefs.sound} onChange={toggleSound} label="Sonido de pedidos nuevos" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <MonitorSmartphone size={17} className="text-navy mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Avisos en pantalla</p>
                    <p className="text-[11px] text-gray-500">
                      Aviso emergente y notificación del navegador. Desactívalo si no quieres que se apilen.
                    </p>
                  </div>
                </div>
                <PrefToggle checked={prefs.toast} onChange={toggleToast} label="Avisos en pantalla de pedidos nuevos" />
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Configurar notificaciones de pedidos"
          title="Configurar notificaciones de pedidos"
          className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full shadow-lg border-2 transition ${
            allMuted
              ? 'bg-white border-gray-200 text-gray-400 active:bg-gray-100'
              : 'bg-brand-yellow border-yellow-400 text-navy active:scale-95'
          }`}
        >
          {allMuted ? <BellOff size={18} /> : <Bell size={18} />}
        </button>
      </div>

      {/* Toast in-app de pedidos nuevos */}
      {showToast && pendingOrders.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed inset-x-3 sm:right-4 sm:left-auto z-40 md:bottom-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+12px)] sm:w-[360px] bg-white border-2 border-brand-yellow rounded-2xl shadow-2xl overflow-hidden animate-slideIn"
        >
          <div className="flex items-center justify-between px-3 py-2.5 bg-brand-yellow/30 border-b border-brand-yellow/30">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-brand-yellow text-navy flex items-center justify-center">
                <Truck size={14} />
              </span>
              <p className="text-xs font-black text-navy uppercase tracking-wide">
                {pendingOrders.length} pedido{pendingOrders.length !== 1 ? 's' : ''} nuevo{pendingOrders.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={acknowledge}
              className="w-9 h-9 inline-flex items-center justify-center text-gray-500 active:bg-black/10 rounded-full"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
          <ul className="divide-y divide-gray-100">
            {pendingOrders.slice(0, 4).map(o => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${o.id}`}
                  onClick={acknowledge}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 active:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">
                      #{String(o.orderNumber).padStart(4, '0')} · {o.customerName}
                    </p>
                    <p className="text-[11px] text-gray-500">{formatTime(o.createdAt)}</p>
                  </div>
                  <p className="text-sm font-bold text-navy tabular-nums whitespace-nowrap flex-shrink-0">
                    {formatOrderTotal(o)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/orders"
            onClick={acknowledge}
            className="block px-3 py-2.5 text-center text-xs font-bold text-navy bg-gray-50 border-t border-gray-100 active:bg-gray-100"
          >
            {pendingOrders.length > 4 ? `+${pendingOrders.length - 4} más · ver todos los pedidos` : 'Ver más pedidos'}
          </Link>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-slideIn {
          animation: slideIn 0.25s ease-out;
        }
      `}</style>
    </>
  );
}
