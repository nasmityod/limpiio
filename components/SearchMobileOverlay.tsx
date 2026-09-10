'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ArrowLeft } from 'lucide-react';
import { useSearchSuggest } from '@/hooks/useSearchSuggest';
import SearchResultsList from '@/components/SearchResultsList';
import { useReducedMotion, reducedTransition } from '@/lib/motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchMobileOverlay({ open, onClose }: Props) {
  const prefersReduced = useReducedMotion();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const { query, setQuery, results, open: suggestionsOpen, setOpen, isPending, clear } =
    useSearchSuggest();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll lock compartido
  useBodyScrollLock(open);

  // Focus trap: foco inicial en el primer elemento enfocable (el input)
  useFocusTrap({ containerRef: dialogRef, enabled: open, onClose });

  // Limpiar sugerencias al cerrar
  useEffect(() => {
    if (!open) clear();
  }, [open, clear]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    clear();
    onClose();
    router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
  };

  const handleClose = () => {
    clear();
    onClose();
  };

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Buscar productos"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={prefersReduced ? reducedTransition : { duration: 0.18 }}
          className="fixed inset-0 z-[100] flex flex-col bg-white"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}
        >
          <div className="flex items-center gap-2 px-2 py-2.5 border-b border-slate-100 flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-navy hover:bg-slate-100 active:bg-slate-200 transition-colors flex-shrink-0"
              aria-label="Volver"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 min-w-0">
              <div className="relative flex-1 flex items-center min-w-0">
                <Search
                  size={18}
                  aria-hidden="true"
                  className="absolute left-3 text-slate-400 pointer-events-none flex-shrink-0"
                />
                <input
                  ref={inputRef}
                  type="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="sentences"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setOpen(true)}
                  /* A11Y-02: mismo patrón combobox que SearchBar desktop. */
                  role="combobox"
                  aria-label="Buscar productos"
                  aria-expanded={suggestionsOpen}
                  aria-controls="search-suggestions-mobile"
                  aria-autocomplete="list"
                  placeholder="Buscar productos, marcas…"
                  className="w-full bg-slate-100 text-navy text-base rounded-2xl pl-11 pr-12 min-h-[48px] h-12 border border-transparent focus:outline-none focus:bg-white focus:border-navy/30 focus:shadow-ring-navy placeholder:text-slate-400"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setOpen(false);
                      inputRef.current?.focus();
                    }}
                    className="absolute right-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-navy active:bg-slate-200 rounded-lg"
                    aria-label="Limpiar"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="min-w-[44px] min-h-[48px] flex items-center justify-center rounded-xl bg-navy text-white px-3 active:scale-95 transition-transform"
                aria-label="Ir al catálogo con esta búsqueda"
              >
                <Search size={18} aria-hidden="true" />
              </button>
            </form>
          </div>

          <div id="search-suggestions-mobile" className="flex-1 overflow-y-auto overscroll-contain">
            {query.trim().length < 2 ? (
              <div className="px-6 py-12 text-center text-slate-500 text-sm">
                Escribe al menos 2 caracteres para buscar.
              </div>
            ) : suggestionsOpen || results.length > 0 || isPending ? (
              <SearchResultsList
                query={query}
                results={results}
                isPending={isPending}
                onPick={handleClose}
                density="relaxed"
              />
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
