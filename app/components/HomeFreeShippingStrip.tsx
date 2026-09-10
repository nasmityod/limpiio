import { Truck } from 'lucide-react';

interface HomeFreeShippingStripProps {
  text: string;
  /** Texto de apoyo fijo — no editable. */
  supportText?: string;
}

/**
 * Franja exclusiva del inicio para comunicar envío gratis MRW.
 * No sticky, no cerrable, no enlace. Después de Benefits, antes de estanterías.
 */
export default function HomeFreeShippingStrip({
  text,
  supportText = 'Disponible en productos identificados con este beneficio.',
}: HomeFreeShippingStripProps) {
  const main = text.trim() || 'Envío gratis por MRW';

  return (
    <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full mt-4 sm:mt-5">
      <div
        className="flex items-center gap-3 border-y border-[#E6C200]/70 bg-[#FFF8D1] px-4 py-3 sm:rounded-2xl sm:border sm:px-5 sm:py-3.5 sm:shadow-soft"
        role="status"
      >
        <span
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[#E6C200]/80 bg-[#FFD700]/40 text-navy"
          aria-hidden="true"
        >
          <Truck size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] sm:text-sm font-bold text-navy leading-snug">
            {main}
          </p>
          <p className="mt-0.5 text-[11px] sm:text-[12px] font-medium text-navy/75 leading-snug">
            {supportText}
          </p>
        </div>
      </div>
    </div>
  );
}
