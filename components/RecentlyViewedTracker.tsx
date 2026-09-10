'use client';

import { useEffect } from 'react';
import { useRecentlyViewed, type RecentlyViewedItem } from '@/lib/useRecentlyViewed';
import { track, GA4_CURRENCY } from '@/lib/ga4';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  const KEY = 'mundotech:sid';
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
}

export default function RecentlyViewedTracker(props: Omit<RecentlyViewedItem, 'ts'>) {
  const { trackView } = useRecentlyViewed();

  useEffect(() => {
    // 1. Persistir en localStorage para "Recientemente vistos" en UI
    trackView(props);

    // 2. Enviar evento al servidor (fire-and-forget, no bloquea)
    const sessionId = getOrCreateSessionId();
    fetch('/api/events/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: props.id, sessionId }),
      keepalive: true, // sobrevive a navegaciones
    }).catch(() => {}); // silencioso ante fallo de red

    // 3. FASE 4.4: view_item de GA4 (no-op sin GA4 configurado).
    track('view_item', {
      currency: GA4_CURRENCY,
      value: props.price,
      items: [
        {
          item_id: props.id,
          item_name: props.name,
          ...(props.category ? { item_category: props.category } : {}),
          ...(props.brand ? { item_brand: props.brand } : {}),
          price: props.price,
          quantity: 1,
        },
      ],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.id]);

  return null;
}
