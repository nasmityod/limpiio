'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Zap, ArrowRight, ChevronRight } from 'lucide-react';

interface FlashProduct {
  id:            string;
  slug?:         string | null;
  name:          string;
  price:         number;
  originalPrice?: number | null;
  images:        string[];
  category:      string;
  brand?:        string | null;
  stock:         number;
}

interface Props {
  products: FlashProduct[];
  title?:   string;
  endHour?: number;
}

// PRD-189: la oferta "termina" a una hora de Venezuela (America/Caracas, UTC-4),
// no a la hora local del visitante. Calcula los segundos restantes proyectando
// el reloj del dispositivo a la zona horaria de la tienda.
function getSecondsLeftVet(targetHour: number): number {
  const now = new Date();
  let vetNow: Date;
  try {
    vetNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  } catch {
    // Entornos sin datos ICU completos: VET es UTC-4 fija (sin horario de verano).
    vetNow = new Date(now.getTime() + (now.getTimezoneOffset() - 240) * 60_000);
  }
  const end = new Date(vetNow);
  end.setHours(targetHour, 0, 0, 0);
  if (end <= vetNow) end.setDate(end.getDate() + 1);
  return Math.max(0, Math.floor((end.getTime() - vetNow.getTime()) / 1000));
}

function useCountdown(targetHour: number) {
  // null hasta después del mount: servidor y primer paint del cliente muestran 00:00:00
  // y evitan hydration mismatch (Date difiere entre SSR y hidratación).
  const [secs, setSecs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setSecs(getSecondsLeftVet(targetHour));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetHour]);

  const safe = secs ?? 0;
  const h = String(Math.floor(safe / 3600)).padStart(2, '0');
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return { h, m, s };
}

function DiscountBadge({ pct }: { pct: number }) {
  return (
    <span className="absolute left-2 top-2 z-10 rounded-full border border-[#E6C200] bg-brand-yellow px-2 py-0.5 text-[10px] font-bold text-navy transition-all duration-300 hover:scale-105 hover:ring-2 hover:ring-[#FFE566]/80">
      -{pct}%
    </span>
  );
}

function FlashCard({ product }: { product: FlashProduct }) {
  // PRD-EXTRA-SEO-1: patrón `slug ?? id` como en el resto del sitio — antes un
  // producto sin slug enlazaba al catálogo en vez de a su propia ficha.
  const href     = `/product/${product.slug ?? product.id}`;
  const img      = product.images[0] || '/placeholder-product.png';
  const pct      = product.originalPrice
    ? Math.round((1 - product.price / product.originalPrice) * 100)
    : 0;
  const stockPct = Math.min(100, Math.max(8, (product.stock / 20) * 100));

  return (
    <Link
      href={href}
      className="group flex w-[min(44vw,168px)] flex-shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg sm:w-[160px]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-slate-50">
        {pct > 0 && <DiscountBadge pct={pct} />}
        <Image
          src={img}
          alt={product.name}
          fill
          sizes="(max-width:640px) 44vw, 160px"
          quality={80}
          className="object-contain p-2.5 transition-transform duration-300 drop-shadow-[0_6px_20px_rgba(11,18,32,0.1)] group-hover:scale-105 sm:p-4"
        />
      </div>
      <div className="flex flex-1 flex-col p-2 sm:p-2.5">
        <p className="truncate text-[11px] text-on-light sm:text-[12px]">{product.brand || product.category}</p>
        <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-snug text-[#0f172a] sm:text-[13px]">
          {product.name}
        </p>
        <p className="mt-1.5 text-[14px] font-bold text-price-on-light nums sm:text-[15px]">
          ${product.price.toLocaleString()}
        </p>
        {product.originalPrice && (
          <p className="text-[10px] text-on-light line-through nums sm:text-[11px]">
            ${product.originalPrice.toLocaleString()}
          </p>
        )}
        <div className="mt-auto pt-2">
          <div className="h-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500 transition-all"
              style={{ width: `${stockPct}%` }}
            />
          </div>
          <p className="mt-1 text-[9px] font-medium text-on-light sm:text-[10px]">
            {product.stock < 5 ? `¡Solo ${product.stock} en stock!` : 'En inventario'}
          </p>
        </div>
      </div>
    </Link>
  );
}

const FlashDeals = ({ products, title = 'Ofertas MundoTech', endHour = 23 }: Props) => {
  const { h, m, s } = useCountdown(endHour);
  if (products.length === 0) return null;

  return (
    <section className="w-full max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0B] sm:rounded-2xl">
      {/* Header — en móvil: fila título + enlace; cuenta atrás debajo en ancho completo */}
      <div className="flex flex-col gap-3 border-b border-white/10 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-3">
          <div className="flex min-w-0 items-center gap-1 rounded-full border border-[#E6C200]/50 bg-brand-yellow px-2.5 py-1.5 text-[11px] font-bold text-navy sm:px-3 sm:text-[13px]">
            <Zap size={12} className="flex-shrink-0" fill="currentColor" aria-hidden />
            <span className="hidden truncate xs:inline">{title}</span>
            <span className="truncate xs:hidden">Ofertas</span>
          </div>
          <Link
            href="/productos"
            className="flex min-h-[44px] flex-shrink-0 items-center gap-0.5 text-[11px] font-semibold text-brand-yellow sm:hidden"
          >
            Ver todas
            <ChevronRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="flex items-center justify-center gap-3 sm:ml-auto sm:flex-1 sm:justify-end">
          <div className="flex items-center justify-center gap-1 sm:justify-start">
            <span className="mr-1 hidden flex-shrink-0 text-[11px] text-white/60 sm:inline">
              Termina en
            </span>
            <div className="flex items-center gap-0.5 sm:gap-1">
              {[h, m, s].map((val, i) => (
                <span key={i} className="flex items-center gap-0.5 sm:gap-1">
                  <span className="w-7 rounded-md bg-white/15 py-1.5 text-center text-[11px] font-bold tabular-nums text-white sm:w-9 sm:bg-white/10 sm:py-1 sm:text-[13px]">
                    {val}
                  </span>
                  {i < 2 && (
                    <span className="text-xs font-bold text-white/50 sm:text-sm">:</span>
                  )}
                </span>
              ))}
            </div>
          </div>
          <Link
            href="/productos"
            className="hidden min-h-[44px] items-center gap-1 text-[12px] font-semibold text-brand-yellow sm:inline-flex"
          >
            Ver todas
            <ChevronRight size={14} aria-hidden />
          </Link>
        </div>
      </div>

      {/* Cards scroll */}
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain px-3 py-4 scrollbar-hide sm:gap-3 sm:px-6 sm:py-5">
        {products.map((p) => (
          <div key={p.id} className="flex-shrink-0 snap-start">
            <FlashCard product={p} />
          </div>
        ))}
        <Link
          href="/productos"
          className="flex w-[min(32vw,100px)] flex-shrink-0 snap-start flex-col items-center justify-center gap-2 self-stretch rounded-xl border border-white/15 bg-white/5 text-center text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/10 active:bg-white/15 sm:w-[120px] sm:text-[12px]"
        >
          <ArrowRight size={20} className="text-brand-yellow" aria-hidden />
          Ver más ofertas
        </Link>
      </div>
    </section>
  );
};

export default FlashDeals;
