'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import type { SiteContent } from '@/lib/site-content-schema';
import { useReducedMotion, reducedTransition } from '@/lib/motion';

const STORAGE_KEY = 'mt_popup_dismissed_at';

/**
 * Popup promocional editable desde /admin/personalizar.
 * Respeta la frecuencia configurada (no reaparece hasta pasar N días tras
 * cerrarse) y nunca interrumpe checkout, auth ni admin.
 */
export default function PromoPopup({ popup }: { popup: SiteContent['popup'] }) {
  const prefersReduced = useReducedMotion();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!popup.enabled || !popup.title.trim()) return;
    // FASE 3: la promo tiene fecha de fin — vencida no se muestra (fin del día,
    // hora local del visitante).
    if (popup.endsAt) {
      const end = new Date(`${popup.endsAt}T23:59:59`);
      if (!Number.isNaN(end.getTime()) && Date.now() > end.getTime()) return;
    }
    try {
      const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
      const cooldownMs = popup.frequencyDays * 24 * 60 * 60 * 1000;
      if (dismissedAt && Date.now() - dismissedAt < cooldownMs) return;
    } catch {
      /* localStorage bloqueado: no insistimos */
      return;
    }
    const id = setTimeout(() => setOpen(true), popup.delaySeconds * 1000);
    return () => clearTimeout(id);
  }, [popup]);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* sin persistencia */
    }
  };

  const blockedRoute =
    !pathname ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/registro') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password');

  if (blockedRoute) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
          transition={prefersReduced ? reducedTransition : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-label={popup.title}
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift sm:inset-x-auto sm:left-5 sm:bottom-5"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {popup.imageUrl.trim() ? (
            <div className="relative h-32 w-full">
              <Image
                src={popup.imageUrl}
                alt=""
                fill
                sizes="384px"
                className="object-cover"
              />
            </div>
          ) : null}

          <div className="relative p-5">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Cerrar promoción"
              className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-navy transition-colors"
            >
              <X size={16} />
            </button>

            {popup.badge.trim() ? (
              <span className="inline-flex items-center rounded-md border border-brand-yellowDk/50 bg-brand-yellowSft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a6d00]">
                {popup.badge}
              </span>
            ) : null}

            <h3 className="mt-2 pr-8 text-[17px] font-bold leading-snug text-navy">
              {popup.title}
            </h3>
            {popup.text.trim() ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                {popup.text}
              </p>
            ) : null}

            {popup.ctaText.trim() ? (
              <Link
                href={popup.ctaLink || '/productos'}
                onClick={dismiss}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand-yellowDk bg-brand-yellow px-4 text-[13px] font-black text-navy transition-all hover:bg-[#FFE03A] active:scale-[0.98]"
              >
                {popup.ctaText} <ArrowRight size={15} aria-hidden />
              </Link>
            ) : null}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
