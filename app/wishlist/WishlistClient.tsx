'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Heart, ShoppingCart, X, ArrowRight, ChevronRight, Check } from 'lucide-react';
import { useWishlist } from '../../context/WishlistContext';
import { useCartActions } from '../../context/CartContext';
import { formatCurrency } from '@/lib/utils';

const WishlistClient = () => {
  const { wishlist, removeFromWishlist } = useWishlist();
  const { addToCart } = useCartActions();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleAddToCart = (product: (typeof wishlist)[number]) => {
    addToCart(product, 1);
    setAddedIds((prev) => new Set(prev).add(product.id));
    setTimeout(() => {
      setAddedIds((prev) => { const next = new Set(prev); next.delete(product.id); return next; });
    }, 1500);
  };

  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full">
      <nav className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-500 mb-4 sm:mb-6" aria-label="Breadcrumb">
        <Link href="/" className="text-slate-600 hover:text-navy transition-colors">Inicio</Link>
        <ChevronRight size={12} />
        <span className="text-navy font-medium">Favoritos</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-[1.6rem] sm:text-3xl md:text-4xl font-bold text-navy tracking-tight">Mi lista de deseos</h1>
          <p className="text-[13px] sm:text-sm text-slate-500 mt-1.5">
            {wishlist.length === 0
              ? 'Aún no has guardado favoritos.'
              : `${wishlist.length} producto${wishlist.length === 1 ? '' : 's'} guardado${wishlist.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {wishlist.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-soft px-5 py-12 sm:py-20 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-rose-50 flex items-center justify-center text-rose-400 mb-4">
            <Heart size={32} />
          </div>
          <h2 className="text-xl font-semibold text-navy">Tu lista está vacía</h2>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            Toca el corazón en cualquier producto que te guste para guardarlo aquí. Cuando estés listo, podrás
            añadirlo al carrito de un solo click.
          </p>
          <Link
            href="/productos"
            className="mt-6 inline-flex items-center gap-2 bg-navy text-white text-sm font-semibold px-6 h-12 rounded-2xl hover:bg-navy-700 shadow-soft hover:shadow-card transition-all"
          >
            Explorar productos <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          {wishlist.map((product) => {
            const isOut = product.stock === 0;
            const discount = product.originalPrice && product.originalPrice > product.price
              ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
              : null;
            return (
              <article
                key={product.id}
                className="group bg-white rounded-2xl border border-slate-200/80 shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all duration-300 overflow-hidden flex flex-col"
              >
                <Link
                  href={`/product/${product.slug ?? product.id}`}
                  className="relative aspect-[4/5] bg-slate-50 block overflow-hidden"
                >
                  <Image
                    src={product.image || '/placeholder-product.png'}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-contain p-5 transition-transform duration-500 group-hover:scale-110"
                  />

                  {discount && (
                    <span className="absolute top-3 left-3 bg-rose-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-soft">
                      -{discount}%
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeFromWishlist(product.id);
                    }}
                    className="absolute top-2 right-2 min-w-[44px] min-h-[44px] rounded-full bg-white/90 backdrop-blur border border-slate-200/70 shadow-soft flex items-center justify-center text-slate-400 hover:text-rose-500 active:text-rose-600 active:scale-95 hover:bg-white transition-all"
                    aria-label="Quitar de favoritos"
                  >
                    <X size={16} />
                  </button>
                </Link>

                <div className="p-3 sm:p-4 flex flex-col flex-grow gap-1.5">
                  {product.brand && (
                    <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
                      {product.brand}
                    </p>
                  )}
                  <Link
                    href={`/product/${product.slug ?? product.id}`}
                    className="text-[13px] sm:text-sm font-medium text-slate-800 leading-snug line-clamp-2 hover:text-navy transition-colors min-h-[2.4rem]"
                  >
                    {product.name}
                  </Link>

                  <div className="mt-auto pt-2 sm:pt-3">
                    <p className="text-[1.05rem] sm:text-xl font-bold text-navy nums tracking-tight leading-none">
                      {formatCurrency(product.price)}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleAddToCart(product)}
                      disabled={isOut || addedIds.has(product.id)}
                      className="mt-2.5 sm:mt-3 w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-brand-yellow text-navy text-[12px] sm:text-sm font-semibold hover:bg-[#FFE03A] active:scale-[0.97] shadow-soft hover:shadow-card transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addedIds.has(product.id) ? (
                        <>
                          <Check size={14} className="text-emerald-600" />
                          <span className="truncate text-emerald-700">¡Agregado!</span>
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={14} />
                          <span className="truncate">{isOut ? 'Agotado' : 'Mover al carrito'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WishlistClient;
