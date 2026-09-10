import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailSocialIcons } from './EmailSocialIcons';
import { MT, fontSans } from '../theme';

/** Pie oscuro estilo Daka — correo de bienvenida y variantes compactas. */
export function WelcomeSocialFooter() {
  const year = new Date().getFullYear();

  return (
    <Section
      style={{
        padding: '28px 24px',
        textAlign: 'center',
        backgroundColor: MT.bandBg,
        borderTop: `3px solid ${MT.gold}`,
        fontFamily: fontSans,
      }}
    >
      <EmailSocialIcons />
      <Text style={{ margin: '16px 0 0', fontSize: 12, lineHeight: 1.5, color: '#A8B0BC' }}>
        © MundoTech {year}. Todos los derechos reservados.
      </Text>
    </Section>
  );
}
