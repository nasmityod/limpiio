'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { searchProducts } from '@/app/actions/search';
import type { SearchResult } from '@/lib/search-shared';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useSearchSuggest(minChars = 2) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    if (debounced.trim().length < minChars) {
      setResults([]);
      setOpen(false);
      return;
    }
    let active = true;
    startTransition(async () => {
      try {
        const data = await searchProducts(debounced);
        if (!active) return;
        setResults(data);
        setOpen(true);
      } catch (err) {
        console.error('[searchProducts] failed', err);
        if (!active) return;
        setResults([]);
        setOpen(false);
      }
    });
    return () => {
      active = false;
    };
  }, [debounced, minChars]);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setOpen(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    open,
    setOpen,
    isPending,
    clear,
  };
}
