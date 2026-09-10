'use client';

import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import Image from 'next/image';
import Link from 'next/link';
import { Plus, Minus, Trash2, ArrowRight, ShoppingBag, ShieldCheck, Truck, Tag } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const CartImageWithFallback = ({ src, alt }: { src: string; alt: string }) => {
  const [imgSrc, setImgSrc] = useState(src || '/placeholder-product.png');
  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      sizes="120px"
      className="object-contain p-3"
      onError={() => setImgSrc('/placeholder-product.png')}
    />
  );
};

const CartClient = () => {
  const { cart: cartItems, updateQuantity, removeFromCart, getCartTotal } = useCart();
  const router           = useRouter();

  // FASE 4.1 (MEJORA 1.2): checkout invitado — sin exigir login para comprar.
  const handleCheckout = () => {
    router.push('/checkout');
  };

  // PRD-021: nada de "$5 de envío" ni "10% de impuestos" inventados — el
  // checkout cobra exactamente el subtotal (precios con impuestos incluidos;
  // retiro en tienda u oficina MRW sin recargo de la tienda).
  const subtotal   = getCartTotal();
  const finalTotal = subtotal;
  const totalUnits = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5 sm:mb-6">
        <div>
          <p className="text-sm text-on-light">
            {cartItems.length === 0
              ? 'Aún no tienes productos.'
              : `${cartItems.length} producto${cartItems.length === 1 ? '' : 's'} · ${totalUnits} unidad${totalUnits === 1 ? '' : 'es'}`}
          </p>
        </div>
      </div>

      {cartItems.length === 0 ? (
        <div className="card-elevated-lg px-6 py-16 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-4">
            <ShoppingBag size={36} />
          </div>
          <h2 className="text-xl font-semibold text-navy">Tu carrito está vacío</h2>
          <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
            Cuando agregues productos aparecerán aquí. Explora nuestro catálogo y encuentra
            tecnología para tu día a día.
          </p>
          <Link
            href="/productos"
            className="mt-6 inline-flex items-center gap-2 bg-navy text-white text-sm font-semibold px-6 h-12 rounded-2xl hover:bg-navy-700 shadow-soft hover:shadow-card transition-all"
          >
            Explorar catálogo <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <>
        {/* Sticky checkout bar — mobile only */}
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-4 pt-3 shadow-[0_-4px_24px_-4px_rgba(11,18,32,0.12)]"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center justify-between gap-4 mb-2">
            <span className="text-sm text-slate-500">Total</span>
            <span className="text-xl font-bold text-navy nums">{formatCurrency(finalTotal)}</span>
          </div>
          <button
            type="button"
            onClick={handleCheckout}
            className="w-full inline-flex items-center justify-center gap-2 bg-brand-yellow text-navy font-bold text-sm min-h-[52px] rounded-2xl hover:bg-[#FFE03A] active:scale-[0.98] shadow-soft transition-all"
          >
            Proceder al pago <ArrowRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-8 items-start pb-[140px] lg:pb-0">

          {/* Lista */}
          <section className="lg:col-span-2 space-y-3">
            {cartItems.map((product) => (
              <article
                key={product.id}
                className="card-elevated p-3 sm:p-5 flex gap-3 sm:gap-5"
              >
                <Link
                  href={`/product/${product.slug ?? product.id}`}
                  className="relative h-24 w-24 sm:h-32 sm:w-32 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden"
                >
                  <CartImageWithFallback
                    src={product.image || product.images?.[0] || '/placeholder-product.png'}
                    alt={product.name}
                  />
                </Link>

                <div className="flex flex-1 flex-col min-w-0">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      {product.brand && (
                        <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                          {product.brand}
                        </p>
                      )}
                      <Link
                        href={`/product/${product.slug ?? product.id}`}
                        className="block text-[13px] sm:text-base font-medium text-navy hover:text-navy/80 transition-colors leading-snug line-clamp-2"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-1 text-[11px] sm:text-xs text-slate-500 nums">
                        {formatCurrency(product.price)} c/u
                      </p>
                    </div>
                    <p className="text-sm sm:text-lg font-bold text-navy whitespace-nowrap nums flex-shrink-0">
                      {formatCurrency(product.price * product.quantity)}
                    </p>
                  </div>

                  <div className="mt-auto pt-2 sm:pt-3 flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-full overflow-hidden">
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, product.quantity - 1)}
                        disabled={product.quantity <= 1}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white active:bg-slate-200 text-slate-500 hover:text-navy transition-colors disabled:opacity-30"
                        aria-label="Reducir cantidad"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-9 sm:w-10 text-center text-sm font-bold text-navy nums">
                        {product.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, product.quantity + 1)}
                        disabled={product.quantity >= product.stock}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white active:bg-slate-200 text-slate-500 hover:text-navy transition-colors disabled:opacity-30"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(product.id)}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-[11px] sm:text-xs font-medium text-slate-400 hover:text-rose-500 active:text-rose-600 transition-colors"
                      aria-label="Eliminar producto"
                    >
                      <Trash2 size={14} />
                      <span className="hidden xs:inline">Eliminar</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          {/* Resumen sticky */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-[96px] space-y-4">
              <div className="card-elevated p-6">
                <h2 className="text-base font-semibold text-navy mb-5">Resumen del pedido</h2>

                {/* PRD-EXTRA-CHK-1: aquí había un input de cupón decorativo (el
                    botón "Aplicar" no tenía handler). El cupón real se aplica en
                    la revisión del checkout, donde se valida contra el servidor. */}
                <div className="flex items-center gap-2 mb-5 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                  <Tag size={14} className="text-slate-400 flex-shrink-0" />
                  <p className="text-xs text-slate-500">
                    ¿Tienes un cupón? Lo aplicas al revisar tu pedido en el checkout.
                  </p>
                </div>

                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd className="text-navy font-medium nums">{formatCurrency(subtotal)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500">Envío</dt>
                    <dd className="text-xs text-slate-500 text-right">
                      Envío gratis solo por MRW cuando todos los productos califican · ZOOM y
                      TEALCA: cobro a destino · Retiro en tienda: sin envío
                    </dd>
                  </div>
                  <div className="border-t border-slate-100 pt-3 mt-2 flex items-end justify-between">
                    <dt className="text-base font-semibold text-navy">Total</dt>
                    <dd className="text-2xl font-bold text-navy nums tracking-tight">
                      {formatCurrency(finalTotal)}
                    </dd>
                  </div>
                </dl>

                <button type="button"
                  onClick={handleCheckout}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-brand-yellow text-navy font-bold text-sm h-12 rounded-2xl hover:bg-[#FFE03A] shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all"
                >
                  Proceder al pago <ArrowRight size={16} />
                </button>

                <Link
                  href="/productos"
                  className="block mt-3 text-center text-xs font-medium text-slate-500 hover:text-navy transition-colors"
                >
                  ← Continuar comprando
                </Link>
              </div>

              {/* Trust strip */}
              <div className="card-elevated p-5 space-y-3">
                {[
                  { icon: ShieldCheck, label: 'Pago Móvil · Transferencia · Binance', sub: 'Verificamos tu pago y te confirmamos por correo' },
                  { icon: Truck,       label: 'Delivery gratis en Barquisimeto',      sub: 'Centro y Este (condiciones aplican).' },
                ].map((trust) => (
                  <div key={trust.label} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <trust.icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy">{trust.label}</p>
                      <p className="text-[11px] text-slate-500">{trust.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
        </>
      )}
    </>
  );
};

export default CartClient;
