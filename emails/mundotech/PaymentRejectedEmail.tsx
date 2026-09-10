import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { StatusPill } from './components/StatusPill';
import { MundoTechShell } from './MundoTechShell';
import { emailSiteBaseUrl, emailStorePhones } from './site';
import { MT, fontSans } from './theme';

type Props = {
  customerName: string;
  orderDisplayId: string;
  reason: string;
  orderUuid?: string;
};

export function PaymentRejectedEmail({ customerName, orderDisplayId, reason, orderUuid }: Props) {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  const orderSegment = orderDisplayId.trim() || orderUuid?.trim() || '';
  const ordersPath = orderSegment
    ? `${base}/account/orders/${encodeURIComponent(orderSegment)}`
    : `${base}/account/orders`;
  // PRD-252: dual CTA — invitado o sesión distinta usa el uuid como token de capacidad.
  // DEPENDENCIA-02: /checkout/success debe aceptar acceso sin sesión con ?orderId={uuid}.
  const guestOrderHref = orderUuid?.trim()
    ? `${base}/checkout/success?orderId=${encodeURIComponent(orderUuid.trim())}`
    : null;

  return (
    <MundoTechShell
      preview="No pudimos verificar el pago de tu pedido."
      title="Pago no verificado — MundoTech"
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <StatusPill tone="neutral">Pago no verificado</StatusPill>
        <Text style={{ margin: '0 0 8px', fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 14px', fontSize: 18, lineHeight: 1.45, color: MT.danger, fontWeight: 700 }}>
          No pudimos verificar el pago de tu pedido
        </Text>
        <Text style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          No logramos confirmar el pago del pedido{' '}
          <strong style={{ color: MT.textPrimary }}>#{orderDisplayId}</strong>, por lo que ha sido cancelado y las
          unidades regresaron al inventario.
        </Text>
        {reason?.trim() ? (
          <Text
            style={{
              margin: '0 0 12px',
              fontSize: 14,
              lineHeight: 1.6,
              color: MT.textPrimary,
              backgroundColor: 'rgba(220, 38, 38, 0.08)',
              border: '1px solid rgba(220, 38, 38, 0.25)',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <strong>Motivo:</strong> {reason.trim()}
          </Text>
        ) : null}
        {/* PRD-109: teléfono de tienda desde emailStorePhones() — no hardcodeado. */}
        <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          Si ya pagaste o crees que es un error, tranquilo: responde a este
          correo con tu comprobante o escríbenos por WhatsApp al {emailStorePhones()} y
          lo revisamos de una vez. También puedes repetir el pedido cuando
          quieras — el stock vuelve a estar disponible.
        </Text>
      </Section>

      <PrimaryCta href={ordersPath} label="Ver mis pedidos" />

      {guestOrderHref && (
        <Section style={{ padding: '4px 28px 0', fontFamily: fontSans, textAlign: 'center' }}>
          <Text style={{ margin: 0, fontSize: 12, color: MT.textMuted, lineHeight: 1.6 }}>
            ¿Compraste sin cuenta o en otro dispositivo?{' '}
            <Link
              href={guestOrderHref}
              style={{ color: MT.gold, textDecoration: 'underline', fontSize: 12 }}
            >
              Ver pedido como invitado
            </Link>
          </Text>
        </Section>
      )}

      <Section style={{ padding: '0 24px 28px', fontFamily: fontSans }} />
    </MundoTechShell>
  );
}
