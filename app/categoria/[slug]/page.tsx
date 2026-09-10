import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound, redirect, permanentRedirect } from 'next/navigation';
import { resolveSlugRedirect } from '@/lib/slug-redirects';
import { ChevronRight, Tag } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import JsonLd from '@/app/components/JsonLd';
import PaginationBar from '@/app/components/PaginationBar';
import {
  PAGE_SIZE,
  getCachedCategory,
  getCachedCategoryCount,
  getCachedCategoryProducts,
} from '@/lib/catalog-cache';
import type { Product } from '@/context/ProductContext';

// PRD-140 — ISR: 5 min máximo de obsolescencia para precio/stock por categoría
// (complementado con revalidación on-demand al cambiar tasa — PRD-142).
// Las queries Prisma están envueltas en unstable_cache (lib/catalog-cache.ts),
// por lo que el TTFB en caché caliente baja ~10–50 ms vs. el hit directo a BD.
export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Sanea el parámetro raw `?page=`.
 * - Ausente, no numérico, 0 o negativo → 1.
 * - > totalPages → totalPages (el caller redirige al rango válido).
 */
function sanitizePage(raw: string | undefined, totalPages: number): number {
  const n = parseInt(raw ?? '1', 10);
  if (!isFinite(n) || n < 1) return 1;
  return Math.min(n, totalPages);
}

// ── Metadata dinámica por categoría ──────────────────────────────────────────
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug }          = await params;
  const { page: rawPage } = await searchParams;
  const category          = await getCachedCategory(slug);

  if (!category) {
    return {
      title: 'Categoría no encontrada',
      robots: { index: false, follow: false },
    };
  }

  const productCount = await getCachedCategoryCount(category.name);
  const totalPages   = Math.max(1, Math.ceil(productCount / PAGE_SIZE));
  const page         = sanitizePage(rawPage, totalPages);

  const canonicalUrl =
    page <= 1
      ? `${SITE_URL}/categoria/${category.slug}`
      : `${SITE_URL}/categoria/${category.slug}?page=${page}`;

  // P85: seoTitle personalizado, o fallback al patrón basado en nombre.
  const titleBase = category.seoTitle
    ? category.seoTitle
    : `${category.name} - Tecnología`;
  const title   = page >= 2 ? `${titleBase} — Página ${page}` : titleBase;
  const ogTitle = page >= 2
    ? `${titleBase} — Página ${page} | MundoTech`
    : `${titleBase} | MundoTech`;
  // P85: descripción única por categoría, o fallback genérico.
  const description = category.description
    ? category.description
    : `Compra ${category.name} al mejor precio de Venezuela en MundoTech Barquisimeto. Pagas en USD o Bs, retiro en tienda y envíos por MRW, Zoom y Tealca a todo el país.`;
  const socialImage = category.imageUrl || `${SITE_URL}/og-default.png`;

  return {
    title,
    description,
    keywords: [
      category.name,
      `${category.name} Barquisimeto`,
      `${category.name} Venezuela`,
      `${category.name} precio`,
      `comprar ${category.name}`,
      'MundoTech',
      'tecnología Barquisimeto',
      'estado Lara tecnología',
    ],
    alternates: { canonical: canonicalUrl },
    // P50/H27: categoría sin productos → noindex temporal (thin content).
    // Páginas 2+ con contenido → index normal.
    robots:
      productCount === 0
        ? { index: false, follow: true }
        : {
            index: true,
            follow: true,
            googleBot: {
              index: true,
              follow: true,
              'max-snippet': -1,
              'max-image-preview': 'large' as const,
            },
          },
    openGraph: {
      title: ogTitle,
      description,
      url: canonicalUrl,
      siteName: 'MundoTech',
      locale: 'es_VE',
      type: 'website',
      images: [{ url: socialImage, width: 1200, height: 630, alt: category.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [socialImage],
    },
  };
}

// ── JSON-LD CollectionPage + ItemList + BreadcrumbList ─────────────────────────
function CategoryJsonLd({
  category,
  products,
  slug,
  page,
}: {
  category: { name: string; description?: string | null };
  products: Product[];
  slug: string;
  page: number;
}) {
  const url =
    page <= 1
      ? `${SITE_URL}/categoria/${slug}`
      : `${SITE_URL}/categoria/${slug}?page=${page}`;

  // P90/H65: position es absoluto (offset por página) para coherencia entre
  // páginas — Google usa la posición para entender jerarquía editorial.
  const positionOffset = (page - 1) * PAGE_SIZE;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${category.name} — MundoTech`,
    description:
      category.description ??
      `Catálogo de ${category.name} en MundoTech, líderes en tecnología en el estado Lara, Barquisimeto.`,
    url,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio',   item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Catálogo', item: `${SITE_URL}/productos` },
        { '@type': 'ListItem', position: 3, name: category.name, item: `${SITE_URL}/categoria/${slug}` },
      ],
    },
    // ItemList refleja exactamente los productos de esta página (con offset absoluto).
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: positionOffset + i + 1,
        url: `${SITE_URL}/product/${p.slug ?? p.id}`,
        name: p.name,
      })),
    },
  };

  return <JsonLd data={schema} />;
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug }          = await params;
  const { page: rawPage } = await searchParams;
  const category          = await getCachedCategory(slug);

  if (!category) {
    // PRD-066 / DEPENDENCIA-05: slug was renamed — check for a registered 301 redirect
    // before returning 404, to preserve SEO value of indexed or externally-linked URLs.
    const redirectTarget = await resolveSlugRedirect(slug);
    if (redirectTarget) {
      // Preserve ?page= so paginated URLs keep working after a category rename.
      const destination = rawPage
        ? `/categoria/${redirectTarget}?page=${rawPage}`
        : `/categoria/${redirectTarget}`;
      permanentRedirect(destination);
    }
    notFound();
  }

  // Cached count — no DB hit on repeated requests for the same category+page.
  const total      = await getCachedCategoryCount(category.name);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Redirige ?page=N inválido antes de hacer la query principal.
  if (rawPage !== undefined) {
    const raw = parseInt(rawPage, 10);
    if (!isFinite(raw) || raw < 1) {
      redirect(`/categoria/${slug}`);
    }
    if (raw > totalPages) {
      redirect(`/categoria/${slug}?page=${totalPages}`);
    }
  }

  const page = sanitizePage(rawPage, totalPages);

  const products = await getCachedCategoryProducts(category.name, page);

  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full">
      <CategoryJsonLd category={category} products={products as Product[]} slug={slug} page={page} />

      {/* Hero de categoría */}
      <div className="relative bg-white rounded-2xl border border-slate-200/80 shadow-soft p-5 sm:p-8 mb-6 sm:mb-8 overflow-hidden">
        {category.imageUrl && (
          <Image
            src={category.imageUrl}
            alt={`Categoría ${category.name}`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 80vw"
            className="object-cover opacity-[0.06]"
          />
        )}
        <div className="relative">
          {/* Breadcrumb */}
          <nav
            className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-400 mb-4 truncate"
            aria-label="Breadcrumb"
          >
            <Link href="/" className="text-slate-600 hover:text-navy transition-colors">Inicio</Link>
            <ChevronRight size={12} className="flex-shrink-0" />
            <Link href="/productos" className="text-slate-600 hover:text-navy transition-colors">Catálogo</Link>
            <ChevronRight size={12} className="flex-shrink-0" />
            <span className="text-navy font-medium capitalize">{category.name}</span>
          </nav>

          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-600 mb-2">
            <Tag size={11} />
            Categoría
          </span>

          <h1 className="text-[1.75rem] sm:text-3xl md:text-[2.25rem] font-bold text-navy tracking-tight leading-tight capitalize">
            {category.name}
            {page >= 2 && (
              <span className="ml-2 text-lg sm:text-xl font-medium text-slate-400">
                — Página {page}
              </span>
            )}
          </h1>

          {category.description ? (
            <p className="mt-2 text-[13px] sm:text-sm text-slate-500 max-w-2xl">
              {category.description}
            </p>
          ) : (
            <p className="mt-2 text-[13px] sm:text-sm text-slate-500 max-w-2xl">
              Los mejores productos de <strong>{category.name}</strong> en MundoTech,
              líderes en tecnología en el estado Lara, Barquisimeto. Precio en USD y Bs.,
              retiro en tienda y envíos por MRW, Zoom y Tealca.
            </p>
          )}

          <p className="mt-3 text-xs text-slate-400">
            {total} {total === 1 ? 'producto disponible' : 'productos disponibles'}
            {totalPages > 1 && ` · Página ${page} de ${totalPages}`}
          </p>
        </div>
      </div>

      {/* Grid de productos — HTML indexable sin JS */}
      {products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft px-5 py-16 text-center">
          <p className="text-lg font-semibold text-navy">Sin productos en esta categoría</p>
          <p className="mt-1 text-sm text-slate-500">Pronto añadiremos más artículos.</p>
          <Link
            href="/productos"
            className="mt-5 inline-flex items-center gap-2 bg-navy text-white text-sm font-semibold px-5 min-h-[44px] rounded-xl hover:bg-navy-700 shadow-soft transition-all"
          >
            Ver catálogo completo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          {(products as Product[]).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* Controles de paginación — enlaces <a> crawlables, sin JS */}
      <PaginationBar
        page={page}
        totalPages={totalPages}
        basePath={`/categoria/${slug}`}
      />
    </div>
  );
}
