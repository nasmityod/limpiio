'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2 } from 'lucide-react';
import { useSearchSuggest } from '@/hooks/useSearchSuggest';
import SearchResultsList from '@/components/SearchResultsList';

interface SearchBarProps {
  className?: string;
  placeholder?: string;
}

export default function SearchBar({
  className = '',
  placeholder = 'Buscar productos, marcas y más...',
}: SearchBarProps) {
  const router = useRouter();
  const { query, setQuery, results, open, setOpen, isPending, clear } = useSearchSuggest();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler, { passive: true });
    return () => document.removeEventListener('pointerdown', handler);
  }, [setOpen]);

  const handleClear = () => {
    clear();
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/buscar?q=${encodeURIComponent(query.trim())}`);
  };

  const handlePick = () => {
    clear();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open && results.length > 0) setOpen(true);
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case 'Enter':
        if (open && activeIndex >= 0 && results[activeIndex]) {
          e.preventDefault();
          setOpen(false);
          clear();
          router.push(`/product/${results[activeIndex].slug ?? results[activeIndex].id}`);
        }
        break;
      case 'Escape':
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      role="search"
    >
      <form onSubmit={handleSubmit}>
        <div className="relative flex items-center">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex-shrink-0"
            aria-hidden
          />

          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="search"
            /* A11Y-01 (PageSpeed): aria-expanded/controls/autocomplete requieren
               el rol combobox — sin él, lectores de pantalla ignoran el patrón. */
            role="combobox"
            aria-label="Buscar productos"
            aria-expanded={open}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
            className="w-full bg-slate-100/70 text-navy text-base rounded-2xl pl-11 pr-[140px] min-h-[48px] h-12 border border-transparent focus:outline-none focus:bg-white focus:border-navy/30 focus:shadow-ring-navy placeholder:text-slate-400 transition-all"
          />

          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-[96px] top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-navy hover:bg-slate-200/60 active:bg-slate-300 rounded-lg transition-colors"
              aria-label="Limpiar"
            >
              <X size={16} />
            </button>
          )}

          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-navy text-white text-xs font-semibold px-4 h-9 rounded-xl hover:bg-navy-700 active:bg-navy-800 transition-colors flex items-center justify-center gap-1.5 shadow-soft"
            aria-label="Buscar"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                <Search size={13} />
                <span>Buscar</span>
              </>
            )}
          </button>
        </div>
      </form>

      {open && query.trim().length >= 2 && (
        <div
          id="search-suggestions"
          className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200/70 rounded-2xl shadow-lift z-[60] overflow-hidden max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain"
        >
          <SearchResultsList
            query={query}
            results={results}
            isPending={isPending}
            onPick={handlePick}
            density="compact"
            activeIndex={activeIndex}
          />
        </div>
      )}
    </div>
  );
}
