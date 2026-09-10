import { Truck, ShieldCheck, Headset, CreditCard } from 'lucide-react';

export interface BenefitItem {
  title: string;
  sub:   string;
}

const ICON_LIST = [Truck, ShieldCheck, Headset, CreditCard];

/**
 * Barra de beneficios de la home — solo presentación (R1).
 * Los ítems llegan SIEMPRE del Server Component padre: o la config del admin
 * (homepage_benefits) o el fallback construido desde site-content + settings
 * (PRD-113/PRD-258: aquí no viven teléfonos ni claims hardcodeados).
 */
const Benefits = ({ items }: { items: BenefitItem[] }) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="hidden lg:block bg-surface-muted border-b border-border">
      <div className="grid grid-cols-4 divide-x divide-slate-100">
        {items.map((item, i) => {
          const Icon = ICON_LIST[i % ICON_LIST.length];
          return (
            <div key={i} className="flex items-center gap-3 px-6 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellowSft text-navy flex-shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]">
                <Icon size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-navy tracking-tight leading-tight">{item.title}</p>
                <p className="text-[11px] text-on-light mt-0.5 leading-snug">{item.sub}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Benefits;
