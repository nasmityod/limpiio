import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPageLayout from '@/app/components/LegalPageLayout';
import { readSettings } from '@/lib/data-store';

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';
const PAGE_URL = `${SITE_URL}/shipping-policy`;

export const metadata: Metadata = {
  title: 'Envíos',
  description:
    'Política de envíos de MundoTech Barquisimeto: cobertura nacional por MRW, Zoom y Tealca (cobro a destino), delivery gratis en Barquisimeto (Centro y Este), retiro en tienda.',
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
};

export default async function ShippingPolicyPage() {
  const settings = await readSettings();

  return (
    <LegalPageLayout
      title="Envíos"
      lastUpdated="Última actualización: 17 de mayo de 2026."
    >
      <p>
        En <strong>{settings.storeName}</strong> realizamos despachos dentro de Venezuela. Los plazos
        son orientativos y pueden variar según la ubicación del destinatario, la disponibilidad de
        stock y los operadores logísticos. Si necesitas urgencia u opciones especiales, contáctanos
        antes de pagar mediante los datos de{' '}
        <Link href="/terms-of-service" className="text-navy underline underline-offset-2">
          contacto habituales de la tienda
        </Link>
        .
      </p>

      <h2>1. Cobertura</h2>
      <p>
        Atendemos envíos con cobertura nacional a través de <strong>MRW</strong>,{' '}
        <strong>Zoom</strong> y <strong>Tealca</strong>. Algunas zonas remotas pueden requerir
        coordinación adicional, tiempo extra o uso de punto de encuentro autorizado si el courier
        no llega hasta la última milla.
      </p>

      <h2>2. Prepago del pedido</h2>
      <p>
        El pedido se prepara después de aplicar nuestras verificaciones de pago aplicables según método
        (Pago Móvil, transferencia o Binance Pay cuando corresponda). El tiempo de despacho cuenta desde
        la validación del pago, no desde el envío del comprobante.
      </p>

      <h2>3. Empaque y seguimiento</h2>
      <p>
        Los productos se empacan de forma que reduzcan daños en tránsito. Cuando el pedido pase a enviado,
        te indicaremos guía o referencia de seguimiento si el operador la proporciona.
      </p>

      <h2>4. Coste de envío</h2>
      <p>
        <strong>Envíos nacionales (MRW, Zoom y Tealca):</strong> el flete se paga con{' '}
        <strong>cobro a destino</strong> — tú pagas el envío al recibir el paquete en la oficina del
        courier o en tu domicilio, según el operador.
      </p>
      <p>
        <strong>Delivery gratis en Barquisimeto:</strong> ofrecemos delivery sin costo en la zona{' '}
        <strong>Centro y Este</strong> de Barquisimeto. Aplican ciertas condiciones según el pedido;
        confírmalo con nuestro equipo antes o después de pagar.
      </p>
      <p>
        <strong>Retiro en tienda:</strong> gratis en Carrera 21 con esquina calle 21, Centro,
        Barquisimeto 3001. Compra por la web y recoge cuando te convenga.
      </p>
      <p>
        Los precios del catálogo pueden mostrarse en USD con conversión a Bs. según la tasa vigente
        al momento de la compra.
      </p>

      <h2>5. Contacto</h2>
      <p>
        Teléfonos: <strong>{settings.phone}</strong>
        {settings.phone2 ? (
          <>
            {' '}
            / <strong>{settings.phone2}</strong>
          </>
        ) : null}
        . Correo: <strong>{settings.email}</strong>.
      </p>
    </LegalPageLayout>
  );
}
