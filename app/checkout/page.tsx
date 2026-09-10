import type { Metadata } from 'next';
import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { MessageCircleOff } from 'lucide-react';
import { readSettings, isPagoMovilConfigured, isTransferenciaConfigured } from '@/lib/data-store';
import { readShippingEstimates } from '@/lib/shipping-estimates-db';
import { isWhatsAppCheckout } from '@/lib/checkout-mode';
import { isValidWhatsAppPhone, normalizeWhatsAppPhone } from '@/lib/whatsapp-phone';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import CheckoutFlow from '@/app/components/checkout/CheckoutFlow';
import WhatsAppCheckout from '@/app/components/checkout/WhatsAppCheckout';
import { buildCheckoutPaymentMethods } from '@/lib/payment-methods';

// Fuerza renderizado dinámico (por-request) para que readSettings()
// lea la configuración actual de la BD en cada visita.
export const dynamic = 'force-dynamic';

// H03/P96: página transaccional — noindex para no desperdiciar crawl budget
// y evitar que usuarios accedan por SERP sin carrito.
export const metadata: Metadata = {
  title: 'Finalizar compra',
  robots: { index: false, follow: false },
};

/**
 * Server Component: lee los datos de pago de la tienda desde la BD
 * y los pasa al flujo interactivo de checkout (Client Component).
 * Según CHECKOUT_MODE renderiza WhatsAppCheckout (una sola página)
 * o CheckoutFlow (pasos: Envío → Pago → Revisión).
 */
/**
 * Estado server-rendered cuando el canal WhatsApp está activo pero sin un
 * número de pedidos válido configurado. No expone configuración ni stack:
 * solo invita a contactar por el teléfono general de la tienda.
 */
function WhatsAppChannelUnavailable({ supportPhone }: { supportPhone: string }) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4 py-16">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-5">
        <MessageCircleOff size={32} />
      </div>
      <h1 className="text-2xl font-bold text-navy mb-2">Canal de pedidos temporalmente indisponible</h1>
      <p className="text-slate-500 max-w-md">
        Por ahora no podemos recibir pedidos por este medio.
        {supportPhone ? ` Contáctanos al ${supportPhone} y te ayudamos a completar tu compra.` : ' Contáctanos por nuestros canales habituales y te ayudamos a completar tu compra.'}
      </p>
    </div>
  );
}

export default async function CheckoutPage() {
  const [settings, shippingEstimates] = await Promise.all([
    readSettings(),
    readShippingEstimates(),
  ]);

  const pagoMovilConfigured = isPagoMovilConfigured(settings);
  const transferenciaConfigured = isTransferenciaConfigured(settings);
  const checkoutChannel = isWhatsAppCheckout ? 'whatsapp' : 'web';
  const checkoutPaymentMethods = buildCheckoutPaymentMethods(settings, checkoutChannel);

  if (isWhatsAppCheckout) {
    const whatsappOrderPhone = normalizeWhatsAppPhone(settings.whatsappOrderPhone);
    if (!isValidWhatsAppPhone(whatsappOrderPhone)) {
      return <WhatsAppChannelUnavailable supportPhone={settings.phone} />;
    }
    return (
      <>
        <WhatsAppCheckout
          pagoMovil={settings.pagoMovil}
          transferencia={settings.transferencia}
          supportPhone={settings.phone}
          binancePayId={settings.binancePayId}
          binanceQrUrl={settings.binanceQrUrl}
          pagoMovilConfigured={pagoMovilConfigured}
          transferenciaConfigured={transferenciaConfigured}
          shippingEstimates={shippingEstimates}
          whatsappOrderPhone={whatsappOrderPhone}
          storeName={settings.storeName}
          checkoutPaymentMethods={checkoutPaymentMethods}
        />
      </>
    );
  }

  // Guest solo en whatsapp / auth obligatoria en full: middleware.ts ya
  // protege /checkout cuando CHECKOUT_MODE=full, pero esta es la segunda
  // capa (defense in depth) del propio Server Component.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login?next=checkout');
  }

  return (
    <>
      <CheckoutFlow
        pagoMovil={settings.pagoMovil}
        transferencia={settings.transferencia}
        supportPhone={settings.phone}
        binancePayId={settings.binancePayId}
        binanceQrUrl={settings.binanceQrUrl}
        pagoMovilConfigured={pagoMovilConfigured}
        transferenciaConfigured={transferenciaConfigured}
        shippingEstimates={shippingEstimates}
        whatsappMode={false}
        whatsappOrderPhone={settings.whatsappOrderPhone}
        storeName={settings.storeName}
        checkoutPaymentMethods={checkoutPaymentMethods}
      />
    </>
  );
}
