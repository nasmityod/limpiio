/**
 * Inyecta los bloques JSON-LD de Schema.org para una ficha de producto:
 *   • schema:Product + schema:Offer (con @id estable `{url}#product`)
 *   • schema:BreadcrumbList (alineado 1:1 con el breadcrumb visual de la ficha)
 *
 * El LocalBusiness ya NO se emite aquí (H01/H07/P20/P24): el layout global lo
 * publica en todas las páginas con datos vivos de readSeoLocal()/readSettings().
 * El seller referencia esa entidad vía @id `{SITE_URL}/#organization`.
 *
 * R1: este componente solo renderiza — el nombre de tienda llega por props
 * desde el Server Component padre (que lee readSettings()).
 *
 * Uso: <ProductJsonLd product={product} categoryPath={categoryPath} storeName={settings.storeName} />
 * Renderiza solo <script> tags; no emite HTML visible.
 */

import JsonLd from '@/app/components/JsonLd';
import type { Review, ReviewSummary, ProductSpec } from '@/lib/definitions';
import { parseProductSpecs } from '@/lib/definitions';
import type { ProductFaqItem } from '@/lib/product-faq';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

// Imágenes en R2 ya optimizadas en upload; usar URL tal cual para JSON-LD / OG.
function buildOgImageUrl(src: string): string {
  return src;
}

// ── Helper: elimina etiquetas HTML de un string para uso en JSON-LD ──────────
function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface ProductForJsonLd {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  stock: number;
  brand: string | null;
  category: string;
  slug: string | null;
  sku: string | null;
  images: string[];
  specs?: unknown | null;
  updatedAt: Date;
}

interface Props {
  product: ProductForJsonLd;
  /** Ruta desde resolveCategoryPathFromProductCategory (`/categoria/slug` o `/productos`). */
  categoryPath: string;
  /** Nombre de tienda desde readSettings() (P22/H49: una sola entidad de marca). */
  storeName: string;
  /** Resumen de reseñas APROBADAS — habilita aggregateRating si count > 0. */
  reviewSummary?: ReviewSummary;
  /** Reseñas APROBADAS para emitir como schema:Review (máx. 5 para no inflar el HTML). */
  reviews?: Review[];
  /** FASE 3: FAQ visible en la ficha (pestaña Envío) — emite FAQPage JSON-LD. */
  faq?: ProductFaqItem[];
}

// ── Componente ─────────────────────────────────────────────────────────────
export default function ProductJsonLd({ product, categoryPath, storeName, reviewSummary, reviews, faq }: Props) {
  const baseUrl = SITE_URL.replace(/\/$/, '');
  const categoryItemUrl = `${baseUrl}${categoryPath}`;
  const productUrl = `${baseUrl}/product/${product.slug ?? product.id}`;
  const productId  = `${productUrl}#product`;
  const mainImage  = product.images[0] ?? '';
  const ogImage    = mainImage ? buildOgImageUrl(mainImage) : '';

  // Fecha de expiración del precio: 30 días desde hoy
  const priceValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // ── 1. Product + Offer ────────────────────────────────────────────────────
  const cleanDescription = stripHtml(product.description)
    || `${product.name} disponible en ${storeName} Barquisimeto. Compra con factura.`;

  const allImages = product.images
    .map((img) => buildOgImageUrl(img))
    .filter(Boolean);

  // P26/P15: Product.image nunca vacío — fallback a la imagen OG de marca.
  const schemaImages = allImages.length > 0
    ? allImages
    : (ogImage ? [ogImage] : [`${baseUrl}/og-default.png`]);

  // ── Reseñas: aggregateRating + review (solo con datos reales aprobados) ──────
  const hasRatings = !!reviewSummary && reviewSummary.count > 0;
  const aggregateRating = hasRatings
    ? {
        '@type': 'AggregateRating',
        ratingValue: reviewSummary!.average.toFixed(1),
        reviewCount: reviewSummary!.count,
        bestRating: '5',
        worstRating: '1',
      }
    : null;
  const reviewSchema = (reviews ?? []).slice(0, 5).map((r) => ({
    '@type': 'Review',
    // P77/H53: cada reseña enlaza al @id del producto — grafo conectado.
    itemReviewed: { '@type': 'Product', '@id': productId },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: String(r.rating),
      bestRating: '5',
      worstRating: '1',
    },
    author: { '@type': 'Person', name: r.authorName },
    datePublished: r.createdAt.split('T')[0],
    ...(r.title ? { name: r.title } : {}),
    reviewBody: r.comment,
  }));

  const parsedSpecs: ProductSpec[] = parseProductSpecs(product.specs);
  const additionalProperty = parsedSpecs.map((s) => ({
    '@type': 'PropertyValue',
    name:  s.name,
    value: s.value,
  }));

  // P75/H51: si hay rebaja, el precio tachado va como UnitPriceSpecification
  // tipo ListPrice (patrón documentado por Google para "sale price").
  const hasDiscount =
    typeof product.originalPrice === 'number' && product.originalPrice > product.price;

  // P79: dateModified desde updatedAt de BD — señal de frescura para rich results.
  const dateModified = product.updatedAt.toISOString();

  // P80: category como URL canónica de categoría en vez de texto libre.
  const categoryUrl = `${baseUrl}${categoryPath}`;

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': productId,
    name: product.name,
    description: cleanDescription,
    image: schemaImages,
    sku: product.sku ?? product.id,
    ...(product.brand && {
      brand: { '@type': 'Brand', name: product.brand },
    }),
    // P80: URL canónica de la categoría en lugar de texto libre.
    category: categoryUrl,
    url: productUrl,
    // P79: señal de frescura explícita para Google.
    dateModified,
    ...(additionalProperty.length > 0 ? { additionalProperty } : {}),
    ...(aggregateRating ? { aggregateRating } : {}),
    ...(reviewSchema.length > 0 ? { review: reviewSchema } : {}),
    offers: {
      '@type': 'Offer',
      price: product.price.toFixed(2),
      priceCurrency: 'USD',
      ...(hasDiscount
        ? {
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              priceType: 'https://schema.org/ListPrice',
              price: product.originalPrice!.toFixed(2),
              priceCurrency: 'USD',
            },
          }
        : {}),
      availability:
        product.stock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      priceValidUntil,
      url: productUrl,
      // P22/H49 + P78: seller = entidad Organization del layout (mismo @id).
      seller: {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: storeName,
        url: SITE_URL,
      },
      // P94/H66: garantía de 7 días en electrónica general — alineada con el copy visible del sitio.
      warranty: {
        '@type': 'WarrantyPromise',
        durationOfWarranty: {
          '@type': 'QuantitativeValue',
          value: 7,
          unitCode: 'DAY',
        },
      },
      // ── Detalles de envío ──
      // P21/H09: se eliminó la tarifa fija $5.00 (dato falso — la política real
      // informa el costo según destino/peso en el checkout). Sin shippingRate
      // el bloque sigue siendo válido y no emite montos engañosos.
      // DEPENDENCIA-03: cuando StoreSettings tenga tarifa de envío configurable,
      // leerla vía readSettings() y reincorporar shippingRate aquí.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        // P95: enlace a la política de envío real (Google Shopping lo recomienda).
        url: `${baseUrl}/shipping-policy`,
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'VE',
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          businessDays: {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [
              'https://schema.org/Monday',
              'https://schema.org/Tuesday',
              'https://schema.org/Wednesday',
              'https://schema.org/Thursday',
              'https://schema.org/Friday',
            ],
          },
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: 0,
            maxValue: 1,
            unitCode: 'DAY',
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: 1,
            maxValue: 3,
            unitCode: 'DAY',
          },
        },
      },
      // ── Política de devoluciones (señal de confianza para Google Shopping) ──
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'VE',
        returnPolicyCategory:
          'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 7,
        returnMethod: 'https://schema.org/ReturnInStore',
        returnFees: 'https://schema.org/FreeReturn',
        // P76/H52: enlace a la política real de devoluciones.
        merchantReturnLink: `${baseUrl}/devoluciones`,
      },
    },
  };

  // ── 2. BreadcrumbList ─────────────────────────────────────────────────────
  // Alineado con el breadcrumb visual: Inicio → Catálogo → Categoría → Producto.
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Catálogo',
        item: `${SITE_URL}/productos`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: product.category,
        item: categoryItemUrl,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: product.name,
        item: productUrl,
      },
    ],
  };

  // ── 3. FAQPage (FASE 3) — solo si la ficha muestra la FAQ visible ─────────
  const faqSchema =
    faq && faq.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: { '@type': 'Answer', text: f.answer },
          })),
        }
      : null;

  const allSchemas = [
    productSchema,
    breadcrumbSchema,
    ...(faqSchema ? [faqSchema] : []),
  ] satisfies Record<string, unknown>[];

  return <JsonLd data={allSchemas} />;
}
