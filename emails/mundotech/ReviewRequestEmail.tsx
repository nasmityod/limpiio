import { Section, Text, Img, Link } from '@react-email/components';
import * as React from 'react';
import { PrimaryCta } from './components/PrimaryCta';
import { MundoTechShell } from './MundoTechShell';
import { MT, fontSans } from './theme';

export type ReviewRequestProduct = {
  name: string;
  /** URL absoluta a la ficha con deep-link al formulario de reseña. */
  reviewUrl: string;
  imageUrl?: string | null;
};

type Props = {
  customerName: string;
  products: ReviewRequestProduct[];
};

/**
 * FASE 4.5 (MEJORA 2.2): solicitud de reseña 7 días después de la entrega.
 * Un solo email por pedido, sin incentivo — tono cercano venezolano, fondo
 * claro, coherente con el resto del sistema de correos.
 */
export function ReviewRequestEmail({ customerName, products }: Props) {
  const first = products[0];
  const preview =
    products.length === 1
      ? `¿Qué tal te fue con ${first?.name ?? 'tu compra'}? Tu opinión ayuda a otros clientes.`
      : '¿Qué tal te fue con tu compra? Tu opinión ayuda a otros clientes.';

  return (
    <MundoTechShell
      preview={preview}
      title="¿Cómo te fue con tu compra? — MundoTech"
      heroCustomerName={customerName}
    >
      <Section style={{ padding: '12px 24px 8px', fontFamily: fontSans }}>
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
          Tu opinión vale oro
        </Text>
        <Text style={{ margin: '0 0 8px', fontSize: 16, lineHeight: 1.6, color: MT.textPrimary }}>
          Hola <strong>{customerName}</strong>,
        </Text>
        <Text
          style={{
            margin: '0 0 12px',
            fontSize: 18,
            lineHeight: 1.45,
            color: MT.textPrimary,
            fontWeight: 700,
          }}
        >
          Ya llevas unos días con tu compra — ¿qué tal te ha ido?
        </Text>
        <Text style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: MT.textMuted }}>
          Nos encantaría saber tu experiencia. Una reseña tuya (con foto si te
          animas) ayuda muchísimo a otros clientes de Barquisimeto y de toda
          Venezuela a comprar con confianza. Toma menos de un minuto.
        </Text>
      </Section>

      {/* Productos del pedido con deep-link al formulario de reseña */}
      <Section style={{ padding: '12px 24px 4px', fontFamily: fontSans }}>
        {products.map((p) => (
          <table
            key={p.reviewUrl}
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
              marginBottom: 10,
            }}
          >
            <tbody>
              <tr>
                {p.imageUrl ? (
                  <td width={80} style={{ padding: '14px 0 14px 14px', verticalAlign: 'middle' }}>
                    <Img
                      src={p.imageUrl}
                      width={64}
                      height={64}
                      alt={p.name}
                      style={{ borderRadius: 8, objectFit: 'cover', display: 'block' }}
                    />
                  </td>
                ) : null}
                <td style={{ padding: '14px', verticalAlign: 'middle' }}>
                  <Text
                    style={{
                      margin: '0 0 6px',
                      fontSize: 14,
                      fontWeight: 700,
                      color: MT.textPrimary,
                      lineHeight: 1.4,
                    }}
                  >
                    {p.name}
                  </Text>
                  <Link
                    href={p.reviewUrl}
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: MT.navy,
                      textDecoration: 'underline',
                    }}
                  >
                    Escribir reseña de este producto →
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        ))}
      </Section>

      {first ? <PrimaryCta href={first.reviewUrl} label="Dejar mi reseña" /> : null}

      <Section style={{ padding: '8px 24px 28px', textAlign: 'center', fontFamily: fontSans }}>
        <Text style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: MT.textMuted }}>
          ¿Algo no salió como esperabas? Responde a este correo y lo resolvemos
          — primero tú, después la reseña.
        </Text>
      </Section>
    </MundoTechShell>
  );
}
