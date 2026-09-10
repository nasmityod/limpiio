import { Text } from '@react-email/components';
import * as React from 'react';
import { roundMoney2 } from '@/lib/exchange-rate';
import { formatEmailBs, formatEmailUsd } from '../format-money';
import { MT, fontSans } from '../theme';

type Props = {
  amountUsd: number;
  exchangeRateUsdBs: number | null | undefined;
  emphasize?: boolean;
};

/** Siempre USD visible; Bs.S cuando el pedido incluye `exchangeRateUsdBs`. */
export function DualMoneyBlock({ amountUsd, exchangeRateUsdBs, emphasize }: Props) {
  const usdLine = formatEmailUsd(amountUsd);
  const rate =
    exchangeRateUsdBs != null && exchangeRateUsdBs > 0 ? exchangeRateUsdBs : null;

  return (
    <>
      <Text
        style={{
          margin: 0,
          fontFamily: fontSans,
          fontWeight: emphasize ? 700 : 600,
          fontSize: emphasize ? 17 : 14,
          color: emphasize ? MT.textPrimary : MT.textPrimary,
          lineHeight: 1.35,
        }}
      >
        {usdLine}
      </Text>
      {rate != null ? (
        <Text
          style={{
            margin: '4px 0 0',
            fontFamily: fontSans,
            fontSize: emphasize ? 15 : 13,
            fontWeight: emphasize ? 600 : 400,
            color: MT.textMuted,
            lineHeight: 1.35,
          }}
        >
          {formatEmailBs(roundMoney2(amountUsd * rate))}
        </Text>
      ) : null}
    </>
  );
}
