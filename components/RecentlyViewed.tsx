'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Eye } from 'lucide-react';
import { useRecentlyViewed } from '@/lib/useRecentlyViewed';
import { formatCurrency } from '@/lib/utils';

interface Props {
  /** Excluye un id (ej. el producto actual). */
  excludeId?: string;
  /** Cantidad máxima a mostrar. */
  limit?: number;
  /** Variante visual: full (con título) o compact (solo grilla). */
  variant?: 'full' | 'compact';
}

export default function RecentlyViewed({ excludeId, limit = 6, variant = 'full' }: Props) {
  const { items } = useRecentlyViewed();
  const visible = items.filter((i) => i.id !== excludeId).slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-12 w-full max-w-full">
      {variant === 'full' && (
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <Eye size={18} className="text-slate-400" />
          <h2 className="text-[1.3rem] sm:text-2xl md:text-[1.75rem] font-bold tracking-tight text-navy">
            Vistos recientemente
          </h2>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {visible.map((item) => (
          <Link
            key={item.id}
            href={`/product/${item.slug ?? item.id}`}
            className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-soft transition-all duration-300 active:scale-[0.99] hover:-translate-y-0.5 hover:shadow-card"
          >
            <div className="relative aspect-square overflow-hidden bg-white">
              <Image
                src={item.image || '/placeholder-product.png'}
                alt={item.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                className="object-contain p-3 sm:p-4 transition-transform duration-500 drop-shadow-[0_6px_20px_rgba(11,18,32,0.1)] group-hover:scale-105"
              />
            </div>
            <div className="p-2.5 sm:p-3">
              <p className="text-[11px] sm:text-[12px] text-navy line-clamp-2 leading-snug min-h-[2.2rem]">
                {item.name}
              </p>
              <p className="mt-1 sm:mt-1.5 text-[13px] sm:text-sm font-bold text-navy nums">
                {formatCurrency(item.price)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
