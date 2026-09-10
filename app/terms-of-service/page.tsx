import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPageLayout from '@/app/components/LegalPageLayout';
import { readSettings } from '@/lib/data-store';

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';
const PAGE_URL = `${SITE_URL}/terms-of-service`;

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description:
    'Condiciones generales de compra en MundoTech Barquisimeto: pedidos, precios en USD y Bs, métodos de pago, envíos nacionales, garantía y devoluciones.',
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
};

export default async function TermsOfServicePage() {
  const settings = await readSettings();

  return (
    <LegalPageLayout
      title="Términos y condiciones"
      lastUpdated="Última actualización: 13 de junio de 2026."
    >
      <p>
        Los presentes términos regulan el acceso y uso del sitio web operado por{' '}
        <strong>{settings.storeName}</strong> (en adelante, «la tienda») y las compras realizadas a
        través del mismo. Al navegar o contratar, declaras haber leído y aceptado estas condiciones.
      </p>

      <h2>1. Objeto</h2>
      <p>
        La tienda ofrece la venta de productos de tecnología y afines según disponibilidad en
        inventario. Las descripciones, imágenes y precios tienen carácter orientativo salvo error
        manifestado; nos reservamos corregir errores tipográficos o de sistema antes de confirmar el
        pedido.
      </p>

      <h2>2. Registro y cuenta</h2>
      <p>
        Para ciertas funciones puede ser necesario crear una cuenta. Eres responsable de la
        veracidad de los datos y de la confidencialidad de tus credenciales. Debes notificar de
        inmediato cualquier uso no autorizado.
      </p>

      <h2>3. Precios y moneda</h2>
      <p>
        Los precios del catálogo se expresan en dólares (USD) como referencia
        comercial. De acuerdo con la normativa cambiaria venezolana, el bolívar es la moneda de curso
        legal; por ello, cuando el pago se realice en bolívares, el equivalente se calculará al{' '}
        <strong>tipo de cambio oficial del dólar publicado por el Banco Central de Venezuela (BCV)</strong>{' '}
        vigente al momento de la operación.
      </p>
      <p>
        La referencia en bolívares que ves en el sitio se actualiza conforme a esa tasa oficial del día.
        El monto definitivo en Bs. es el confirmado en el checkout y queda reflejado en tu pedido una
        vez validado el pago. Si la operación ocurre en día no hábil para el sector financiero, se
        aplicará la tasa oficial correspondiente conforme a la normativa vigente.
      </p>

      <h2>4. Pedidos</h2>
      <ul>
        <li>
          La formalización del pedido supone tu oferta de compra. La tienda puede confirmar o rechazar
          el pedido por falta de stock, inconsistencia de datos o causas operativas.
        </li>
        <li>
          Recibirás comunicación sobre el estado del pedido por los medios que hayas proporcionado (por
          ejemplo, correo electrónico).
        </li>
        <li>
          Los pedidos que permanezcan en estado pendiente durante más de 48 horas desde su creación
          podrán cancelarse automáticamente. Al cancelarse, se liberará la reserva correspondiente y
          se revertirá el uso del cupón cuando aplique.
        </li>
      </ul>

      <h2>5. Pagos</h2>
      <p>
        Los métodos de pago disponibles se indican durante el checkout y pueden incluir Pago Móvil,
        transferencia bancaria o Binance Pay, según lo habilitado en cada momento. El pedido puede
        quedar condicionado a la verificación del abono y de los datos del comprobante.
      </p>

      <h2>6. Envíos y entregas</h2>
      <p>
        Los plazos y costos de envío dependen del destino y del transportista. Los tiempos estimados
        son orientativos y no incluyen causas de fuerza mayor o demoras ajenas a la tienda. El riesgo
        de pérdida o daño puede transferirse según las prácticas del envío acordadas en cada caso.
      </p>

      <h2>7. Garantía y cambios</h2>
      <p>
        La garantía de MundoTech aplica según la categoría del producto: electrónica en general
        tiene 7 días de garantía de la tienda (no de fábrica); la electrónica para vehículos y
        los productos no electrónicos no tienen garantía. Para hacerla válida, el producto debe
        devolverse con su factura y su caja o empaque original. Los detalles completos están en
        nuestra{' '}
        <Link href="/devoluciones" className="text-navy underline underline-offset-2">
          política de devoluciones y garantía
        </Link>
        .
      </p>

      <h2>8. Propiedad intelectual</h2>
      <p>
        Los contenidos del sitio (textos, diseño, marcas y logos, salvo licencias de terceros) son
        titularidad de la tienda o sus licenciantes. Queda prohibida su reproducción o uso comercial no
        autorizado.
      </p>

      <h2>9. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley aplicable, la tienda no será responsable por daños
        indirectos o lucro cesante derivados del uso del sitio o de retrasos ajenos a su control
        razonable. El sitio se ofrece «tal cual»; procuramos su disponibilidad continua pero no
        garantizamos ausencia total de errores o interrupciones.
      </p>

      <h2>10. Ley aplicable</h2>
      <p>
        Para lo no regulado expresamente, se aplicarán las normas sustantivas de la República
        Bolivariana de Venezuela, sin perjuicio de disposiciones imperativas que protejan al
        consumidor.
      </p>

      <h2>11. Modificaciones</h2>
      <p>
        La tienda puede actualizar estos términos publicando la nueva versión en esta página. El uso
        continuado del sitio tras cambios relevantes puede implicar la aceptación de los mismos.
      </p>

      <h2>12. Contacto</h2>
      <p>
        Para consultas sobre estos términos o tu pedido, escribe a{' '}
        <a href={`mailto:${settings.email}`}>{settings.email}</a>
        {settings.phone ? (
          <>
            {' '}
            o llama al <a href={`tel:${settings.phone.replace(/\s/g, '')}`}>{settings.phone}</a>.
          </>
        ) : (
          '.'
        )}
      </p>
      <p>
        También puedes revisar nuestra{' '}
        <Link href="/privacy-policy" className="text-navy underline underline-offset-2">
          política de privacidad
        </Link>
        .
      </p>
    </LegalPageLayout>
  );
}
