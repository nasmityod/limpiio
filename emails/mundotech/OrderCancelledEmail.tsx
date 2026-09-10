import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { StatusPill } from './components/StatusPill';
import { MundoTechShell } from './MundoTechShell';
import { emailSiteBaseUrl, emailStorePhones } from './site';
import { MT, fontSans } from './theme';

type Props = {
  customerName: string;
  /** Número de pedido formateado (ej. "0042"). */
  orderDisplayId: string;
  /** Si viene definido, el correo explica que la cancelación fue automática por expiración. */
  expiredAfterHours?: number;
};

export function OrderCancelledEmail({ customerName, orderDisplayId, expiredAfterHours }: Props) {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  const ordersPath = `${base}/account/orders`;
  const isExpired = typeof expiredAfterHours === 'number';

  return (
    <MundoTechShell
      preview={
        isExpired
          ? `Tu pedido #${orderDisplayId} fue cancelado después de ${expiredAfterHours} horas pendiente.`
          : 'Tu pedido fue cancelado.'
      }
      title="Pedido cancelado — MundoTech"
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
        <StatusPill tone="neutral">Cancelado</StatusPill>
        <Text style={{ margin: '0 0 8px', fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text
          style={{
            margin: '0 0 14px',
            fontSize: 18,
            lineHeight: 1.45,
            color: MT.danger,
            fontWeight: 700,
          }}
        >
          Tu pedido #{orderDisplayId} fue cancelado
        </Text>
        {isExpired ? (
          <Text style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
            El pedido permaneció pendiente durante {expiredAfterHours} horas y fue cancelado
            automáticamente para liberar la reserva.
          </Text>
        ) : null}
        <Text style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          La reserva del pedido fue liberada. Si se había descontado inventario o aplicado un
          cupón, esos movimientos fueron revertidos.
        </Text>
        <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          ¿Tienes preguntas o crees que es un error? Responde a este correo o
          escríbenos por WhatsApp al {emailStorePhones()} y lo revisamos. Puedes
          realizar un pedido nuevo cuando quieras.
        </Text>
      </Section>

      <PrimaryCta href={ordersPath} label="Ver mis pedidos" />

      <Section style={{ padding: '0 24px 28px', fontFamily: fontSans }} />
    </MundoTechShell>
  );
}
