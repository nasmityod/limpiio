import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  PAGE_SIZE,
  getCachedCatalogCount,
  getCachedCatalogProducts,
  getCachedServerCategories,
} from '@/lib/catalog-cache';
import { queryCatalogProducts } from '@/lib/products/query-products';
import {
  buildCatalogHref,
  hasActiveCatalogFilters,
  parseProductQuery,
  type CatalogUrlParams,
} from '@/lib/products/filter';
import ProductGridAndFilters from '@/app/components/ProductGridAndFilters';
import ProductCardSkeleton from '@/components/ProductCardSkeleton';
import PaginationBar from '@/app/components/PaginationBar';
import JsonLd from '@/app/components/JsonLd';
import RecentlyViewed from '@/components/RecentlyViewed';
import { ChevronRight } from 'lucide-react';
import type { Product } from '@/context/ProductContext';

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

export { PAGE_SIZE };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

function sanitizePage(raw: string | undefined, totalPages: number): number {
  const n = parseInt(raw ?? '1', 10);
  if (!isFinite(n) || n < 1) return 1;
  return Math.min(n, totalPages);
}

function toCatalogUrlParams(query: ReturnType<typeof parseProductQuery>): CatalogUrlParams {
  return {
    q: query.q,
    cat: query.category,
    brand: query.brand,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sort: query.sort,
  };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = parseProductQuery(params);
  const total = hasActiveCatalogFilters(query)
    ? (await queryCatalogProducts({ ...query, page: 1 })).total
    : await getCachedCatalogCount();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = sanitizePage(params.page, totalPages);

  const canonicalUrl = buildCanonicalUrl(page, query);

  const titleBase = query.q
    ? `Catálogo — "${query.q}"`
    : query.category
      ? `Catálogo — ${query.category}`
      : 'Catálogo de tecnología, hogar y variedades';
  const title = page >= 2 ? `${titleBase} — Página ${page}` : titleBase;

  // Variantes con filtros (?q=, ?brand=, precio, sort) → noindex,follow:
  // son resultados de búsqueda/filtrado internos (thin/duplicate content según
  // las guías de Google). Solo /productos y su paginación limpia se indexan.
  const isFiltered = hasActiveCatalogFilters(query);

  return {
    title,
    description:
      'Catálogo de MundoTech Barquisimeto: tecnología, gadgets, hogar, cocina, fitness, salud y más. Paga en USD o Bs y recibe en toda Venezuela.',
    alternates: { canonical: canonicalUrl },
    robots: isFiltered
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title: `${title} | MundoTech`,
      description:
        'Tecnología, hogar, cocina, fitness y más en Barquisimeto. USD/Bs., retiro en tienda y envíos nacionales.',
      url: canonicalUrl,
      siteName: 'MundoTech',
      locale: 'es_VE',
      type: 'website',
    },
  };
}

function buildCanonicalUrl(page: number, query: ReturnType<typeof parseProductQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('cat', query.category);
  if (query.brand) params.set('brand', query.brand);
  if (query.minPrice != null) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice != null) params.set('maxPrice', String(query.maxPrice));
  if (query.sort !== 'default') params.set('sort', query.sort);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `${SITE_URL}/productos${qs ? `?${qs}` : ''}`;
}

const catalogBreadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Catálogo', item: `${SITE_URL}/productos` },
  ],
};

/**
 * ItemList del catálogo sin filtros (mismo patrón que CategoryJsonLd):
 * refleja los productos de la página actual con posición absoluta.
 */
function buildCatalogItemList(products: Product[], page: number) {
  const positionOffset = (page - 1) * PAGE_SIZE;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Catálogo — MundoTech',
    url: page <= 1 ? `${SITE_URL}/productos` : `${SITE_URL}/productos?page=${page}`,
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
}

export default async function ProductosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = parseProductQuery(params);
  const useFilteredQuery = hasActiveCatalogFilters(query);

  const [serverCategories, catalogResult] = await Promise.all([
    getCachedServerCategories(),
    useFilteredQuery
      ? queryCatalogProducts(query)
      : Promise.all([
          getCachedCatalogCount(),
          getCachedCatalogProducts(query.page),
        ]).then(([total, items]) => ({
          items,
          total,
          facets: { categories: [] as string[], brands: [] as string[] },
        })),
  ]);

  const total = catalogResult.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = sanitizePage(params.page, totalPages);
  let products = catalogResult.items;
  let facetBrands = catalogResult.facets.brands;

  if (useFilteredQuery && page !== query.page) {
    const refetch = await queryCatalogProducts({ ...query, page });
    products = refetch.items;
    facetBrands = refetch.facets.brands;
  } else if (!useFilteredQuery && page !== query.page) {
    products = await getCachedCatalogProducts(page);
  }

  if (params.page !== undefined) {
    const raw = parseInt(params.page, 10);
    if (!isFinite(raw) || raw < 1) {
      redirect('/productos');
    }
    if (raw > totalPages) {
      redirect(buildCatalogHref('/productos', { ...toCatalogUrlParams(query), page: totalPages > 1 ? totalPages : undefined }));
    }
  }

  const catalogQuery = toCatalogUrlParams({ ...query, page });

  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full">
      <JsonLd
        data={
          useFilteredQuery
            ? catalogBreadcrumbSchema
            : [catalogBreadcrumbSchema, buildCatalogItemList(products as Product[], page)]
        }
      />

      <div className="card-elevated p-4 sm:p-6 lg:p-8 mb-5 sm:mb-8">
        <nav
          className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-500 mb-3 truncate"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="text-slate-600 hover:text-navy transition-colors">
            Inicio
          </Link>
          <ChevronRight size={12} className="flex-shrink-0" />
          <span className="text-navy font-medium">Catálogo</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="chip-brand mb-2">
              Catálogo completo · Barquisimeto
            </p>
            <h1 className="text-[1.6rem] sm:text-3xl md:text-[2.25rem] font-bold text-navy tracking-tight leading-[1.05]">
              {query.category ? (
                <span className="capitalize">{query.category}</span>
              ) : (
                'Todos los productos'
              )}
              {page >= 2 && (
                <span className="ml-2 text-lg sm:text-xl font-medium text-slate-400">
                  — Página {page}
                </span>
              )}
            </h1>
            <p className="text-[13px] sm:text-sm text-slate-500 mt-2 max-w-xl">
              {useFilteredQuery ? (
                <>
                  <span className="font-semibold text-navy nums">{total}</span>{' '}
                  {total === 1 ? 'resultado' : 'resultados'}
                  {query.q && (
                    <> para &ldquo;{query.q}&rdquo;</>
                  )}
                  . Filtra por categoría, marca y precio; ordena como prefieras.
                </>
              ) : (
                <>
                  Filtra por categoría, ordena por precio y encuentra exactamente lo que buscas.
                  Compra desde Barquisimeto con retiro en tienda o envío nacional.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        <ProductGridAndFilters
          initialProducts={products as Product[]}
          totalCount={total}
          serverCategories={serverCategories}
          facetBrands={facetBrands}
          initialQuery={{
            q: query.q ?? '',
            category: query.category ?? '',
            brand: query.brand ?? '',
            minPrice: query.minPrice != null ? String(query.minPrice) : '',
            maxPrice: query.maxPrice != null ? String(query.maxPrice) : '',
            sort: query.sort,
          }}
        />
      </Suspense>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        basePath="/productos"
        catalogQuery={catalogQuery}
      />

      <RecentlyViewed limit={6} />
    </div>
  );
}
