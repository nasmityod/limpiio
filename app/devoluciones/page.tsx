import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPageLayout from '@/app/components/LegalPageLayout';
import { readSettings } from '@/lib/data-store';
import { whatsappHref } from '@/lib/mundotech-social';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';
const PAGE_URL = `${SITE_URL}/devoluciones`;

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Devoluciones y garantía',
  description:
    'Política de devoluciones y garantía de MundoTech Barquisimeto: 7 días en electrónica general (garantía de la tienda), con factura y caja original; sin garantía en electrónica para vehículos ni productos no electrónicos.',
  alternates: { canonical: PAGE_URL },
};

const FAQ = [
  {
    q: '¿Cuánto tiempo tengo para reportar un producto defectuoso?',
    a: 'En electrónica general tienes 7 días continuos desde que recibes el producto. Escríbenos por WhatsApp con tu número de pedido, factura y una foto o video del problema. Recuerda conservar la caja o empaque original.',
  },
  {
    q: '¿Cómo funciona la garantía?',
    a: 'Electrónica en general: garantía de 7 días (garantía de la tienda, no de fábrica). Electrónica para vehículos o carro: sin garantía. Productos no electrónicos: sin garantía. Para hacerla válida, el producto debe devolverse con su factura y su caja o empaque original.',
  },
  {
    q: '¿Cómo hago una devolución si compré por la web?',
    a: 'Contáctanos por WhatsApp o correo con tu número de pedido y factura. La garantía aplica solo a electrónica en general, dentro de los 7 días. Puedes traer el producto a la tienda con su caja original o enviarlo por MRW, Zoom o Tealca (Pago en Origen). Si el caso califica bajo nuestra garantía, coordinamos el cambio contigo.',
  },
  {
    q: '¿Devuelven el dinero?',
    a: 'Nuestra primera opción siempre es cambiar el producto por uno nuevo igual. Si no hay stock, puedes elegir otro producto por el mismo valor o solicitar el reembolso por el mismo método con el que pagaste (Pago Móvil, transferencia o Binance), en un plazo de 3 a 5 días hábiles tras confirmar el caso.',
  },
  {
    q: '¿Puedo devolver un producto porque me arrepentí de la compra?',
    a: 'Si el producto está sin abrir, con su empaque sellado y accesorios completos, puedes plantearnos el cambio dentro de los 7 días por otro producto de la tienda, solo en electrónica general. Los productos abiertos o usados sin fallo cubierto por la garantía no aplican para devolución.',
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default async function DevolucionesPage() {
  const settings = await readSettings();
  const waHref = whatsappHref(
    settings.phone,
    'Hola MundoTech, necesito ayuda con una devolución o garantía. Mi número de pedido es: ',
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <LegalPageLayout
        title="Devoluciones y garantía"
        lastUpdated="Así trabajamos las garantías en MundoTech — claro y sin letra pequeña."
      >
        <p>
          Somos una tienda física en Barquisimeto y respondemos por lo que
          vendemos. Si algo llega mal o presenta un fallo cubierto por nuestra
          garantía, lo resolvemos directamente contigo: sin tickets eternos ni
          centros de servicio fantasma.
        </p>

        <h2>1. Revisión al recibir (7 días — electrónica general)</h2>
        <p>
          Revisa tu producto apenas lo recibas. En <strong>electrónica en
          general</strong> tienes <strong>7 días continuos</strong> desde la
          entrega para hacer válida la garantía de la tienda. Electrónica para
          vehículos y productos no electrónicos no tienen garantía.
        </p>
        <ul>
          <li>Escríbenos por WhatsApp al <strong>{settings.phone}</strong> o al correo <strong>{settings.email}</strong>.</li>
          <li>Indica tu número de pedido, presenta tu factura y adjunta foto o video del problema.</li>
          <li>Conserva la caja o empaque original — es requisito para cualquier gestión de garantía.</li>
          <li>Te respondemos con los pasos a seguir — normalmente el mismo día hábil.</li>
        </ul>

        <h2>2. Categorías de garantía</h2>
        <ul>
          <li>
            <strong>Electrónica en general:</strong> garantía de 7 días (garantía
            de la tienda, no de fábrica).
          </li>
          <li>
            <strong>Electrónica para vehículos o carro:</strong> sin garantía.
          </li>
          <li>
            <strong>Productos no electrónicos:</strong> sin garantía.
          </li>
        </ul>
        <p>
          Para que la garantía sea válida, el producto debe devolverse con su{' '}
          <strong>factura</strong> y su <strong>caja o empaque original</strong>.
        </p>
        <p>La garantía de la tienda <strong>no cubre</strong>:</p>
        <ul>
          <li>Daños por golpes, caídas, líquidos o humedad.</li>
          <li>Desgaste normal de piezas consumibles (baterías por uso, cables, fundas).</li>
          <li>Equipos intervenidos por servicios técnicos ajenos a la tienda.</li>
          <li>Mal uso o instalación distinta a la indicada por el fabricante.</li>
          <li>Electrónica para vehículos y productos no electrónicos (excluidos de garantía).</li>
        </ul>

        <h2>3. Cambios y reembolsos</h2>
        <p>
          Confirmado el caso bajo nuestra garantía, te ofrecemos en este orden: (a) cambio por un
          producto nuevo idéntico, (b) otro producto por el mismo valor, o
          (c) reembolso por el mismo método con el que pagaste — Pago Móvil,
          transferencia bancaria o Binance — en un plazo de 3 a 5 días hábiles.
        </p>

        <h2>4. Envíos de retorno</h2>
        <p>
          Si estás en Barquisimeto, puedes traer el producto a la tienda con su
          factura y caja original. Si estás en otra ciudad, lo envías por MRW,
          Zoom o Tealca (<strong>cobro a destino</strong> — el cliente paga el
          flete al recibir). Coordinamos contigo los pasos según el caso.
        </p>

        <h2>5. Condiciones generales</h2>
        <ul>
          <li>El producto debe entregarse completo: caja original, accesorios y manuales.</li>
          <li>Conserva tu factura y número de pedido — son requisitos para la garantía.</li>
          <li>Los productos en oferta siguen la misma política de garantía que los de precio regular.</li>
        </ul>

        <h2>Preguntas frecuentes</h2>
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <p><strong>{q}</strong></p>
            <p>{a}</p>
          </div>
        ))}

        <p>
          ¿Tienes un caso particular? Escríbenos por{' '}
          <a href={waHref} target="_blank" rel="noopener noreferrer">WhatsApp</a>{' '}
          o visita la sección{' '}
          <Link href="/nosotros">Quiénes somos</Link> para conocer la tienda.
          También puedes revisar nuestra{' '}
          <Link href="/shipping-policy">política de envíos</Link>.
        </p>
      </LegalPageLayout>
    </>
  );
}
