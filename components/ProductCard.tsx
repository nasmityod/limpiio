'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, Heart, Check, Truck } from 'lucide-react';
import { useCartActions } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useState } from 'react';
import type { Product } from '../context/ProductContext';
import { useExchangeRate } from '../context/ExchangeRateContext';
import { Stars } from '@/components/reviews/Stars';
import { isGenericBrand } from '@/lib/utils';
import { track, toGa4Item, GA4_CURRENCY } from '@/lib/ga4';

function formatUSD(amount: number): string {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function formatBs(amount: number, rate: number): string {
  const bs = amount * rate;
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bs)}`;
}

type ProductCardProps = {
  product: Product;
  priority?: boolean;
  analyticsListId?: string;
  analyticsListName?: string;
  analyticsIndex?: number;
};

/**
 * PRD-114: stretched link en el título. Wishlist / carrito fuera del enlace.
 */
const ProductCard = ({
  product,
  priority = false,
  analyticsListId,
  analyticsListName,
  analyticsIndex,
}: ProductCardProps) => {
  // PERF-2026-08: solo acciones (identidad estable). Consumir `useCart()`
  // aquí re-renderizaba las ~38 tarjetas en cada cambio de estado del carrito.
  const { addToCart } = useCartActions();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { rate, stale } = useExchangeRate();
  const [justAdded, setJustAdded] = useState(false);

  const isFav = isInWishlist(product.id);
  const isOut = product.stock === 0;
  const isLowStock = !isOut && product.stock <= 5;
  const brandLabel = !isGenericBrand(product.brand) ? product.brand : null;
  const showFreeShipping = product.freeShipping === true && !isOut;

  const discountPct =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(
          ((product.originalPrice - product.price) / product.originalPrice) *
            100,
        )
      : null;

  const handleWishlist = () => {
    if (isFav) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product);
    }
  };

  const handleCart = () => {
    if (isOut) return;
    addToCart(product, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  };

  const handleSelectItem = () => {
    const item = {
      ...toGa4Item(product),
      ...(typeof analyticsIndex === 'number'
        ? { index: analyticsIndex }
        : {}),
    };
    track('select_item', {
      currency: GA4_CURRENCY,
      items: [item],
      ...(analyticsListId ? { item_list_id: analyticsListId } : {}),
      ...(analyticsListName ? { item_list_name: analyticsListName } : {}),
    });
  };

  return (
    <div
      className="group block h-full"
      data-testid={`product-card-${product.id}`}
    >
      <div className="card-interactive relative flex h-full flex-col overflow-hidden shadow-soft focus-within:ring-2 focus-within:ring-navy">
        <div className="relative aspect-[4/5] sm:aspect-square overflow-hidden bg-white">
          <Image
            src={product.image}
            alt={product.name}
            fill
            priority={priority}
            fetchPriority={priority ? 'high' : undefined}
            sizes="(max-width: 640px) 44vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 16vw"
            quality={75}
            className="object-contain p-1.5 sm:p-4 lg:p-5 transition-transform duration-500 drop-shadow-[0_4px_12px_rgba(11,18,32,0.08)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />

          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start max-w-[60%]">
            {discountPct ? (
              <span className="rounded-md border border-[#E6C200] bg-[#FFD700] px-2 py-0.5 text-[10px] font-bold text-[#0B0B0B] shadow-soft">
                -{discountPct}%
              </span>
            ) : product.isNew ? (
              <span className="rounded-md border border-white/10 bg-[#0B0B0B] px-2 py-0.5 text-[10px] font-bold text-white shadow-soft">
                Nuevo
              </span>
            ) : null}

            {isLowStock && (
              <span className="bg-white text-[#0f172a] border border-slate-200 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-soft truncate">
                Quedan {product.stock}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleWishlist}
            className="absolute z-10 top-1.5 right-1.5 min-w-[44px] min-h-[44px] rounded-full bg-white/90 backdrop-blur
                       border border-slate-200/70 shadow-soft flex items-center justify-center
                       text-slate-400 hover:text-rose-500 active:text-rose-600 active:scale-95 hover:bg-white transition-all"
            aria-label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <Heart
              size={16}
              aria-hidden="true"
              className={isFav ? 'text-rose-500 fill-rose-500' : ''}
            />
          </button>

          {isOut && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
              <span className="bg-white text-navy text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 shadow-soft">
                Agotado
              </span>
            </div>
          )}
        </div>

        <div className="px-2 pt-1.5 pb-2 sm:p-4 flex flex-col flex-grow gap-0.5 sm:gap-1.5">
          {brandLabel ? (
            <span className="chip-brand w-fit max-w-full truncate">
              {brandLabel}
            </span>
          ) : null}

          <h3 className="text-[12px] sm:text-sm font-semibold text-navy leading-[1.6] line-clamp-2 break-words min-h-[3.2em] flex-shrink-0">
            <Link
              href={`/product/${product.slug ?? product.id}`}
              onClick={handleSelectItem}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 after:absolute after:inset-0 after:z-[1] after:content-[''] after:rounded-2xl"
            >
              {product.name}
            </Link>
          </h3>

          {product.reviewCount && product.reviewCount > 0 ? (
            <div className="flex items-center gap-1 mt-0.5">
              <Stars rating={product.rating ?? 0} size={11} />
              <span className="text-[10px] text-on-light ml-0.5 nums">
                ({product.reviewCount})
              </span>
            </div>
          ) : null}

          <div className="mt-auto pt-1 sm:pt-3">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[1.15rem] sm:text-[1.45rem] font-bold text-navy tracking-tight nums leading-none">
                {formatUSD(product.price)}
              </span>
              {product.originalPrice &&
                product.originalPrice > product.price && (
                  <span className="text-[11px] sm:text-xs text-on-light line-through nums">
                    {formatUSD(product.originalPrice)}
                  </span>
                )}
            </div>
            <p
              className="text-[10px] sm:text-[11px] text-on-light mt-0.5 nums truncate"
              title={
                stale
                  ? 'Referencia en bolívares — se confirma al pagar'
                  : undefined
              }
            >
              {formatBs(product.price, rate)}
              {stale ? (
                <span className="text-on-light"> (ref.)</span>
              ) : null}
            </p>

            {showFreeShipping ? (
              <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md border border-[#E6C200]/60 bg-[#FFF8D1] px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-navy leading-none">
                <Truck
                  size={12}
                  className="flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">Envío gratis MRW</span>
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleCart}
              disabled={isOut}
              className={`relative z-10 mt-1.5 sm:mt-3 w-full inline-flex items-center justify-center gap-0.5 sm:gap-1 min-h-[32px] sm:min-h-[44px] rounded-full
                          text-[10px] sm:text-[13px] font-bold transition-all duration-200 border px-1.5 sm:px-2
                          active:scale-[0.97] motion-reduce:active:scale-100
                          disabled:opacity-50 disabled:cursor-not-allowed
                          ${
                            justAdded
                              ? 'bg-navy text-white border-navy'
                              : 'bg-brand-yellow text-navy border-brand-yellowDk hover:bg-[#FFE03A] active:bg-[#FFD024] shadow-soft hover:shadow-card'
                          }`}
            >
              {justAdded ? (
                <>
                  <Check className="size-3 sm:size-[15px]" aria-hidden="true" />
                  <span className="whitespace-nowrap">¡En el carrito!</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="size-3 sm:size-3.5" aria-hidden="true" />
                  <span className="whitespace-nowrap">
                    {isOut ? 'Agotado' : 'Añadir al carrito'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
