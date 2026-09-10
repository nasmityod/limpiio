'use client';

import dynamic from 'next/dynamic';
import type { SiteContent } from '@/lib/site-content-schema';

const WhatsAppFab = dynamic(() => import('./WhatsAppFab'), { ssr: false });
const PromoPopup = dynamic(() => import('./PromoPopup'), { ssr: false });

/**
 * Widgets no críticos below-the-fold: se cargan en un chunk separado
 * después del first paint para reducir JS inicial (Core Web Vitals).
 */
export default function DeferredClientWidgets({
  whatsapp,
  popup,
}: {
  whatsapp: { enabled: boolean; phone: string; message?: string };
  popup: SiteContent['popup'];
}) {
  return (
    <>
      {whatsapp.enabled ? (
        <WhatsAppFab phone={whatsapp.phone} message={whatsapp.message} />
      ) : null}
      <PromoPopup popup={popup} />
    </>
  );
}
