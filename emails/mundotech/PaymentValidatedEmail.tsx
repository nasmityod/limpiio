import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { StatusPill } from './components/StatusPill';
import { MundoTechShell } from './MundoTechShell';
import { emailSiteBaseUrl } from './site';
import { MT, fontSans } from './theme';

type Props = {
  customerName: string;
  orderDisplayId: string;
  orderUuid?: string;
  /** Fase 7: variante Cashea — el pago verificado es la INICIAL, no el total del pedido. */
  casheaInitial?: boolean;
};

export function PaymentValidatedEmail({ customerName, orderDisplayId, orderUuid, casheaInitial }: Props) {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  // El enlace usa el número de pedido legible (#0042). `orderUuid` se mantiene
  // solo como respaldo para enlaces de versiones anteriores del correo.
  const orderSegment = orderDisplayId.trim() || orderUuid?.trim() || '';
  const ordersPath = orderSegment
    ? `${base}/account/orders/${encodeURIComponent(orderSegment)}`
    : `${base}/account/orders`;
  // PRD-249: dual CTA — invitado o sesión distinta usa el uuid como token.
  // DEPENDENCIA-02: /checkout/success debe aceptar acceso sin sesión con ?orderId={uuid}.
  const guestOrderHref = orderUuid?.trim()
    ? `${base}/checkout/success?orderId=${encodeURIComponent(orderUuid.trim())}`
    : null;

  return (
    <MundoTechShell
      preview={
        casheaInitial
          ? 'Inicial de Cashea confirmada — estamos preparando tu pedido.'
          : 'Pago confirmado — estamos preparando tu pedido.'
      }
      title={casheaInitial ? 'Inicial confirmada — MundoTech' : 'Pago confirmado — MundoTech'}
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <StatusPill tone="success">{casheaInitial ? 'Inicial confirmada' : 'Pago confirmado'}</StatusPill>
        <Text style={{ margin: '0 0 8px', fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 14px', fontSize: 18, lineHeight: 1.45, color: MT.success, fontWeight: 700 }}>
          {casheaInitial ? '¡Listo! Tu inicial con Cashea está verificada' : '¡Listo! Tu pago está verificado'}
        </Text>
        <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          {casheaInitial ? (
            <>
              Confirmamos el pago de la inicial con Cashea del pedido{' '}
              <strong style={{ color: MT.textPrimary }}>#{orderDisplayId}</strong>. Ya
              lo estamos preparando en la tienda; en el próximo correo te llega la
              guía de envío o el aviso de retiro.
            </>
          ) : (
            <>
              Confirmamos el pago del pedido{' '}
              <strong style={{ color: MT.textPrimary }}>#{orderDisplayId}</strong>. Ya
              lo estamos preparando en la tienda; en el próximo correo te llega la
              guía de envío o el aviso de retiro.
            </>
          )}
        </Text>
      </Section>

      <PrimaryCta href={ordersPath} label="Ver detalles del pedido" />

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
