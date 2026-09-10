import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { MundoTechShell } from './MundoTechShell';
import { MT, fontSans } from './theme';

type Props = {
  resetUrl: string;
};

export function PasswordResetEmail({ resetUrl }: Props) {
  const displayUrl = resetUrl;

  return (
    <MundoTechShell
      preview="Restablece tu contraseña de MundoTech de forma segura."
      title="Restablecer contraseña · MundoTech"
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <Text
          style={{
            margin: '0 0 12px',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: MT.textMuted,
          }}
        >
          Seguridad
        </Text>
        <Text style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: MT.textMuted }}>
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en{' '}
          <strong style={{ color: MT.textPrimary }}>MundoTech</strong>. Si fuiste tú, pulsa el botón para elegir una
          nueva clave.
        </Text>
        <Text style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.6, color: MT.textMuted }}>
          Si no solicitaste este cambio, ignora este mensaje. Nadie podrá cambiar tu contraseña sin acceso a tu correo.
        </Text>
      </Section>

      <PrimaryCta href={resetUrl} label="Restablecer contraseña" />

      <Section style={{ padding: '8px 24px 28px', fontFamily: fontSans }}>
        <Text style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: MT.textMuted, wordBreak: 'break-all' }}>
          ¿El botón no funciona? Copia y pega en el navegador:
          <br />
          <span style={{ color: MT.textPrimary }}>{displayUrl}</span>
        </Text>
        <Text style={{ margin: '12px 0 0', fontSize: 12, color: MT.textMuted }}>
          El enlace expira en 15 minutos.
        </Text>
      </Section>
    </MundoTechShell>
  );
}
