'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Clock, Zap, Sparkles, Tag } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useReducedMotion, reducedTransition } from '@/lib/motion';

interface PromoData {
  title:        string;
  subtitle:     string | null;
  discountText: string | null;
  imageUrl:     string | null;
  bgColor:      string;
  link:         string;
}

interface CategoryDrawerProps {
  open:    boolean;
  onClose: () => void;
}

// ─── Countdown ──────────────────────────────────────────────────────────────

function Countdown({ targetHours }: { targetHours: number }) {
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    const end = Date.now() + targetHours * 3_600_000;
    const tick = () => {
      const diff = Math.max(0, end - Date.now());
      setTimeLeft({
        h: Math.floor(diff / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1_000),
      });
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetHours]);

  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="font-mono font-bold tracking-wider nums">
      {pad(timeLeft.h)}:{pad(timeLeft.m)}:{pad(timeLeft.s)}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CategoryItem {
  name: string;
  slug: string;
}

export default function CategoryDrawer({ open, onClose }: CategoryDrawerProps) {
  const prefersReduced = useReducedMotion();
  const [promo, setPromo] = useState<PromoData | null>(null);
  // PRD-095: el menú ya no depende del catálogo completo (ProductContext);
  // usa el endpoint liviano de categorías y solo carga al abrir el drawer.
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const categoriesLoadedRef = useRef(false);
  const firstCatRef = useRef<HTMLAnchorElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || categoriesLoadedRef.current) return;
    categoriesLoadedRef.current = true;
    fetch('/api/categories')
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const items = (data as { name?: unknown; slug?: unknown }[])
            .map(c => ({
              name: typeof c.name === 'string' ? c.name : '',
              slug: typeof c.slug === 'string' ? c.slug : '',
            }))
            .filter((c): c is CategoryItem => !!c.name && !!c.slug);
          const seen = new Map<string, CategoryItem>();
          for (const item of items) seen.set(item.name, item);
          setCategories([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch((err) => console.error('[CategoryDrawer] Error al cargar categorías:', err));
  }, [open]);

  // Solo al abrir el drawer (PERF-07). Se vuelve a pedir en cada apertura para
  // reflejar altas/bajas del admin sin recargar la página.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/promotions?active=true')
      .then(r => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) setPromo(data[0] as PromoData);
        else setPromo(null);
      })
      .catch((err) => {
        if (!cancelled) setPromo(null);
        console.error('[CategoryDrawer] Error al cargar promo:', err);
      });
    return () => { cancelled = true; };
  }, [open]);

  // Lock compartido: no pisa el overflow de otros drawers (cart/búsqueda).
  useBodyScrollLock(open);

  // Focus trap full: foco inicial en "Todos los productos" (firstCatRef).
  // El hook se encarga del foco inicial, Tab/Shift+Tab y Escape.
  useFocusTrap({ containerRef: drawerRef, enabled: open, onClose });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop button */}
          <motion.button
            type="button"
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReduced ? reducedTransition : { duration: 0.22 }}
            className="fixed inset-0 z-[55] bg-navy/45 backdrop-blur-[2px] sm:backdrop-blur-sm cursor-pointer"
            onClick={onClose}
            aria-label="Cerrar menú"
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú de categorías"
            initial={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
            animate={prefersReduced ? { opacity: 1 } : { x: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
            transition={prefersReduced ? reducedTransition : { type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 left-0 h-screen h-[100dvh] w-[88vw] max-w-[340px] bg-white z-[56] flex flex-col shadow-lift overscroll-contain"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 sm:px-5 min-h-[60px] border-b border-slate-100 flex-shrink-0">
              <Link
                href="/"
                onClick={onClose}
                className="text-lg font-bold tracking-tight text-navy flex items-center gap-0.5"
              >
                <span>Mundo</span>
                <span className="text-navy">Tech</span>
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] -mr-2 rounded-xl flex items-center justify-center text-slate-500 hover:text-navy hover:bg-slate-100 active:bg-slate-200 transition-colors"
                aria-label="Cerrar menú"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {/* ── Body scrollable ──────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">

              {/* Banner solo si hay oferta activa en el admin (sin fallback hardcodeado). */}
              {promo && (
                <div className="m-4">
                  <div
                    className="relative overflow-hidden rounded-2xl p-5 text-white"
                    style={{ backgroundColor: promo.bgColor }}
                  >
                    <div className="absolute inset-0 mesh-light opacity-60 pointer-events-none" />
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-brand-yellow/15 rounded-full pointer-events-none" />

                    <div className="relative">
                      <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur border border-white/15 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full mb-3">
                        <Sparkles size={10} className="text-brand-yellow" />
                        Promo MundoTech
                      </span>

                      <div className="inline-flex items-center gap-1.5 bg-emerald-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full mb-3 ml-2">
                        <Clock size={10} />
                        <Countdown targetHours={48} />
                      </div>

                      <h3 className="text-white font-bold text-lg leading-tight mb-1.5 tracking-tight">
                        {promo.title}
                      </h3>

                      {promo.subtitle && (
                        <p className="text-white/65 text-xs leading-relaxed mb-4">
                          {promo.subtitle}
                        </p>
                      )}

                      <Link
                        href={promo.link}
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 bg-brand-yellow text-navy text-xs font-bold px-4 min-h-[44px] rounded-xl hover:bg-[#FFE03A] shadow-soft transition-all"
                      >
                        <Zap size={12} /> Ver oferta
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Sección: Categorías ──────────────────────────── */}
              <div className="px-4 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-light px-2">
                  Categorías
                </p>
              </div>

              <ul className="px-2 pb-3 space-y-0.5">
                <li>
                  <Link
                    href="/productos"
                    ref={firstCatRef}
                    onClick={onClose}
                    className="flex items-center gap-3 w-full px-3 min-h-[52px] rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-navy group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-brand-yellowSft text-navy flex items-center justify-center flex-shrink-0">
                      <Tag size={15} />
                    </div>
                    <span className="flex-1 text-left text-[15px] font-semibold">
                      Todos los productos
                    </span>
                    <ChevronRight size={15} className="text-slate-300 group-hover:text-navy transition-colors flex-shrink-0" />
                  </Link>
                </li>
                {categories.map((cat) => (
                  <li key={cat.slug}>
                    <Link
                      href={`/categoria/${cat.slug}`}
                      onClick={onClose}
                      className="flex items-center gap-3 w-full px-3 min-h-[48px] rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors text-navy group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                        {cat.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="flex-1 text-left text-[14px] font-medium capitalize truncate">
                        {cat.name}
                      </span>
                      <ChevronRight size={15} className="text-slate-300 group-hover:text-navy transition-colors flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Footer (con safe-area para el home indicator) ──── */}
            <div
              className="px-5 pt-3 border-t border-slate-100 bg-slate-50 flex-shrink-0"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <p className="text-[11px] text-slate-500 text-center">
                Tecnología · Garantía 7 días en electrónica
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
