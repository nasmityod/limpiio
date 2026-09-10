'use client';

import { track, onAnalyticsConsentChange } from '@/lib/ga4';

export type PromotionTrackingPayload = {
  promotion_id: string;
  promotion_name: string;
  creative_name?: string;
  creative_slot: string;
};

export function promotionViewParams(
  promotion: PromotionTrackingPayload,
): Record<string, string> {
  return {
    promotion_id: promotion.promotion_id,
    promotion_name: promotion.promotion_name,
    ...(promotion.creative_name
      ? { creative_name: promotion.creative_name }
      : {}),
    creative_slot: promotion.creative_slot,
  };
}

export function trackSelectPromotion(promotion: PromotionTrackingPayload): void {
  track('select_promotion', promotionViewParams(promotion));
}

/**
 * Observa un elemento y dispara view_promotion cuando ≥50 % es visible.
 * Solo marca enviado si track() === true. Si falla por consentimiento,
 * reintenta una vez al pasar a granted mientras siga visible.
 */
export function observePromotionImpression(
  element: Element,
  promotion: PromotionTrackingPayload,
): () => void {
  let sent = false;
  let currentlyVisible = false;
  let consentUnsub: (() => void) | null = null;
  let observer: IntersectionObserver | null = null;

  const trySend = (): boolean => {
    if (sent) return true;
    if (!promotion.promotion_id) return false;
    const ok = track('view_promotion', promotionViewParams(promotion));
    if (ok) {
      sent = true;
      consentUnsub?.();
      consentUnsub = null;
      return true;
    }
    return false;
  };

  const onVisible = () => {
    currentlyVisible = true;
    if (trySend()) return;

    if (!consentUnsub) {
      consentUnsub = onAnalyticsConsentChange((consent) => {
        if (consent !== 'granted' || !currentlyVisible || sent) return;
        trySend();
      });
    }
  };

  const onHidden = () => {
    currentlyVisible = false;
  };

  if (typeof IntersectionObserver === 'undefined') {
    // Fallback: sin IO, intenta una impresión diferida (viewport desconocido).
    const timer = window.setTimeout(() => {
      onVisible();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      consentUnsub?.();
    };
  }

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        onVisible();
      } else {
        onHidden();
      }
    },
    { threshold: [0, 0.5, 1] },
  );

  observer.observe(element);

  return () => {
    observer?.disconnect();
    consentUnsub?.();
  };
}
