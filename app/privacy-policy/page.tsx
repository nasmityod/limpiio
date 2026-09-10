import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPageLayout from '@/app/components/LegalPageLayout';
import { readSettings } from '@/lib/data-store';

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';
const PAGE_URL = `${SITE_URL}/privacy-policy`;

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Conoce cómo MundoTech Barquisimeto trata tus datos personales: qué recopilamos, para qué los usamos, cookies de medición y tus derechos como cliente.',
  alternates: { canonical: PAGE_URL },
  robots: { index: true, follow: true },
};

export default async function PrivacyPolicyPage() {
  const settings = await readSettings();

  return (
    <LegalPageLayout
      title="Política de privacidad"
      lastUpdated="Última actualización: 30 de abril de 2026."
    >
      <p>
        En <strong>{settings.storeName}</strong> (en adelante, «la tienda») tratamos tus datos
        personales con fines legítimos y transparentes. Esta política describe qué información
        podemos recoger, para qué la usamos y tus opciones al respecto.
      </p>

      <h2>1. Responsable</h2>
      <p>
        El responsable del tratamiento es la persona jurídica o titular que opera la tienda bajo el
        nombre comercial <strong>{settings.storeName}</strong>. Para ejercer tus derechos o resolver
        dudas sobre privacidad, utiliza los datos de contacto indicados al final de este documento.
      </p>

      <h2>2. Datos que podemos tratar</h2>
      <ul>
        <li>
          <strong>Datos de cuenta y navegación:</strong> nombre, correo electrónico y, si los
          proporcionas, teléfono y dirección para envíos o facturación.
        </li>
        <li>
          <strong>Datos de pedido:</strong> productos contratados, montos, método de pago elegido,
          referencias de transferencia u otros datos necesarios para verificar el cobro y despachar el
          pedido.
        </li>
        <li>
          <strong>Datos técnicos:</strong> dirección IP, tipo de navegador, páginas visitadas y
          cookies o tecnologías similares cuando configures tu navegador para aceptarlas (véase más
          abajo).
        </li>
      </ul>

      <h2 id="cookies">3. Cookies y tecnologías similares</h2>
      <p>
        Podemos usar cookies esenciales para el funcionamiento del sitio (por ejemplo, sesión o
        carrito de compras) y, cuando corresponda y con tu consentimiento previo, cookies analíticas
        y de publicidad (incluido el Meta Pixel de Facebook/Instagram) para medir visitas, el
        rendimiento de anuncios y mejorar la tienda. Puedes gestionar cookies desde el aviso del
        sitio o la configuración de tu navegador.
      </p>

      <h2>4. Finalidades</h2>
      <ul>
        <li>Gestionar tu registro, pedidos, pagos, envíos y atención al cliente.</li>
        <li>Cumplir obligaciones legales y tributarias cuando aplique.</li>
        <li>Mejorar la seguridad del sitio y prevenir fraudes.</li>
        <li>
          Enviarte comunicaciones comerciales solo si nos has dado tu consentimiento o cuando la ley
          lo permita sin consentimiento previo; podrás darte de baja en cualquier momento.
        </li>
      </ul>

      <h2>5. Conservación</h2>
      <p>
        Conservamos los datos el tiempo necesario para cumplir las finalidades anteriores y las
        obligaciones legales (por ejemplo, registros contables). Transcurrido ese plazo, los suprimimos
        o anonimizamos cuando sea posible.
      </p>

      <h2>6. Cesiones</h2>
      <p>
        Podemos comunicar datos a proveedores que nos ayuden a operar el sitio (hosting, correo,
        mensajería, transportistas o pasarelas de pago), con obligaciones contractuales de
        confidencialidad y seguridad. Solo compartiremos lo estrictamente necesario para cada
        servicio.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger tus datos frente a acceso
        no autorizado, pérdida o alteración. Ningún sistema es infalible; si detectamos un incidente
        que te afecte de forma relevante, procuraremos informarte cuando corresponda.
      </p>

      <h2>8. Tus derechos</h2>
      <p>
        Según la normativa aplicable en Venezuela y sin perjuicio de otras garantías legales, puedes
        solicitar acceso, rectificación, actualización o supresión de tus datos cuando proceda, así
        como oponerte a ciertos tratamientos o revocar consentimientos otorgados. Para ello, escríbenos
        indicando tu solicitud y un medio para verificar tu identidad de forma proporcionada.
      </p>

      <h2>9. Menores de edad</h2>
      <p>
        Los servicios de la tienda están dirigidos a personas con capacidad legal para contratar. Si
        tienes conocimiento de que un menor nos ha facilitado datos sin autorización parental,
        contáctanos para gestionar su eliminación cuando corresponda.
      </p>

      <h2>10. Cambios en esta política</h2>
      <p>
        Podemos actualizar este texto para reflejar cambios en el tratamiento de datos o en la ley.
        Publicaremos la versión vigente en esta página con la fecha de actualización correspondiente.
      </p>

      <h2>11. Contacto</h2>
      <p>
        Para ejercer derechos o consultas sobre privacidad:{' '}
        <a href={`mailto:${settings.email}`}>{settings.email}</a>
        {settings.phone ? (
          <>
            {' '}
            · Teléfono:{' '}
            <a href={`tel:${settings.phone.replace(/\s/g, '')}`}>{settings.phone}</a>
          </>
        ) : null}
      </p>
      {settings.address ? (
        <p>
          Dirección de referencia: <strong>{settings.address}</strong>
        </p>
      ) : null}
      <p>
        Condiciones de compra:{' '}
        <Link href="/terms-of-service" className="text-navy underline underline-offset-2">
          términos y condiciones
        </Link>
        .
      </p>
    </LegalPageLayout>
  );
}
