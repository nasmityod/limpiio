'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  observePromotionImpression,
  trackSelectPromotion,
  type PromotionTrackingPayload,
} from '@/app/components/TrackPromotion';

type PromotionLinkProps = {
  href: string;
  promotion: PromotionTrackingPayload;
  className?: string;
  children: ReactNode;
};

/**
 * Enlace promocional: view_promotion por impresión real (IO ≥50 %)
 * + select_promotion al clic. Sin wrappers que rompan grid/flex.
 */
export default function PromotionLink({
  href,
  promotion,
  className,
  children,
}: PromotionLinkProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = linkRef.current;
    if (!el) return;
    return observePromotionImpression(el, promotion);
  }, [promotion]);

  return (
    <Link
      ref={linkRef}
      href={href}
      onClick={() => trackSelectPromotion(promotion)}
      className={className}
    >
      {children}
    </Link>
  );
}
