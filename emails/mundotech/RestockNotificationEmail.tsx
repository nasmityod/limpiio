import { Section, Text, Img, Link } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { MundoTechShell } from './MundoTechShell';
import { emailSiteBaseUrl } from './site';
import { MT, fontSans } from './theme';

type Props = {
  productName: string;
  productUrl: string;
  productImageUrl?: string;
  productPrice?: string;
};

export function RestockNotificationEmail({
  productName,
  productUrl,
  productImageUrl,
  productPrice,
}: Props) {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  const shopUrl = `${base}/productos`;

  return (
    <MundoTechShell
      preview={`¡${productName} volvió al stock! Cómpralo antes de que se agote.`}
      title={`${productName} volvió a estar disponible — MundoTech`}
    >
      <Section style={{ padding: '20px 24px 8px', fontFamily: fontSans }}>
        <Text
          style={{
            margin: '0 0 6px',
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: MT.goldText,
            fontWeight: 700,
          }}
        >
          De vuelta en stock
        </Text>
        <Text
          style={{
            margin: '0 0 12px',
            fontSize: 20,
            fontWeight: 700,
            color: MT.textPrimary,
            lineHeight: 1.35,
          }}
        >
          ¡Ya está disponible!
        </Text>
        <Text
          style={{
            margin: '0 0 18px',
            fontSize: 15,
            lineHeight: 1.7,
            color: MT.textMuted,
          }}
        >
          Nos pediste el aviso y aquí está: este producto volvió al inventario
          de la tienda. Suele irse rápido — los que avisamos por correo son los
          primeros en llegar.
        </Text>
      </Section>

      {/* Tarjeta del producto */}
      <Section style={{ padding: '0 24px 8px', fontFamily: fontSans }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            borderCollapse: 'separate',
            backgroundColor: MT.cardBgAlt,
            borderRadius: 12,
            border: `1px solid ${MT.border}`,
            overflow: 'hidden',
          }}
        >
          <tbody>
            <tr>
              {productImageUrl && (
                <td
                  width={80}
                  style={{ padding: '16px 0 16px 16px', verticalAlign: 'middle' }}
                >
                  <Img
                    src={productImageUrl}
                    width={64}
                    height={64}
                    alt={productName}
                    style={{ borderRadius: 8, objectFit: 'cover', display: 'block' }}
                  />
                </td>
              )}
              <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                <Text
                  style={{
                    margin: '0 0 4px',
                    fontSize: 14,
                    fontWeight: 700,
                    color: MT.textPrimary,
                    lineHeight: 1.4,
                  }}
                >
                  {productName}
                </Text>
                {productPrice && (
                  <Text
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 700,
                      color: MT.textPrimary,
                    }}
                  >
                    {productPrice}
                  </Text>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <PrimaryCta href={productUrl} label="Ver producto y comprar" />

      <Section
        style={{
          padding: '8px 24px 28px',
          textAlign: 'center',
          fontFamily: fontSans,
        }}
      >
        <Text style={{ margin: '0 0 8px', fontSize: 13, color: MT.textMuted }}>
          ¿No quieres más avisos de este tipo?
        </Text>
        <Link
          href={shopUrl}
          style={{
            fontSize: 12,
            color: MT.textMuted,
            textDecoration: 'underline',
          }}
        >
          Explorar más productos
        </Link>
      </Section>
    </MundoTechShell>
  );
}
