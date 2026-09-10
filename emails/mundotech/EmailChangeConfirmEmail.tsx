import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { MundoTechShell } from './MundoTechShell';
import { MT, fontSans } from './theme';

type Props = {
  customerName: string;
  confirmUrl: string;
  newEmail: string;
};

export function EmailChangeConfirmEmail({ customerName, confirmUrl, newEmail }: Props) {
  return (
    <MundoTechShell
      preview="Confirma tu nuevo correo electrónico en MundoTech."
      title="Confirma tu nuevo correo"
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <Text style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: MT.textPrimary }}>
          Confirma tu nuevo correo
        </Text>
        <Text style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Recibimos una solicitud para cambiar el correo electrónico de tu cuenta a{' '}
          <strong style={{ color: MT.textPrimary }}>{newEmail}</strong>.
        </Text>
        <Text style={{ margin: '16px 0 0', fontSize: 15, lineHeight: 1.75, color: MT.textMuted }}>
          Haz clic en el botón de abajo para confirmar el cambio. El enlace expira en{' '}
          <strong style={{ color: MT.textPrimary }}>1 hora</strong>.
        </Text>
        <Text style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.6, color: MT.textMuted }}>
          Si no solicitaste este cambio, ignora este correo y tu dirección actual
          permanecerá sin cambios.
        </Text>
      </Section>

      <PrimaryCta href={confirmUrl} label="Confirmar nuevo correo" />

      <Section style={{ padding: '8px 24px 28px', fontFamily: fontSans }}>
        <Text style={{ margin: 0, fontSize: 12, color: MT.textMuted, textAlign: 'center' }}>
          Este enlace caduca en 1 hora. Si no lo solicitaste, no es necesario hacer nada.
        </Text>
      </Section>
    </MundoTechShell>
  );
}
