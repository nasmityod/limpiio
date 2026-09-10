import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { WelcomeSocialFooter } from './components/WelcomeSocialFooter';
import { EmailShell } from './EmailShell';
import { emailSiteBaseUrl } from './site';
import { MT, fontSans } from './theme';
import { BRAND } from '@/config/brand';

// Datos de contacto desde config/brand.ts: una tienda derivada nunca debe
// enviar a sus clientes el correo ni el WhatsApp de otra.
const CONTACT_EMAIL = BRAND.contactEmail;
const WHATSAPP_URL = BRAND.social.whatsapp;
const WHATSAPP_DISPLAY = BRAND.phones;

type Props = {
  customerName: string;
};

export function WelcomeEmail({ customerName }: Props) {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  const shopUrl = `${base}/productos`;

  return (
    <EmailShell
      preview={`¡Bienvenido a ${BRAND.name}! Gracias por registrarte.`}
      title={`Bienvenido a ${BRAND.name}`}
      headerCompact
      footer={<WelcomeSocialFooter />}
    >
      <Section style={{ padding: '24px 24px 8px', backgroundColor: MT.cardBg, fontFamily: fontSans }}>
        <Text style={{ margin: '0 0 16px', fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700, lineHeight: 1.3, color: MT.textPrimary }}>
          ¡Bienvenido a {BRAND.name}!
        </Text>
        <Text style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Gracias por registrarte. Desde ahora tienes acceso a beneficios exclusivos, lanzamientos
          especiales y todo lo que preparamos para personas como tú.
        </Text>
        <Text style={{ margin: '0 0 8px', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Visita nuestra tienda online y descubre lo más nuevo en tecnología, electrónica y los
          productos virales del momento.
        </Text>
      </Section>

      <PrimaryCta fullWidth href={shopUrl} label={`Ir a ${BRAND.name}`} />

      <Section style={{ padding: '8px 24px 28px', backgroundColor: MT.cardBg, fontFamily: fontSans }}>
        <Text style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          ¿Necesitas ayuda? Nuestro equipo está listo para ayudarte.
        </Text>
        <Text style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          • Soporte WhatsApp:{' '}
          <Link href={WHATSAPP_URL} style={{ color: MT.goldText, fontWeight: 700, textDecoration: 'none' }}>
            {WHATSAPP_DISPLAY}
          </Link>
        </Text>
        <Text style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Si tienes dudas o quieres más información, escríbenos a{' '}
          <Link
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ color: MT.goldText, fontWeight: 700, textDecoration: 'none' }}
          >
            {CONTACT_EMAIL}
          </Link>
          .
        </Text>
        <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Gracias por elegir {BRAND.name}. ¡Nos encanta tenerte con nosotros!
        </Text>
      </Section>
    </EmailShell>
  );
}
