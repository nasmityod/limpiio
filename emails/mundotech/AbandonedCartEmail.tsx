import { Column, Img, Link, Row, Section, Text } from '@react-email/components';
import * as React from 'react';
import type { AbandonedCartItem } from '@/lib/definitions';
import { MundoTechShell } from './MundoTechShell';
import { PrimaryCta } from './components/PrimaryCta';
import { MT, fontSans } from './theme';
import { emailSiteBaseUrl } from './site';

export interface AbandonedCartEmailProps {
  customerName:   string;
  items:          AbandonedCartItem[];
  totalUsd:       number;
  recoveryUrl:    string;
  unsubscribeUrl: string;
  /** MEJORA 1.3: cupón de un solo uso — solo en el segundo toque (72 h). */
  coupon?: { code: string; discountLabel: string; expiryDays: number };
}

const cardTableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  border:          `1px solid ${MT.border}`,
  borderRadius:    14,
  backgroundColor: MT.cardBgAlt,
  width:           '100%',
};

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('es-VE', {
    style:    'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function AbandonedCartEmail({
  customerName,
  items,
  totalUsd,
  recoveryUrl,
  unsubscribeUrl,
  coupon,
}: AbandonedCartEmailProps) {
  const base      = emailSiteBaseUrl().replace(/\/$/, '');
  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const label     = itemCount === 1 ? '1 artículo' : `${itemCount} artículos`;

  return (
    <MundoTechShell
      preview={`¿Olvidaste algo? Tienes ${label} esperándote en MundoTech.`}
      title="MundoTech · Tienes artículos en tu carrito"
      heroCustomerName={customerName}
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <Section style={{ padding: '20px 24px 12px', fontFamily: fontSans }}>
        <Text
          style={{
            margin:     '0 0 6px',
            fontSize:   22,
            fontWeight: 700,
            lineHeight: 1.25,
            color:      MT.textPrimary,
          }}
        >
          ¡Hola, {customerName}!
        </Text>
        <Text style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.6, color: MT.textMuted }}>
          Dejaste {label} en tu carrito y te lo guardamos tal cual. Si tenías
          alguna duda con el producto o el pago, responde a este correo y te
          ayudamos a cerrarla.
        </Text>
      </Section>

      {/* ── Cupón de recuperación (solo segundo toque) ─────────────────────── */}
      {coupon ? (
        <Section style={{ padding: '0 24px 12px', fontFamily: fontSans }}>
          <table
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            style={{
              borderCollapse: 'separate',
              backgroundColor: 'rgba(255, 215, 0, 0.12)',
              border: '2px dashed #e6c200',
              borderRadius: 14,
            }}
          >
            <tbody>
              <tr>
                <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                  <Text style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: MT.textPrimary }}>
                    Para que vuelvas: {coupon.discountLabel}
                  </Text>
                  <Text
                    style={{
                      margin: '0 0 4px',
                      fontSize: 22,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      color: MT.navy,
                      fontFamily: 'monospace',
                    }}
                  >
                    {coupon.code}
                  </Text>
                  <Text style={{ margin: 0, fontSize: 12, color: MT.textMuted }}>
                    Un solo uso · aplícalo al revisar tu pedido · vence en {coupon.expiryDays} días
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      ) : null}

      {/* ── Lista de productos ────────────────────────────────────────────── */}
      <Section style={{ padding: '4px 24px 8px', fontFamily: fontSans }}>
        {items.map((item, idx) => {
          const productUrl = `${base}/product/${encodeURIComponent(item.slug ?? item.id)}`;
          const imgSrc     = item.image ?? null;
          const lineTotal  = item.price * item.quantity;

          return (
            <Section
              key={`${item.id}-${idx}`}
              style={{ marginBottom: idx < items.length - 1 ? 12 : 0 }}
            >
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                style={cardTableStyle}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: 14 }}>
                      <Row>
                        <Column style={{ width: 76, verticalAlign: 'top' }}>
                          {imgSrc ? (
                            <Img
                              alt={item.name}
                              src={imgSrc}
                              width={60}
                              height={60}
                              style={{
                                display:         'block',
                                borderRadius:    10,
                                width:           60,
                                height:          60,
                                border:          `1px solid ${MT.border}`,
                                backgroundColor: MT.cardBg,
                                padding:         4,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width:           60,
                                height:          60,
                                borderRadius:    10,
                                backgroundColor: MT.cardBg,
                                border:          `1px solid ${MT.border}`,
                              }}
                            />
                          )}
                        </Column>
                        <Column style={{ verticalAlign: 'top', paddingLeft: 4 }}>
                          <Link
                            href={productUrl}
                            style={{
                              fontSize:       15,
                              fontWeight:     700,
                              color:          MT.textPrimary,
                              textDecoration: 'underline',
                              textDecorationColor: MT.gold,
                              lineHeight:     1.35,
                            }}
                          >
                            {item.name}
                          </Link>
                          <Text
                            style={{ margin: '8px 0 2px', fontSize: 13, color: MT.textMuted }}
                          >
                            Cantidad:{' '}
                            <span style={{ color: MT.textPrimary, fontWeight: 700 }}>
                              {item.quantity}
                            </span>
                            {' · '}
                            Precio unitario:{' '}
                            <span style={{ color: MT.textPrimary, fontWeight: 700 }}>
                              {formatUsd(item.price)}
                            </span>
                          </Text>
                          <Text style={{ margin: 0, fontSize: 14, color: MT.textPrimary, fontWeight: 700 }}>
                            {formatUsd(lineTotal)}
                          </Text>
                        </Column>
                      </Row>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>
          );
        })}
      </Section>

      {/* ── Total ─────────────────────────────────────────────────────────── */}
      <Section style={{ padding: '10px 24px 6px', fontFamily: fontSans }}>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={cardTableStyle}
        >
          <tbody>
            <tr>
              <td style={{ padding: '14px 18px' }}>
                <Row>
                  <Column>
                    <Text
                      style={{ margin: 0, fontSize: 15, fontWeight: 700, color: MT.textPrimary }}
                    >
                      Total estimado
                    </Text>
                    <Text style={{ margin: '2px 0 0', fontSize: 12, color: MT.textMuted }}>
                      El total final puede variar si aplicas un cupón de descuento.
                    </Text>
                  </Column>
                  <Column style={{ textAlign: 'right' }} align="right">
                    <Text
                      style={{
                        margin:     0,
                        fontSize:   20,
                        fontWeight: 700,
                        color:      MT.textPrimary,
                      }}
                    >
                      {formatUsd(totalUsd)}
                    </Text>
                  </Column>
                </Row>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ── Urgencia sutil ────────────────────────────────────────────────── */}
      <Section style={{ padding: '10px 24px 4px', fontFamily: fontSans, textAlign: 'center' }}>
        <Text style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: MT.textMuted }}>
          El stock de la tienda rota rápido entre el mostrador y la web.{' '}
          <span style={{ color: MT.textPrimary, fontWeight: 600 }}>
            Si lo quieres, asegúralo hoy.
          </span>
        </Text>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <PrimaryCta href={recoveryUrl} label="Completar mi compra" fullWidth />

      {/* ── Opt-out ──────────────────────────────────────────────────────── */}
      <Section style={{ padding: '8px 24px 24px', fontFamily: fontSans, textAlign: 'center' }}>
        <Text style={{ margin: 0, fontSize: 11, color: MT.textMuted }}>
          No quieres recibir recordatorios de carrito.{' '}
          <Link
            href={unsubscribeUrl}
            style={{ color: MT.textMuted, textDecoration: 'underline' }}
          >
            Cancelar suscripción
          </Link>
        </Text>
      </Section>
    </MundoTechShell>
  );
}
