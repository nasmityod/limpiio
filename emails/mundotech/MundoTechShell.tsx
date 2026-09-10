import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { MundoTechFooter } from './components/MundoTechFooter';
import { MundoTechHeader } from './components/MundoTechHeader';
import { MT, fontSans } from './theme';

type Props = {
  preview: string;
  /** Texto para <title> (accesibilidad / pestaña en algunos webmail). */
  title: string;
  heroCustomerName?: string;
  /** Solo logo + eslogan (ej. confirmación de pedido estilo mockup). */
  headerCompact?: boolean;
  /** Pie personalizado; por defecto usa MundoTechFooter. */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function MundoTechShell({
  preview,
  title,
  heroCustomerName,
  headerCompact,
  footer,
  children,
}: Props) {
  return (
    <Html lang="es">
      <Head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            @media only screen and (max-width: 600px) {
              .mt-pad { padding-left: 16px !important; padding-right: 16px !important; }
            }
          `,
          }}
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: MT.pageBg,
          fontFamily: fontSans,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* Gmail strips <head> entirely — duplicate media query in <body> as best-effort fallback */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
            @media only screen and (max-width: 600px) {
              .mt-pad { padding-left: 16px !important; padding-right: 16px !important; }
            }
          `,
          }}
        />
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ backgroundColor: MT.pageBg, borderCollapse: 'collapse' }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: '24px 12px' }}>
                <Container
                  style={{
                    maxWidth: 560,
                    width: '100%',
                    margin: '0 auto',
                    borderCollapse: 'separate',
                  }}
                >
                  <Section
                    style={{
                      backgroundColor: MT.cardBg,
                      borderRadius: 16,
                      border: `1px solid ${MT.border}`,
                      overflow: 'hidden',
                    }}
                  >
                    <MundoTechHeader
                      customerName={heroCustomerName}
                      compact={headerCompact}
                    />
                    {children}
                    {footer ?? <MundoTechFooter />}
                  </Section>
                </Container>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}
