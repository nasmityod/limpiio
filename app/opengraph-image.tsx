import { ImageResponse } from 'next/og';

/**
 * Imagen Open Graph de marca, generada en runtime con next/og.
 * Sustituye al inexistente /og-default.jpg (las previews en WhatsApp,
 * Instagram y Google devolvían 404). Reproduce el letrero de la tienda:
 * navy + amarillo + CONECTADOS CONTIGO.
 */
export const runtime = 'edge';
export const alt = 'MundoTech — Conectados Contigo · Tecnología en Barquisimeto, Venezuela';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0B1220',
          backgroundImage:
            'linear-gradient(rgba(255,215,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.06) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            fontSize: 110,
            fontWeight: 800,
            letterSpacing: '-0.03em',
          }}
        >
          <span style={{ color: '#FFFFFF' }}>Mundo</span>
          <span style={{ color: '#FFD700' }}>Tech</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 18,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: '0.32em',
            color: '#FFD700',
            textTransform: 'uppercase',
          }}
        >
          Conectados Contigo
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 42,
            padding: '14px 34px',
            borderRadius: 14,
            border: '2px solid rgba(255,215,0,0.45)',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 26,
          }}
        >
          Tecnología y variedades · Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: 14,
            display: 'flex',
            backgroundColor: '#FFD700',
          }}
        />
      </div>
    ),
    size,
  );
}
