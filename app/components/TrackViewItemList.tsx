'use client';

import { useEffect, useRef } from 'react';
import { track, type Ga4Item } from '@/lib/ga4';

/**
 * FASE 4.4: view_item_list — isla client mínima (sin UI) que reporta la
 * impresión de una estantería/listado. No-op sin NEXT_PUBLIC_GA4_ID.
 */
export default function TrackViewItemList({
  listId,
  listName,
  items,
}: {
  listId: string;
  listName: string;
  items: Ga4Item[];
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || items.length === 0) return;
    sent.current = true;
    track('view_item_list', {
      item_list_id: listId,
      item_list_name: listName,
      items: items.map((it, index) => ({ ...it, index })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);
  return null;
}
