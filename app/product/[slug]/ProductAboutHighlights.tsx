import { Check } from 'lucide-react';
import type { ProductSpec } from '@/lib/definitions';

interface Props {
  specs: ProductSpec[];
}

export default function ProductAboutHighlights({ specs }: Props) {
  const bullets = specs.slice(0, 6).map((s) => `${s.name}: ${s.value}`);

  if (bullets.length === 0) return null;

  return (
    <section className="mb-8 sm:mb-10" aria-labelledby="about-product-heading">
      <h2 id="about-product-heading" className="text-[1.15rem] sm:text-xl font-bold text-navy tracking-tight mb-3 sm:mb-4">
        Acerca de este producto
      </h2>
      <ul className="space-y-2.5">
        {bullets.map((text, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[14px] sm:text-[15px] text-slate-600 leading-snug">
            <Check size={16} className="shrink-0 mt-0.5 text-brand-yellow fill-brand-yellow/20" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
