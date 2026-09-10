// PERF-03: Server Component — islas client: ProductCard y TrackViewItemList.
import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import TrackViewItemList from '@/app/components/TrackViewItemList';
import { firstCardImage } from '@/lib/product-media';
import { slugify } from '@/lib/slugify';

interface ShelfProduct {
  id: string;
  slug?: string | null;
  name: string;
  price: number;
  originalPrice?: number | null;
  images: string[];
  category: string;
  brand?: string | null;
  stock: number;
  freeShipping: boolean;
}

interface ProductShelfProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: 'yellow' | 'blue' | 'red' | 'green';
  products: ShelfProduct[];
  viewAllHref?: string;
  viewAllLabel?: string;
  /** Label corto en móvil (default: "Ver todos"). */
  viewAllShortLabel?: string;
  featured?: boolean;
  theme?: 'light' | 'dark';
  maxItems?: number;
  priorityFirstItems?: number;
  /** Identificador estable de lista GA4 (default: slugify(title)). */
  listId?: string;
}

const BADGE_COLORS: Record<string, string> = {
  yellow: 'bg-brand-yellow text-navy',
  red: 'bg-rose-600 text-white',
  blue: 'bg-navy text-white',
  green: 'bg-emerald-500 text-white',
};

function toCardProduct(p: ShelfProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    originalPrice: p.originalPrice ?? null,
    description: '',
    image: firstCardImage(p.images),
    images: p.images,
    category: p.category,
    brand: p.brand ?? null,
    stock: p.stock,
    details: {},
    freeShipping: p.freeShipping,
  };
}

const ProductShelf = ({
  title,
  subtitle,
  badge,
  badgeColor = 'yellow',
  products,
  viewAllHref = '/productos',
  viewAllLabel = 'Ver todo',
  viewAllShortLabel = 'Ver todos',
  theme = 'light',
  maxItems = 8,
  priorityFirstItems = 0,
  listId,
}: ProductShelfProps) => {
  if (products.length === 0) return null;

  const cap = Math.min(Math.max(1, maxItems), 18);
  const slice = products.slice(0, cap);
  const isDark = theme === 'dark';
  const analyticsListId = listId || slugify(title);

  return (
    <section
      className="py-5 sm:py-8 w-full max-w-full overflow-x-hidden"
      data-testid="product-shelf"
    >
      <TrackViewItemList
        listId={analyticsListId}
        listName={title}
        items={slice.map((p) => ({
          item_id: p.id,
          item_name: p.name,
          item_category: p.category,
          ...(p.brand ? { item_brand: p.brand } : {}),
          price: p.price,
          quantity: 1,
        }))}
      />

      <div className="flex items-end justify-between gap-3 mb-3 sm:mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {badge ? (
              <span
                className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${BADGE_COLORS[badgeColor]}`}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <h2
            className={`text-[1.05rem] sm:text-xl font-bold tracking-tight leading-tight line-clamp-2 ${
              isDark ? 'text-white' : 'text-navy'
            }`}
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              className={`text-[12px] sm:text-[13px] mt-0.5 leading-snug hidden sm:block ${
                isDark ? 'text-white/55' : 'text-on-light'
              }`}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        <Link
          href={viewAllHref}
          className={`inline-flex items-center gap-1 text-[12px] sm:text-[13px] font-semibold whitespace-nowrap min-h-[44px] min-w-[44px] px-1 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 rounded-lg ${
            isDark
              ? 'text-[#FFD700] hover:text-[#FFE03A]'
              : 'text-navy hover:text-brand-yellow'
          }`}
        >
          <span className="sm:hidden">{viewAllShortLabel}</span>
          <span className="hidden sm:inline">{viewAllLabel}</span>
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </div>

      {/*
        PERF-2026-08 — Render único.
        Antes existían TRES subárboles simultáneos (carrusel móvil + grid tablet
        + grid desktop) y dos se ocultaban por CSS: 37 productos generaban 114
        ProductCard montados (3,08×), de los cuales 76 nunca eran visibles pero
        sí se hidrataban. Ahora la colección se recorre UNA sola vez y los
        breakpoints se resuelven con CSS (flex+snap en móvil → grid en sm+),
        conservando exactamente el mismo aspecto y comportamiento.
      */}
      <div className="-mx-4 sm:mx-0">
        <div
          className="flex gap-3 overflow-x-auto overscroll-x-contain touch-[pan-x_pan-y] scrollbar-hide snap-x snap-mandatory scroll-px-4 px-4 pb-2
                     sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-x-visible sm:snap-none sm:px-0 sm:pb-0
                     md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          data-testid="product-shelf-carousel"
        >
          {slice.map((product, index) => (
            <div
              key={product.id}
              className="flex-shrink-0 w-[44vw] min-w-[150px] max-w-[178px] snap-start
                         sm:w-auto sm:min-w-0 sm:max-w-none sm:flex-shrink"
              data-testid="product-card"
              data-product-id={product.id}
            >
              <ProductCard
                product={toCardProduct(product)}
                priority={index < priorityFirstItems}
                analyticsListId={analyticsListId}
                analyticsListName={title}
                analyticsIndex={index}
              />
            </div>
          ))}
          {/* Tarjeta final "Ver todo": solo existe en el carrusel móvil. */}
          <Link
            href={viewAllHref}
            className={`flex-shrink-0 w-[72px] snap-start flex flex-col items-center justify-center gap-2 rounded-2xl border text-[11px] font-semibold min-h-[140px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 sm:hidden ${
              isDark
                ? 'border-white/15 bg-[#151515] text-white'
                : 'border-slate-200 bg-white text-navy shadow-sm'
            }`}
          >
            <ArrowRight size={18} aria-hidden="true" />
            Ver todo
          </Link>
        </div>
      </div>

    </section>
  );
};

export default ProductShelf;
