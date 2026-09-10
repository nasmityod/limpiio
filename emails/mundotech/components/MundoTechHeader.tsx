import { Img, Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import {
  EMAIL_LOGO_DISPLAY_HEIGHT,
  EMAIL_LOGO_DISPLAY_WIDTH,
  emailLogoUrl,
  emailSiteBaseUrl,
} from '../site';
import { MT, fontSans } from '../theme';

type Props = {
  customerName?: string;
  /** Sin nombre destacado bajo el eslogan (el saludo va en el cuerpo del correo). */
  compact?: boolean;
};

/**
 * Cabecera-letrero: la única zona oscura del correo. Reproduce el letrero
 * físico de la tienda (fondo negro/navy + logo amarillo + slogan). El cuerpo
 * del correo es claro por decisión del dueño.
 */
export function MundoTechHeader({ customerName, compact }: Props) {
  const name = !compact ? customerName?.trim() : undefined;

  return (
    <Section
      style={{
        textAlign: 'center',
        padding: compact ? '26px 24px 22px' : '30px 28px 26px',
        backgroundColor: MT.bandBg,
        borderBottom: `3px solid ${MT.gold}`,
        fontFamily: fontSans,
      }}
    >
      <Link
        href={emailSiteBaseUrl()}
        style={{ textDecoration: 'none', display: 'inline-block' }}
        title="MundoTech — Ir a la tienda"
      >
        <Img
          src={emailLogoUrl()}
          width={EMAIL_LOGO_DISPLAY_WIDTH}
          height={EMAIL_LOGO_DISPLAY_HEIGHT}
          alt="MundoTech — Conectados Contigo"
          style={{
            display: 'block',
            margin: '0 auto 10px',
            border: 0,
            outline: 'none',
          }}
        />
      </Link>
      <Text
        style={{
          margin: 0,
          fontSize: 12,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: MT.gold,
          fontWeight: 700,
        }}
      >
        Conectados Contigo
      </Text>
      {name ? (
        <Text
          style={{
            margin: '14px 0 0',
            fontSize: 14,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.85)',
          }}
        >
          {name}
        </Text>
      ) : null}
    </Section>
  );
}
