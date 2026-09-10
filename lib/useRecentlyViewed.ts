'use client';

import { useEffect, useState, useCallback } from 'react';

export interface RecentlyViewedItem {
  id:    string;
  slug?: string | null;
  name:  string;
  price: number;
  image: string;
  brand?: string | null;
  category?: string;
  ts: number;
}

const STORAGE_KEY = 'mundotech:recently-viewed';
const MAX_ITEMS   = 8;

const safeParse = (raw: string | null): RecentlyViewedItem[] => {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setItems(safeParse(localStorage.getItem(STORAGE_KEY)));
  }, []);

  const trackView = useCallback((item: Omit<RecentlyViewedItem, 'ts'>) => {
    if (typeof window === 'undefined') return;
    const current = safeParse(localStorage.getItem(STORAGE_KEY));
    const dedup   = current.filter((p) => p.id !== item.id);
    const next    = [{ ...item, ts: Date.now() }, ...dedup].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setItems(next);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItems([]);
  }, []);

  return { items, trackView, clear };
}
