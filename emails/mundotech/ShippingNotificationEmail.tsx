import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { StatusPill } from './components/StatusPill';
import { MundoTechShell } from './MundoTechShell';
import { emailSiteBaseUrl } from './site';
import { MT, fontSans } from './theme';

export type ShippingNotificationOptions = {
  carrier?: string | null;
  trackingUrl?: string | null;
  /** Segmento legible para la URL del pedido (#0042), no el cuid. */
  orderId?: string | null;
};

type Props = {
  customerName: string;
  trackingNumber: string;
  opts?: ShippingNotificationOptions;
};

export function ShippingNotificationEmail({ customerName, trackingNumber, opts }: Props) {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  const carrierRaw = opts?.carrier?.trim() || 'Tu transportista';
  const explicitUrl = opts?.trackingUrl?.trim();
  const orderId = opts?.orderId?.trim();
  const trackHref =
    explicitUrl && /^https?:\/\//i.test(explicitUrl)
      ? explicitUrl
      : orderId
        ? `${base}/account/orders/${encodeURIComponent(orderId)}`
        : `${base}/account/orders`;
  const ctaLabel =
    explicitUrl && /^https?:\/\//i.test(explicitUrl) ? 'Rastrear envío' : 'Ver detalles del pedido';

  return (
    <MundoTechShell
      preview="Tu pedido va en camino — aquí está tu guía de seguimiento."
      title="Pedido enviado — MundoTech"
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <StatusPill tone="neutral">Enviado</StatusPill>
        <Text style={{ margin: '0 0 8px', fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          ¡Hola <strong>{customerName}</strong>!
        </Text>
        <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          ¡Tu pedido ya va en camino! Salió de nuestra tienda en Barquisimeto
          con <strong style={{ color: MT.textPrimary }}>{carrierRaw}</strong>.
          Guarda este número de guía para seguirlo:
        </Text>
      </Section>

      <Section style={{ padding: '8px 24px 16px', fontFamily: fontSans }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            borderCollapse: 'collapse',
            border: `1px solid ${MT.border}`,
            borderRadius: 12,
            backgroundColor: MT.cardBgAlt,
          }}
        >
          <tbody>
            <tr>
              <td style={{ padding: '20px 18px' }}>
                <Text
                  style={{
                    margin: '0 0 6px',
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: MT.textMuted,
                  }}
                >
                  Guía / tracking
                </Text>
                <Text
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    color: MT.textPrimary,
                    letterSpacing: '0.03em',
                    fontFamily: 'Consolas, Courier New, monospace',
                  }}
                >
                  {trackingNumber.trim()}
                </Text>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <PrimaryCta href={trackHref} label={ctaLabel} />
      <Section style={{ padding: '0 24px 28px', fontFamily: fontSans }} />
    </MundoTechShell>
  );
}
