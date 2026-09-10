import type { OrderWithPricingMeta } from '@/lib/order-pricing';
import { getOrderDualMoney, hasFrozenBsPricing } from '@/lib/order-pricing';

type Props = {
  amount: number;
  order: OrderWithPricingMeta;
  /** Texto principal más grande (total). */
  emphasis?: 'primary' | 'total';
  align?: 'left' | 'right';
  className?: string;
  /** Colores para tablas admin vs. tienda cuenta. */
  variant?: 'storefront' | 'admin';
};

export function DualOrderMoney({
  amount,
  order,
  emphasis = 'primary',
  align = 'right',
  className = '',
  variant = 'storefront',
}: Props) {
  const d = getOrderDualMoney(amount, order);
  const ves = hasFrozenBsPricing(order);
  const primaryColor = variant === 'admin' ? 'text-gray-900' : 'text-navy';
  const secondaryColor = variant === 'admin' ? 'text-gray-500' : 'text-slate-500';
  const hintColor = variant === 'admin' ? 'text-gray-600' : 'text-slate-600';
  const primaryCls =
    emphasis === 'total'
      ? `text-xl sm:text-2xl font-bold ${primaryColor} nums tracking-tight leading-tight`
      : `text-sm font-semibold ${primaryColor} nums leading-tight`;
  const secondaryCls = `text-[11px] ${secondaryColor} nums leading-tight`;

  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'} ${className}`}>
      {ves ? (
        variant === 'admin' ? (
          <>
            <span className={primaryCls}>{d.usd}</span>
            <span className={secondaryCls}>{d.bs}</span>
          </>
        ) : (
          <>
            <span className={primaryCls}>{d.bs}</span>
            <span className={secondaryCls}>{d.usd}</span>
          </>
        )
      ) : (
        <>
          <span className={primaryCls}>{d.usd}</span>
          <span className={`${secondaryCls} ${hintColor}`}>Sin Bs. registrados (pedido anterior)</span>
        </>
      )}
    </div>
  );
}

export function OrderFrozenRateBanner({ order, variant = 'storefront' }: { order: OrderWithPricingMeta; variant?: 'storefront' | 'admin' }) {
  if (variant !== 'admin' || !hasFrozenBsPricing(order)) return null;
  const wrap = variant === 'admin'
    ? 'text-[11px] text-gray-600 mt-1 px-1'
    : 'text-[11px] sm:text-xs text-slate-500 mt-2 px-5 sm:px-6 border-t border-slate-100/80 pt-2 bg-slate-50/80';
  const label = variant === 'admin' ? 'font-semibold text-gray-700' : 'font-semibold text-slate-600';
  return (
    <p className={wrap}>
      <span className={label}>Tasa al comprar:</span>{' '}
      Bs. {order.exchangeRateUsdBs!.toFixed(2)} / USD
    </p>
  );
}
