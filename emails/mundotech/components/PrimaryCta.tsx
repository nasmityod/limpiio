import { Button, Section } from '@react-email/components';
import * as React from 'react';
import { MT, fontSans } from '../theme';

type Props = {
  href: string;
  label: string;
  /** Botón tipo bloque dentro del ancho del correo (mockup checkout). */
  fullWidth?: boolean;
};

/** CTA único marca — mismo estilo en todos los correos transaccionales. */
export function PrimaryCta({ href, label, fullWidth }: Props) {
  const btnStyle: React.CSSProperties = {
    backgroundColor: MT.gold,
    color: MT.navy,
    borderRadius: 12,
    fontWeight: 700,
    padding: '16px 24px',
    fontSize: 15,
    textDecoration: 'none',
    display: 'inline-block',
    border: `1px solid #e6c200`,
    fontFamily: fontSans,
    boxSizing: 'border-box',
    ...(fullWidth
      ? { width: '100%', textAlign: 'center' as const }
      : {}),
  };

  return (
    <Section style={{ padding: '16px 24px 10px', fontFamily: fontSans }}>
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            <td align="center">
              <Button href={href} style={btnStyle}>
                {label}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}
