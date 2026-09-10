import * as React from 'react';
import { MT, fontSans } from '../theme';

type Tone = 'neutral' | 'success';

/**
 * Badge de estado compatible con Outlook: usa <table><td> en lugar de
 * <span display:inline-block> (Outlook no renderiza fondo/borde en spans).
 * Border-radius se ignora en Outlook (queda cuadrado pero legible).
 */
export function StatusPill({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  const bg =
    tone === 'success' ? 'rgba(31, 157, 91, 0.10)' : '#EEF1F6';
  const fg = tone === 'success' ? MT.success : MT.textMuted;

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{ borderCollapse: 'collapse', marginBottom: 16 }}
    >
      <tbody>
        <tr>
          <td
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: fontSans,
              color: fg,
              backgroundColor: bg,
              borderRadius: 999,
              border: `1px solid ${MT.border}`,
              lineHeight: 1.4,
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
