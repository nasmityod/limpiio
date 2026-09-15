import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { EmailShell } from './EmailShell';
import { MT, fontSans } from './theme';
import { BRAND } from '@/config/brand';

type Props = {
  customerName: string;
  newEmail: string;
  /** Enlace para restablecer contraseña si el cambio no fue del cliente. */
  resetUrl: string;
};

/**
 * SEC-2026-09: aviso al correo ANTERIOR cuando se solicita cambiar el email de
 * la cuenta. Antes solo se notificaba al correo nuevo: con una sesión robada
 * el atacante cambiaba el email en silencio y luego reseteaba la contraseña.
 */
export function EmailChangeNoticeEmail({ customerName, newEmail, resetUrl }: Props) {
  return (
    <EmailShell
      preview={`Se solicitó cambiar el correo de tu cuenta en ${BRAND.name}.`}
      title="Solicitud de cambio de correo"
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <Text style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: MT.textPrimary }}>
          Se solicitó cambiar tu correo
        </Text>
        <Text style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Alguien pidió cambiar el correo de tu cuenta en {BRAND.name} a{' '}
          <strong style={{ color: MT.textPrimary }}>{newEmail}</strong>. El cambio solo se
          aplica si se confirma desde ese correo nuevo en la próxima hora.
        </Text>
        <Text style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Si fuiste tú, no necesitas hacer nada. Si <strong style={{ color: MT.textPrimary }}>no</strong>{' '}
          fuiste tú, cambia tu contraseña ahora: eso cierra todas las sesiones abiertas.
        </Text>
      </Section>

      <PrimaryCta href={resetUrl} label="Cambiar mi contraseña" />

      <Section style={{ padding: '8px 24px 28px', fontFamily: fontSans }}>
        <Text style={{ margin: 0, fontSize: 12, color: MT.textMuted, textAlign: 'center' }}>
          Este aviso se envía siempre al correo anterior de la cuenta.
        </Text>
      </Section>
    </EmailShell>
  );
}
