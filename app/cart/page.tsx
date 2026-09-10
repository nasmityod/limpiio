import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ChevronRight, Eye } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { fullProductToCardModel } from '@/lib/search-shared';
import CartClient from './CartClient';
import RecentlyViewed from '@/components/RecentlyViewed';
import { d, dn } from '@/lib/decimal';
import { PRODUCT_CARD_SELECT } from '@/lib/product-select';
import { firstCardImage } from '@/lib/product-media';
import { readSettings } from '@/lib/data-store';
import DivisaDiscountBanner from '@/app/components/DivisaDiscountBanner';

export const dynamic = 'force-dynamic';

// H03/H11: página transaccional — noindex + canonical propio (antes heredaba
// el canonical de la home y robots.txt la dejaba rastreable).
export const metadata: Metadata = {
  title: 'Tu carrito',
  description: 'Revisa los productos de tu carrito MundoTech y finaliza tu compra en USD o Bs.',
  alternates: { canonical: '/cart' },
  robots: { index: false, follow: true },
};

/** Campos mínimos para ProductCard — sin `select` Prisma pide todas las columnas del modelo (p. ej. `isActive`) y falla si la migración aún no corrió. */
async function getRecommendedProducts() {
  try {
    return await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_CARD_SELECT,
    });
  } catch (error) {
    console.error('[CartPage] Error al cargar recomendados:', error);
    return [];
  }
}

export default async function CartPage() {
  const [recommended, settings] = await Promise.all([
    getRecommendedProducts(),
    readSettings(),
  ]);

  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full">

      <div className="-mx-4 sm:-mx-6 lg:-mx-8 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] lg:w-[calc(100%+4rem)] section-band-navy mb-5 sm:mb-6 rounded-none sm:rounded-2xl overflow-hidden">
        <div className="circuit-bg" aria-hidden />
        <div className="relative px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/70">
            Tu <span className="text-brand-yellow">carrito</span>
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-white tracking-tight">Revisa antes de pagar</h1>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-500 mb-4 sm:mb-6" aria-label="Breadcrumb">
        <Link href="/" className="text-slate-600 hover:text-navy transition-colors">Inicio</Link>
        <ChevronRight size={12} />
        <span className="text-navy font-medium">Carrito</span>
      </nav>

      <div className="mb-4 sm:mb-5">
        <DivisaDiscountBanner
          enabled={Boolean(settings.divisaDiscountEnabled)}
          percent={settings.divisaDiscountPercent ?? 0}
        />
      </div>

      <CartClient />

      {/* Recomendados */}
      {recommended.length > 0 && (
        <div className="mt-10 sm:mt-14">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Eye size={18} className="text-slate-400" />
            <h2 className="text-[1.3rem] sm:text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">
              También te puede interesar
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {recommended.map((product) => (
              <ProductCard
                key={product.id}
                product={fullProductToCardModel({
                  id: product.id,
                  slug: product.slug,
                  name: product.name,
                  description: product.description ?? '',
                  // PRD-204: convertir Decimal → number
                  price: d(product.price),
                  originalPrice: dn(product.originalPrice),
                  stock: product.stock,
                  category: product.category,
                  brand: product.brand,
                  image: firstCardImage(product.images),
                  images: product.images,
                  details: {},
                  freeShipping: product.freeShipping === true,
                })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Vistos recientemente */}
      <RecentlyViewed limit={6} />
    </div>
  );
}
