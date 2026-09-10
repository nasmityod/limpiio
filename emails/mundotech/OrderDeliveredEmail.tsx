import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { StatusPill } from './components/StatusPill';
import { MundoTechShell } from './MundoTechShell';
import { emailSiteBaseUrl } from './site';
import { MT, fontSans } from './theme';

type Props = {
  customerName: string;
  /** Segmento legible para la URL del pedido (#0042). */
  orderRef: string;
};

export function OrderDeliveredEmail({ customerName, orderRef }: Props) {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  const orderUrl = `${base}/account/orders/${encodeURIComponent(orderRef)}`;
  const shopUrl = `${base}/productos`;

  return (
    <MundoTechShell
      preview="Tu pedido fue entregado — gracias por confiar en MundoTech."
      title="Pedido entregado — MundoTech"
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <StatusPill tone="success">Entregado</StatusPill>
        <Text style={{ margin: '0 0 8px', fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 14px', fontSize: 18, lineHeight: 1.45, color: MT.textPrimary, fontWeight: 700 }}>
          ¡Tu pedido llegó! Que lo disfrutes
        </Text>
        <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          Recuerda que tienes 7 días de garantía en electrónica general (no aplica
          a electrónica para vehículos ni a productos no electrónicos). Para
          hacerla válida, conserva tu factura y la caja original. Si algo no cuadra,
          responde a este correo y lo resolvemos.
        </Text>
      </Section>

      <PrimaryCta href={orderUrl} label="Ver detalles del pedido" />

      <Section style={{ textAlign: 'center', padding: '12px 24px 28px', fontFamily: fontSans }}>
        <Link
          href={shopUrl}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            fontSize: 14,
            fontWeight: 700,
            color: MT.navy,
            backgroundColor: 'rgba(255, 215, 0, 0.16)',
            borderRadius: 12,
            textDecoration: 'none',
            border: `1px solid #e6c200`,
          }}
        >
          Ver qué hay de nuevo en la tienda
        </Link>
      </Section>
    </MundoTechShell>
  );
}
