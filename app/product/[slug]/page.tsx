import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { d, dn } from '@/lib/decimal';
import { readSettings } from '@/lib/data-store';
import {
  ChevronRight, ShieldCheck, Truck, Wallet, Store, Clock,
  MessageCircle, Sparkles, Star, CheckCircle2, XCircle, Eye, Flame, Tag,
  type LucideIcon,
} from 'lucide-react';
import { readSiteContent, type TrustIcon } from '@/lib/site-content';
import { isWhatsAppCheckout } from '@/lib/checkout-mode';
import ProductActions from './ProductActions';
import ProductGallery from './ProductGallery';
import { firstCardImage, productToGalleryItems } from '@/lib/product-media';
import ProductTabs from './ProductTabs';
import PaymentMethods from './PaymentMethods';
import ProductShare from './ProductShare';
import ProductAboutHighlights from './ProductAboutHighlights';
import { formatCurrency, isGenericBrand } from '@/lib/utils';
import ProductCard from '@/components/ProductCard';
import RecentlyViewedTracker from '@/components/RecentlyViewedTracker';
import RecentlyViewed from '@/components/RecentlyViewed';
import ProductJsonLd from '@/app/components/ProductJsonLd';
import ProductReviews from './ProductReviews';
import { Stars } from '@/components/reviews/Stars';
import { getReviewSummary, getApprovedReviews, getReviewSummariesMap } from '@/lib/reviews';
import { parseProductSpecs } from '@/lib/definitions';
import { resolveCategoryPathFromProductCategory } from '@/lib/resolve-category-path';
import { getExchangeRate } from '@/app/actions/configActions';
import { resolveSlugRedirect } from '@/lib/slug-redirects';
import { PRODUCT_CARD_SELECT, PRODUCT_DETAIL_SELECT } from '@/lib/product-select';
import { buildProductFaq } from '@/lib/product-faq';
import type { Product as CatalogProduct } from '@/context/ProductContext';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// PRD-140 — ISR: la ficha muestra stock/precio con máximo 5 min de retraso sin
// volverse full-dynamic. Revalidación on-demand adicional: tasa (PRD-142, propio),
// quickUpdatePrice/Stock (PRD-024 → segmento 02) y delete (PRD-233 → DEPENDENCIA-05).
export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

// H38: pre-genera las fichas en build (el ISR sigue activo para productos
// nuevos vía dynamicParams). Usa slug ?? id — mismo patrón que sitemap y enlaces.
export async function generateStaticParams() {
  const products = await prisma.product.findMany({
    select: { slug: true, id: true },
  });
  return products.map((p) => ({ slug: p.slug ?? p.id }));
}

// Clamp de meta description: 140–160 chars, corta en palabra completa y solo
// añade elipsis cuando trunca de verdad (P11/P84: nada de "…" arbitrario).
function clampDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 110 ? lastSpace : max).trim()}…`;
}

// Las imágenes en R2 ya vienen optimizadas (webp, maxWidth en upload); usar URL tal cual.
function buildOgImageUrl(src: string): string {
  return src;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug }  = await params;
  const rawMeta   = await getProduct(slug);
  // PRD-204: normalizar Decimal → number
  const product   = rawMeta ? { ...rawMeta, price: d(rawMeta.price), originalPrice: dn(rawMeta.originalPrice) } : null;

  if (!product) {
    // P19/H28: el 404 de producto no debe quedar como soft-404 indexable.
    return {
      title: 'Producto no encontrado',
      robots: { index: false, follow: false },
    };
  }

  // P01/H05: el canonical SIEMPRE apunta a la URL con slug (la versión por id
  // además redirige 308 en el page component).
  const canonicalUrl = `${SITE_URL}/product/${product.slug ?? product.id}`;
  const mainImage    = product.images[0] ?? '';
  // P15: si el producto no tiene foto, la preview social usa la imagen de marca.
  const ogImage      = mainImage ? buildOgImageUrl(mainImage) : `${SITE_URL}/og-default.png`;

  // P08/P09 + H02: formato corto "[Producto] | MundoTech" — la marca la añade
  // una sola vez el template del layout ("%s | MundoTech").
  const title   = product.name;
  const ogTitle = `${product.name} | MundoTech`;

  // P11/P12/P84: description única por producto, 140–160 chars, desde el campo
  // real de la BD; el fallback incluye el nombre (keyword principal) y varía
  // por ficha — nunca la misma meta duplicada.
  const rawDesc = product.description?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
  let description: string;
  if (rawDesc.length >= 140) {
    description = clampDescription(rawDesc);
  } else if (rawDesc.length > 0) {
    description = clampDescription(
      `${rawDesc.replace(/[.!\s]+$/, '')}. Cómpralo en MundoTech Barquisimeto: precio en USD y Bs, retiro en tienda y envíos a toda Venezuela.`,
    );
  } else {
    description = clampDescription(
      `Compra ${product.name} en MundoTech Barquisimeto: precio en USD y Bs, retiro en tienda y envíos a toda Venezuela.`,
    );
  }

  const keywords = [
    product.name,
    product.brand ?? '',
    product.category,
    `${product.name} precio Venezuela`,
    `${product.name} Barquisimeto`,
    'tecnología Barquisimeto',
    'MundoTech',
  ].filter(Boolean);

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    // P13/H20: sin `type: 'website'` — el único og:type emitido es `product`
    // (vía `other`), coherente con el namespace product:* y los rich pins.
    openGraph: {
      title: ogTitle,
      description,
      url: canonicalUrl,
      siteName: 'MundoTech',
      locale: 'es_VE',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${product.name} — MundoTech Barquisimeto`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [ogImage],
    },
    // Open Graph de producto: og:type=product + precio, moneda y disponibilidad
    // (og:price:* / product:*) para previews de compra y Google Shopping.
    other: {
      'og:type': 'product',
      'og:price:amount': product.price.toFixed(2),
      'og:price:currency': 'USD',
      'og:availability': product.stock > 0 ? 'instock' : 'out of stock',
      'product:price:amount': product.price.toFixed(2),
      'product:price:currency': 'USD',
      'product:category': product.category,
      'product:condition': 'new',
      'product:availability': product.stock > 0 ? 'in stock' : 'out of stock',
      ...(product.brand && { 'product:brand': product.brand }),
    },
    // Productos sin stock mantienen index para preservar posicionamiento
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' as const },
    },
  };
}

async function getProduct(slug: string) {
  return prisma.product.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    select: PRODUCT_DETAIL_SELECT,
  });
}

async function getRelatedProducts(category: string, excludeId: string) {
  try {
    return await prisma.product.findMany({
      where: {
        category,
        id: { not: excludeId },
        stock: { gt: 0 },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_CARD_SELECT,
    });
  } catch (error) {
    console.error('[ProductDetailPage] Error al cargar productos relacionados:', error);
    return [];
  }
}

async function getDealsProducts(excludeIds: string[]) {
  try {
    const candidates = await prisma.product.findMany({
      where: {
        id: { notIn: excludeIds },
        stock: { gt: 0 },
        originalPrice: { not: null },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_CARD_SELECT,
    });
    return candidates
      .filter((p) => {
        const orig = dn(p.originalPrice);
        return orig != null && orig > d(p.price);
      })
      .slice(0, 5);
  } catch (error) {
    console.error('[ProductDetailPage] Error al cargar ofertas:', error);
    return [];
  }
}

// Iconos disponibles para los badges de confianza (editables en /admin/personalizar)
const TRUST_ICONS: Record<TrustIcon, LucideIcon> = {
  shield: ShieldCheck,
  truck: Truck,
  wallet: Wallet,
  store: Store,
  clock: Clock,
  whatsapp: MessageCircle,
  sparkles: Sparkles,
};

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [rawProduct, bsRate, siteContent, settings] = await Promise.all([
    getProduct(slug),
    getExchangeRate(),
    readSiteContent(),
    readSettings(),
  ]);

  if (!rawProduct) {
    // PRD-066: slug renombrado en el admin → redirect permanente a la URL vigente
    const redirectTarget = await resolveSlugRedirect(slug);
    if (redirectTarget) permanentRedirect(`/product/${redirectTarget}`);
    notFound();
  }

  // PRD-204: normalizar Decimal → number en la frontera BD→página
  const product = {
    ...rawProduct,
    price:         d(rawProduct.price),
    originalPrice: dn(rawProduct.originalPrice),
  };

  // P01/H05: una sola URL canónica por producto.
  if (product.slug && slug !== product.slug) {
    permanentRedirect(`/product/${product.slug}`);
  }

  const categoryPath = await resolveCategoryPathFromProductCategory(product.category);

  const mainImage = product.images[0] || '/placeholder-product.png';
  const isOut     = product.stock === 0;
  const bsPrice   = product.price * bsRate;
  const discount  = product.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  // PRD-223: shape explícito (sin `as any`) — coincide con el Product que
  // esperan ProductActions y el carrito (description nunca null).
  const productForClient = {
    ...product,
    description: product.description ?? '',
    image:   mainImage,
    details: {} as Record<string, string>,
  };

  const productSpecs = parseProductSpecs(product.specs);

  const [relatedProducts, reviewSummary, productReviews] = await Promise.all([
    getRelatedProducts(product.category, product.id),
    getReviewSummary(product.id),
    getApprovedReviews(product.id),
  ]);

  const dealsProducts = await getDealsProducts([
    product.id,
    ...relatedProducts.map((r) => r.id),
  ]);

  const [relatedSummaries, dealsSummaries] = await Promise.all([
    getReviewSummariesMap(relatedProducts.map((r) => r.id)),
    getReviewSummariesMap(dealsProducts.map((r) => r.id)),
  ]);

  // FASE 3 (SEO): FAQ real (pagos/envío/garantía/tienda) — visible en la
  // pestaña Envío + FAQPage JSON-LD. Datos vivos desde readSettings() (R1).
  const productFaq = buildProductFaq({
    productName: product.name,
    storeAddress: settings.address,
    storePhone: settings.phone,
  });

  const brandChipLabel = isGenericBrand(product.brand) ? null : product.brand;
  const isLowStock = !isOut && product.stock <= 5;

  return (
    <div className="pb-12 w-full max-w-full">

      {/* ── Datos estructurados JSON-LD ── */}
      <ProductJsonLd
        product={product}
        categoryPath={categoryPath}
        storeName={settings.storeName}
        reviewSummary={reviewSummary}
        reviews={productReviews}
        faq={productFaq}
      />

      {/* ── Breadcrumb ── */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 mb-4 sm:mb-6 overflow-hidden whitespace-nowrap" aria-label="Breadcrumb">
        <Link href="/" className="text-slate-600 hover:text-navy transition-colors flex-shrink-0">Inicio</Link>
        <ChevronRight size={12} className="flex-shrink-0" />
        <Link href="/productos" className="text-slate-600 hover:text-navy transition-colors flex-shrink-0">Catálogo</Link>
        <ChevronRight size={12} className="flex-shrink-0 hidden xs:block" />
        <Link
          href={categoryPath}
          className="hover:text-navy transition-colors capitalize hidden xs:inline truncate max-w-[9rem]"
        >
          {product.category}
        </Link>
        <ChevronRight size={12} className="flex-shrink-0" />
        <span className="text-navy font-medium truncate flex-1 min-w-0">{product.name}</span>
      </nav>

      {/* ── Layout principal 2 cols ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 lg:gap-8 items-start mb-8 sm:mb-12">

        {/* Galería — edge-to-edge en móvil; marco único en ProductGallery */}
        <div className="-mx-4 sm:-mx-6 md:mx-0">
          <ProductGallery
            items={productToGalleryItems(product)}
            name={product.name}
            isOut={isOut}
            discountPct={discount}
          />
        </div>

        {/* Información — tarjeta flotante */}
        <div className="card-elevated p-5 sm:p-6 lg:p-6 pb-20 sm:pb-6 flex flex-col">

          {/* Marca — oculta placeholders genéricos */}
          {brandChipLabel && (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="chip-brand">{brandChipLabel}</span>
            </div>
          )}

          {/* Título */}
          <h1 className="text-[1.35rem] xs:text-[1.5rem] sm:text-[1.65rem] md:text-[1.85rem] font-bold text-navy leading-[1.15] tracking-tight text-balance">
            {product.name}
          </h1>

          {/* Reseñas — promedio real (sin puntuación falsa) */}
          {reviewSummary.count > 0 ? (
            <a
              href="#reviews"
              className="mt-3 inline-flex items-center gap-2 text-[12px] text-slate-500 hover:text-navy transition-colors"
            >
              <Stars rating={reviewSummary.average} size={14} />
              <span className="font-semibold text-navy nums">{reviewSummary.average.toFixed(1)}</span>
              <span>· {reviewSummary.count} {reviewSummary.count === 1 ? 'reseña' : 'reseñas'}</span>
            </a>
          ) : (
            <a
              href="#reviews"
              className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-navy transition-colors"
            >
              <Star size={13} className="text-slate-300" />
              <span>Sé el primero en reseñar este producto</span>
            </a>
          )}

          {/* Precio */}
          <div className="mt-4 sm:mt-5 pb-4 sm:pb-5 border-b border-border">
            <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
              <span className="text-[2.1rem] sm:text-[2.5rem] md:text-[3rem] font-bold text-navy nums tracking-tight leading-none">
                US {formatCurrency(product.price)}
              </span>
              {product.originalPrice && product.originalPrice > product.price && (
                <span className="text-sm sm:text-base text-slate-400 line-through nums">
                  US {formatCurrency(product.originalPrice)}
                </span>
              )}
              {discount && (
                <span className="inline-flex items-center bg-rose-50 text-rose-600 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-full">
                  Ahorra {discount}%
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] sm:text-sm text-on-light nums break-words">
              <span className="font-semibold text-price-on-light">Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(bsPrice)}</span>
            </p>
            {product.freeShipping === true && !isOut ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#E6C200]/70 bg-[#FFF8D1] px-2.5 py-1.5 text-[12px] sm:text-[13px] font-semibold text-navy">
                <Truck size={14} aria-hidden="true" className="flex-shrink-0" />
                Envío gratis por MRW
              </p>
            ) : null}
          </div>

          <PaymentMethods />

          {/* Stock */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {isOut ? (
              <span className="inline-flex items-center gap-1.5 text-rose-600 text-sm font-semibold">
                <XCircle size={15} /> Sin existencias
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1.5 text-sm font-semibold">
                <Flame size={15} aria-hidden /> ¡Solo quedan {product.stock}!
              </span>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
                <span className="inline-flex items-center gap-1.5 text-emerald-700 text-sm font-semibold">
                  <CheckCircle2 size={15} /> En stock — {product.stock} disponibles
                </span>
              </>
            )}
          </div>

          {/* Acciones */}
          <div className="mt-5">
            <ProductActions product={productForClient} isWhatsAppCheckout={isWhatsAppCheckout} />
          </div>

          <ProductShare name={product.name} />

          {/* Trust strip — datos reales de la operación, editables en el admin.
              En <420px tres columnas dejaban el texto ilegible: pasa a 2 y
              reacomoda a 3 desde xs. */}
          <div className={`mt-5 grid gap-2 sm:gap-3 ${siteContent.productTrust.length >= 3 ? 'grid-cols-2 xs:grid-cols-3' : 'grid-cols-2'}`}>
            {siteContent.productTrust.map(({ icon, title, sub }) => {
              const Icon = TRUST_ICONS[icon] ?? ShieldCheck;
              return (
                <div key={title} className="bg-surface-muted rounded-2xl p-3 text-center border border-border/60">
                  <div className="w-8 h-8 mx-auto bg-white border border-border rounded-xl flex items-center justify-center text-navy mb-1.5 shadow-soft">
                    <Icon size={15} />
                  </div>
                  <p className="text-[12px] font-semibold text-navy leading-tight">{title}</p>
                  {sub ? <p className="text-[11px] text-on-light mt-0.5 leading-snug line-clamp-2">{sub}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ProductAboutHighlights specs={productSpecs} />

      {/* ── Tabs ── */}
      <div id="tabs" className="mb-12">
        <ProductTabs
          description={product.description}
          brand={product.brand}
          category={product.category}
          sku={product.sku}
          isOut={isOut}
          stock={product.stock}
          specs={productSpecs}
          reviewsCount={reviewSummary.count}
          reviewsAverage={reviewSummary.average}
          faq={productFaq}
        />
      </div>

      {/* ── Reseñas de clientes ── */}
      <ProductReviews
        productId={product.id}
        productName={product.name}
        initialSummary={reviewSummary}
        initialReviews={productReviews}
      />

      {/* ── También te puede interesar ── */}
      {relatedProducts.length > 0 && (
        <div className="mt-8 sm:mt-12">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Eye size={18} className="text-slate-400" />
            <h2 className="text-[1.3rem] sm:text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">
              También te puede interesar
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {relatedProducts.map((related) => {
              const s = relatedSummaries.get(related.id);
              const cardProduct: CatalogProduct = {
                id:            related.id,
                slug:          related.slug,
                name:          related.name,
                description:   related.description ?? '',
                price:         d(related.price),
                originalPrice: dn(related.originalPrice),
                stock:         related.stock,
                category:      related.category,
                brand:         related.brand,
                image:         firstCardImage(related.images),
                images:        related.images,
                details:       {},
                freeShipping:  related.freeShipping === true,
                rating:        s?.average,
                reviewCount:   s?.count,
              };
              return <ProductCard key={related.id} product={cardProduct} />;
            })}
          </div>
        </div>
      )}

      {/* ── Otras ofertas ── */}
      {dealsProducts.length > 0 && (
        <div className="mt-8 sm:mt-12">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Tag size={18} className="text-slate-400" />
            <h2 className="text-[1.3rem] sm:text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">
              Otras ofertas
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {dealsProducts.map((deal) => {
              const s = dealsSummaries.get(deal.id);
              const cardProduct: CatalogProduct = {
                id:            deal.id,
                slug:          deal.slug,
                name:          deal.name,
                description:   deal.description ?? '',
                price:         d(deal.price),
                originalPrice: dn(deal.originalPrice),
                stock:         deal.stock,
                category:      deal.category,
                brand:         deal.brand,
                image:         deal.images[0] || '/placeholder-product.png',
                images:        deal.images,
                details:       {},
                freeShipping:  deal.freeShipping === true,
                rating:        s?.average,
                reviewCount:   s?.count,
              };
              return <ProductCard key={deal.id} product={cardProduct} />;
            })}
          </div>
        </div>
      )}

      {/* ── Vistos recientemente ── */}
      <RecentlyViewed excludeId={product.id} limit={6} />

      {/* ── Tracker (no UI) ── */}
      <RecentlyViewedTracker
        id={product.id}
        slug={product.slug}
        name={product.name}
        price={product.price}
        image={mainImage}
        brand={product.brand}
        category={product.category}
      />

    </div>
  );
}
