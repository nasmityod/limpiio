import { Wallet, Banknote, Bitcoin, DollarSign, Send, CreditCard, type LucideIcon } from 'lucide-react';
import { readSeoLocal } from '@/lib/seo-local';

interface PaymentChip {
  label: string;
  icon: LucideIcon;
}

/*
 * Respaldo cuando `seo.paymentAccepted` viene vacío. La lista REAL que se muestra
 * la controla el admin en /admin/settings/seo-local — este componente nunca la
 * inventa. Zelle y Cashea se soportan aquí y en `mapPaymentLabel` para que, en
 * cuanto el admin los añada, rendericen con el mismo diseño de chip.
 */
const STATIC_METHODS: PaymentChip[] = [
  { label: 'Pago Móvil', icon: Wallet },
  { label: 'Zelle', icon: Send },
  { label: 'Binance', icon: Bitcoin },
  { label: 'Cashea', icon: CreditCard },
  { label: 'Transferencia', icon: Banknote },
  { label: 'Efectivo USD/Bs', icon: DollarSign },
];

function mapPaymentLabel(raw: string): PaymentChip | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('pago') && (v.includes('móvil') || v.includes('movil'))) {
    return { label: 'Pago Móvil', icon: Wallet };
  }
  if (v.includes('transfer')) {
    return { label: 'Transferencia', icon: Banknote };
  }
  if (v.includes('binance')) {
    return { label: 'Binance', icon: Bitcoin };
  }
  if (v.includes('zelle')) {
    return { label: 'Zelle', icon: Send };
  }
  if (v.includes('cashea')) {
    return { label: 'Cashea', icon: CreditCard };
  }
  if (v === 'cash' || v.includes('efectivo')) {
    return { label: 'Efectivo USD/Bs', icon: DollarSign };
  }
  return { label: raw.trim(), icon: Wallet };
}

export default async function PaymentMethods() {
  let methods = STATIC_METHODS;

  try {
    const seo = await readSeoLocal();
    const mapped = seo.paymentAccepted
      .map(mapPaymentLabel)
      .filter((m): m is PaymentChip => m !== null);
    if (mapped.length > 0) methods = mapped;
  } catch {
    // fallback estático
  }

  return (
    <div className="mt-4 sm:mt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-on-light mb-2">
        Pagas como quieras
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Métodos de pago aceptados">
        {methods.map(({ label, icon: Icon }) => (
          <li key={label}>
            <span className="inline-flex items-center gap-1 bg-surface-muted border border-border rounded-full px-2.5 py-1 text-[11px] text-on-light">
              <Icon size={12} className="shrink-0 text-navy/70" aria-hidden />
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
