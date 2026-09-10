import { Text } from '@react-email/components';
import * as React from 'react';
import { roundMoney2 } from '@/lib/exchange-rate';
import { formatEmailBs, formatEmailUsd } from '../format-money';
import { MT, fontSans } from '../theme';

type Props = {
  amountUsd: number;
  exchangeRateUsdBs: number | null | undefined;
  bold?: boolean;
  fontSize?: number;
  /**
   * PRD-202: monto Bs congelado del pedido. Cuando está presente se usa
   * directamente (sin recalcular amountUsd × tasa) para evitar deriva de
   * redondeo entre el total almacenado y el mostrado en el email.
   */
  amountBs?: number;
};

/** Una sola línea tipo mockup: USD … | Bs.S … */
export function DualMoneyInline({ amountUsd, exchangeRateUsdBs, bold, fontSize = 14, amountBs }: Props) {
  const rate =
    exchangeRateUsdBs != null && exchangeRateUsdBs > 0 ? exchangeRateUsdBs : null;
  const usd = formatEmailUsd(amountUsd);
  // PRD-202: si se recibe el Bs congelado, úsalo directamente.
  const resolvedBs = amountBs != null ? formatEmailBs(amountBs) : (rate != null ? formatEmailBs(roundMoney2(amountUsd * rate)) : null);
  if (resolvedBs == null) {
    return (
      <Text
        style={{
          margin: 0,
          fontFamily: fontSans,
          fontWeight: bold ? 700 : 600,
          fontSize,
          color: MT.textPrimary,
        }}
      >
        {usd}
      </Text>
    );
  }
  return (
    <Text
      style={{
        margin: 0,
        fontFamily: fontSans,
        fontWeight: bold ? 700 : 600,
        fontSize,
        color: MT.textPrimary,
      }}
    >
      {usd}
      <span style={{ color: MT.textMuted, fontWeight: bold ? 700 : 400 }}>{' | '}</span>
      <span style={{ color: bold ? MT.textPrimary : MT.textMuted }}>{resolvedBs}</span>
    </Text>
  );
}
