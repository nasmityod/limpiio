import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PAGE_SIZE, getCachedOfferProducts } from '@/lib/catalog-cache';
import ProductCard from '@/components/ProductCard';
import PaginationBar from '@/app/components/PaginationBar';
import JsonLd from '@/app/components/JsonLd';
import RecentlyViewed from '@/components/RecentlyViewed';
import { ChevronRight, Sparkles, Tag } from 'lucide-react';
import type { Product } from '@/context/ProductContext';

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

function sanitizePage(raw: string | undefined, totalPages: number): number {
  const n = parseInt(raw ?? '1', 10);
  if (!isFinite(n) || n < 1) return 1;
  return Math.min(n, totalPages);
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { page: rawPage } = await searchParams;
  const offers = await getCachedOfferProducts();
  const totalPages = Math.max(1, Math.ceil(offers.length / PAGE_SIZE));
  const page = sanitizePage(rawPage, totalPages);

  const canonicalUrl =
    page <= 1 ? `${SITE_URL}/ofertas` : `${SITE_URL}/ofertas?page=${page}`;
  const titleBase = 'Ofertas del Día';
  const title = page >= 2 ? `${titleBase} — Página ${page}` : titleBase;

  return {
    title,
    description:
      'Ofertas y rebajas reales en MundoTech Barquisimeto: tecnología, hogar, cocina, fitness y más con descuento. Paga en USD o Bs y recibe en toda Venezuela.',
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      title: `${title} | MundoTech`,
      description:
        'Productos con descuento real en Barquisimeto. USD/Bs., retiro en tienda y envíos nacionales.',
      url: canonicalUrl,
      siteName: 'MundoTech',
      locale: 'es_VE',
      type: 'website',
    },
  };
}

const offersBreadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio',  item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Ofertas', item: `${SITE_URL}/ofertas` },
  ],
};

export default async function OfertasPage({ searchParams }: PageProps) {
  const { page: rawPage } = await searchParams;

  const offers     = await getCachedOfferProducts();
  const total      = offers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page       = sanitizePage(rawPage, totalPages);

  if (rawPage !== undefined) {
    const raw = parseInt(rawPage, 10);
    if (!isFinite(raw) || raw < 1) redirect('/ofertas');
    if (raw > totalPages) redirect(`/ofertas?page=${totalPages}`);
  }

  const pageProducts = offers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) as Product[];

  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full">
      <JsonLd data={offersBreadcrumbSchema} />

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-4 sm:p-6 lg:p-8 mb-5 sm:mb-8">
        <nav className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-500 mb-3 truncate" aria-label="Breadcrumb">
          <Link href="/" className="text-slate-600 hover:text-navy transition-colors">Inicio</Link>
          <ChevronRight size={12} className="flex-shrink-0" />
          <span className="text-navy font-medium">Ofertas</span>
        </nav>
        <p className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600 mb-2">
          <Tag size={11} className="text-red-500" />
          Precios especiales · Barquisimeto
        </p>
        <h1 className="text-[1.6rem] sm:text-3xl md:text-[2.25rem] font-bold text-navy tracking-tight leading-[1.05]">
          Ofertas del Día
          {page >= 2 && (
            <span className="ml-2 text-lg sm:text-xl font-medium text-slate-400">— Página {page}</span>
          )}
        </h1>
        <p className="text-[13px] sm:text-sm text-slate-500 mt-2 max-w-xl">
          Productos con descuento real y stock disponible. Compra desde Barquisimeto con retiro en tienda o envío nacional.
        </p>
      </div>

      {total === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-10 text-center">
          <Sparkles size={28} className="mx-auto text-amber-400 mb-3" />
          <p className="text-navy font-semibold mb-1">Por ahora no hay ofertas activas</p>
          <p className="text-sm text-slate-500 mb-5">Vuelve pronto — actualizamos los precios seguido.</p>
          <Link href="/productos" className="inline-flex items-center justify-center rounded-xl border border-[#E6C200] bg-[#FFD700] px-5 py-2.5 text-sm font-black text-black hover:bg-[#FFE03A] transition-colors">
            Ver todo el catálogo
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {pageProducts.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4} />
            ))}
          </div>

          <PaginationBar page={page} totalPages={totalPages} basePath="/ofertas" />
        </>
      )}

      <RecentlyViewed limit={6} />
    </div>
  );
}
