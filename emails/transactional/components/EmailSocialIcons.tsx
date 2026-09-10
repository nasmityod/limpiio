import { Img, Link, Section } from '@react-email/components';
import * as React from 'react';
import { EMAIL_SOCIAL_LINKS, emailSocialIconUrl } from '../email-social-links';

type Props = {
  /** Tamaño del icono en px (ancho y alto). */
  size?: number;
};

/** Redes sociales con PNG blancos — usar solo sobre fondo oscuro (MT.bandBg). */
export function EmailSocialIcons({ size = 28 }: Props) {
  return (
    <Section style={{ textAlign: 'center' }}>
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        align="center"
        style={{ margin: '0 auto', borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            {EMAIL_SOCIAL_LINKS.map((item, index) => (
              <td
                key={item.label}
                style={{
                  paddingLeft: index === 0 ? 0 : 12,
                  paddingRight: index === EMAIL_SOCIAL_LINKS.length - 1 ? 0 : 0,
                }}
              >
                <Link href={item.href} target="_blank" title={item.label}>
                  <Img
                    src={emailSocialIconUrl(item.icon)}
                    width={size}
                    height={size}
                    alt={item.label}
                    title={item.label}
                    style={{ display: 'block', border: 0 }}
                  />
                </Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}
