import dynamic from 'next/dynamic';
import HomeHeroCyber from '@/app/components/HomeHeroCyber';
import PromoBanners from '@/app/components/PromoBanners';
import DiscoverMosaic from '@/app/components/DiscoverMosaic';
import CategoryRow from '@/app/components/CategoryRow';
import ProductShelf from '@/app/components/ProductShelf';
import Benefits, { type BenefitItem } from '@/app/components/Benefits';
import HomeFreeShippingStrip from '@/app/components/HomeFreeShippingStrip';
import PromotionLink from '@/app/components/PromotionLink';
import { DEFAULT_SITE_CONTENT } from '@/lib/site-content';
import { DEFAULT_SETTINGS } from '@/lib/data-store';
import type { SiteContent } from '@/lib/site-content-schema';
import type { StoreSettings } from '@/lib/data-store';
import {
  getCachedNewestProducts,
  getCachedFlashDeals,
  getFeaturedProductsByIds,
  getCategoryShelvesForHome,
  getCachedHeroBanners,
  getCachedHomePromoBanners,
  getCachedHomeDiscoverBanners,
  getCachedHomeFeaturedCategories,
  getCachedCtaBanner,
  getCachedHomePromotions,
  getCachedHomepageConfig,
  getCachedHomeSiteContent,
  getCachedHomeSettings,
  type HomeCategoryShelfResolved,
  type HomeShelfProduct,
} from '@/lib/home-cache';
import {
  DEFAULT_HOMEPAGE_FREE_SHIPPING,
  DEFAULT_HOMEPAGE_SHELVES,
  SHELF_BADGE_COLORS,
  SHELF_VIEW_ALL,
  type HomeShelfKey,
  type HomepageFreeShippingConfig,
  type HomepageShelvesConfig,
} from '@/lib/homepage-config';
import { buildHomeShelfSections } from '@/lib/home-sections';
import Image from 'next/image';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const Promotions = dynamic(() => import('@/app/components/Promotions'));

// PRD-140 — ISR: 5 min máximo de obsolescencia para precio/stock visibles.
export const revalidate = 300;

/**
 * Nº de tarjetas de la primera estantería que se cargan con prioridad alta
 * (priority → fetchpriority="high" + preload + sin lazy). Dos cubren el
 * elemento LCP en móvil (~2,2 tarjetas visibles a 44vw) sin saturar la red.
 */
const LCP_PRIORITY_ITEMS = 2;

export const metadata: Metadata = {
  title: { absolute: 'MundoTech Barquisimeto | Tecnología, gadgets y variedades' },
  description:
    'Tienda de variedades en Barquisimeto: tecnología, gadgets, hogar, cocina, fitness, salud y cuidado personal. Paga en USD o Bs y recibe en toda Venezuela.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'MundoTech Barquisimeto | Tecnología, gadgets y variedades',
    description:
      'Tecnología, hogar, cocina, fitness y mucho más en Barquisimeto. Paga en USD o Bs. Envíos a toda Venezuela.',
    url: '/',
    siteName: 'MundoTech',
    locale: 'es_VE',
    type: 'website',
  },
};

interface CtaBannerData {
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  label: string | null;
  ctaText: string | null;
  link: string | null;
}

function buildBenefitsFallback(
  siteContent: SiteContent,
  settings: StoreSettings,
): BenefitItem[] {
  const trustItems: BenefitItem[] = siteContent.productTrust.map((t) => ({
    title: t.title,
    sub: t.sub,
  }));
  const whatsappItem: BenefitItem | null = settings.phone
    ? {
        title: 'WhatsApp directo con el equipo',
        sub: `${settings.phone} · te respondemos rápido`,
      }
    : null;
  const ordered = [
    ...trustItems.slice(0, 2),
    ...(whatsappItem ? [whatsappItem] : []),
    ...trustItems.slice(2),
  ];
  return ordered.slice(0, 4);
}

async function getData() {
  try {
    const [
      newestProducts,
      flashDeals,
      heroBanners,
      promoBanners,
      discoverBanners,
      featuredCategories,
      ctaBannerRow,
      activePromotions,
      homepageConfig,
      siteContent,
      settings,
    ] = await Promise.all([
      getCachedNewestProducts(),
      getCachedFlashDeals(),
      getCachedHeroBanners(),
      getCachedHomePromoBanners(),
      getCachedHomeDiscoverBanners(),
      getCachedHomeFeaturedCategories(),
      getCachedCtaBanner(),
      getCachedHomePromotions(),
      getCachedHomepageConfig(),
      getCachedHomeSiteContent(),
      getCachedHomeSettings(),
    ]);

    const shelvesConfig = homepageConfig.shelvesConfig;
    const [featuredProducts, categoryShelves] = await Promise.all([
      getFeaturedProductsByIds(shelvesConfig.featuredProductIds),
      getCategoryShelvesForHome(shelvesConfig.categoryShelves),
    ]);

    return {
      newestProducts,
      flashDeals,
      featuredProducts,
      categoryShelves,
      heroBanners,
      promoBanners,
      discoverBanners,
      featuredCategories,
      ctaBannerRow,
      activePromotions,
      shelvesConfig,
      benefitsConfig: homepageConfig.benefitsConfig,
      freeShippingConfig: homepageConfig.freeShippingConfig,
      siteContent,
      settings,
    };
  } catch (error) {
    console.error('[home] getData falló — se renderiza con fallbacks seguros:', error);
    return {
      newestProducts: [] as HomeShelfProduct[],
      flashDeals: [] as HomeShelfProduct[],
      featuredProducts: [] as HomeShelfProduct[],
      categoryShelves: [] as HomeCategoryShelfResolved[],
      heroBanners: [],
      promoBanners: [],
      discoverBanners: [],
      featuredCategories: [],
      ctaBannerRow: null,
      activePromotions: [],
      shelvesConfig: DEFAULT_HOMEPAGE_SHELVES,
      benefitsConfig: null,
      freeShippingConfig: DEFAULT_HOMEPAGE_FREE_SHIPPING,
      siteContent: DEFAULT_SITE_CONTENT,
      settings: DEFAULT_SETTINGS,
    };
  }
}

function CtaBanner({ data }: { data: CtaBannerData | null }) {
  const title = data?.title ?? 'Lo que ves aquí, lo tenemos en la tienda.';
  const subtitle =
    data?.subtitle ??
    'Catálogo con stock real del local en Carrera 21 con esquina calle 21, Centro. Si lo quieres ya, pásate por la tienda; si no, te lo enviamos.';
  const badge = data?.label ?? 'Catálogo completo · Barquisimeto';
  const ctaText = data?.ctaText ?? 'Explorar todo el catálogo';
  const link = data?.link ?? '/productos';
  const img = data?.imageUrl ?? '';
  const promotion = {
    promotion_id: 'home-cta-banner',
    promotion_name: title,
    creative_name: img ? 'cta-banner-image' : 'cta-banner-default',
    creative_slot: 'home_cta_banner',
  };

  return (
    <div className="relative mt-6 sm:mt-8 overflow-hidden card-elevated-lg">
      {img ? (
        <Image
          src={img}
          alt="Tecnología MundoTech"
          fill
          sizes="100vw"
          quality={80}
          className="object-cover opacity-[0.07]"
        />
      ) : null}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 sm:h-72 sm:w-72 rounded-full bg-[#FFD700]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 sm:h-56 sm:w-56 rounded-full bg-navy/10 blur-2xl" />

      <div className="relative flex flex-col items-center justify-between gap-4 sm:gap-5 px-5 py-7 sm:flex-row sm:px-10 sm:py-10 lg:px-12 lg:py-12">
        <div className="text-center sm:text-left w-full sm:w-auto sm:flex-1">
          <span className="mb-2 sm:mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#E6C200]/60 bg-[#FFF8D1] px-3 py-1 text-[10px] sm:text-[11px] font-semibold text-amber-800">
            <Sparkles size={11} className="text-amber-700" aria-hidden="true" />
            {badge}
          </span>
          <h2 className="text-balance text-[1.25rem] xs:text-[1.4rem] sm:text-2xl md:text-3xl lg:text-[2.25rem] font-bold tracking-tight text-navy leading-tight">
            {title}
          </h2>
          <p className="mt-2 max-w-lg text-[13px] sm:text-[14px] font-medium text-slate-600 mx-auto sm:mx-0">
            {subtitle}
          </p>
        </div>
        <PromotionLink
          href={link}
          promotion={promotion}
          className="btn-mundotech-shimmer w-full sm:w-auto inline-flex min-h-[52px] flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E6C200] bg-[#FFD700] px-6 sm:px-7 text-[13px] sm:text-sm font-black text-black shadow-md transition-all duration-300 active:scale-[0.98] hover:bg-[#FFE03A]"
        >
          {ctaText} <ArrowRight size={16} />
        </PromotionLink>
      </div>
    </div>
  );
}

function renderCategoryShelf(
  shelf: HomeCategoryShelfResolved,
  priorityFirstItems: number,
): ReactNode {
  if (shelf.products.length === 0) return null;

  return (
    <ProductShelf
      key={`shelf-category-${shelf.categoryId}`}
      listId={`home-category-${shelf.slug}`}
      badge={shelf.badge || shelf.name}
      badgeColor="yellow"
      title={shelf.title}
      subtitle={shelf.subtitle || undefined}
      products={shelf.products}
      viewAllHref={`/categoria/${shelf.slug}`}
      viewAllLabel={`Ver todo en ${shelf.name}`}
      viewAllShortLabel="Ver todos"
      theme="light"
      maxItems={18}
      priorityFirstItems={priorityFirstItems}
    />
  );
}

function renderShelf(opts: {
  key: HomeShelfKey;
  config: HomepageShelvesConfig;
  products: HomeShelfProduct[];
  priorityFirstItems: number;
}): ReactNode {
  const settings = opts.config.shelves[opts.key];
  if (!settings.enabled) return null;
  if (opts.products.length === 0) return null;

  const view = SHELF_VIEW_ALL[opts.key];
  return (
    <ProductShelf
      key={`shelf-${opts.key}`}
      listId={`home-${opts.key}`}
      badge={settings.badge}
      badgeColor={SHELF_BADGE_COLORS[opts.key]}
      title={settings.title}
      subtitle={settings.subtitle || undefined}
      products={opts.products}
      viewAllHref={view.href}
      viewAllLabel={view.label}
      viewAllShortLabel={view.shortLabel}
      theme="light"
      maxItems={8}
      priorityFirstItems={opts.priorityFirstItems}
    />
  );
}

const HomePage = async () => {
  const {
    newestProducts,
    flashDeals,
    featuredProducts,
    categoryShelves,
    heroBanners,
    promoBanners,
    discoverBanners,
    featuredCategories,
    ctaBannerRow,
    activePromotions,
    shelvesConfig,
    benefitsConfig,
    freeShippingConfig,
    siteContent,
    settings,
  } = await getData();

  const benefitsItems =
    benefitsConfig && benefitsConfig.length > 0
      ? benefitsConfig
      : buildBenefitsFallback(siteContent, settings);

  const productByShelf: Record<HomeShelfKey, HomeShelfProduct[]> = {
    offers: flashDeals,
    newest: newestProducts,
    featured: featuredProducts,
  };

  /*
   * PERF-2026-08 — Descubrimiento del recurso LCP.
   * Lighthouse (móvil) identificó como elemento LCP la PRIMERA imagen de la
   * primera estantería con productos; se servía con loading="lazy" y sin
   * fetchpriority, produciendo 617 ms de "resource load delay".
   * Damos prioridad alta únicamente a las 2 primeras tarjetas de esa
   * estantería (no a todas: ver docs/, evita competencia de red).
   * `buildHomeShelfSections` respeta este orden, así que la primera con
   * productos es la primera que se pinta.
   */
  /*
   * PERF-2026-08 — Descubrimiento del recurso LCP.
   * Lighthouse (móvil) identificó como elemento LCP la PRIMERA imagen de la
   * primera estantería con productos; se servía con loading="lazy" y sin
   * fetchpriority, produciendo 617 ms de "resource load delay".
   * Damos prioridad alta únicamente a las 2 primeras tarjetas de esa
   * estantería (no a todas: evita competencia de red — ver docs/).
   * `buildHomeShelfSections` respeta este orden, así que la primera con
   * productos es la primera que se pinta.
   */
  const builtInDescriptors = shelvesConfig.order.map((key) => {
    const settingsRow = shelvesConfig.shelves[key];
    const products = settingsRow.enabled ? productByShelf[key] : [];
    return {
      key,
      products,
      hasProducts: settingsRow.enabled && products.length > 0,
    };
  });

  const categoryDescriptors = categoryShelves.map((shelf) => ({
    key: `category:${shelf.categoryId}`,
    shelf,
    hasProducts: shelf.products.length > 0,
  }));

  /** Clave de la primera estantería que realmente pinta productos (o null). */
  const lcpShelfKey =
    [...builtInDescriptors, ...categoryDescriptors].find((d) => d.hasProducts)?.key ?? null;

  const builtInSlots = builtInDescriptors.map((d) => ({
    key: d.key,
    hasProducts: d.hasProducts,
    node: renderShelf({
      key: d.key,
      config: shelvesConfig,
      products: d.products,
      priorityFirstItems: d.key === lcpShelfKey ? LCP_PRIORITY_ITEMS : 0,
    }),
  }));

  const categorySlots = categoryDescriptors.map((d) => ({
    key: d.key,
    hasProducts: d.hasProducts,
    node: renderCategoryShelf(d.shelf, d.key === lcpShelfKey ? LCP_PRIORITY_ITEMS : 0),
  }));

  const shelfSlots = [...builtInSlots, ...categorySlots];

  const midSections = buildHomeShelfSections({
    shelves: shelfSlots,
    discover: <DiscoverMosaic key="discover" banners={discoverBanners} />,
    categories: (
      <CategoryRow key="categories" categories={featuredCategories} />
    ),
    promotions: (
      <div key="promotions" className="mt-6 sm:mt-8">
        <Promotions
          promotions={
            activePromotions.length > 0 ? activePromotions : undefined
          }
        />
      </div>
    ),
  });

  const fs: HomepageFreeShippingConfig = freeShippingConfig;

  return (
    <div className="w-full max-w-full">
      <div className="relative left-1/2 w-screen max-w-none -translate-x-1/2 sm:left-auto sm:w-full sm:max-w-full sm:translate-x-0">
        <div className="-mt-5 sm:-mt-2">
          <HomeHeroCyber
            slides={heroBanners.length > 0 ? heroBanners : undefined}
            fallback={siteContent.heroFallback}
            brandStrip={siteContent.brandStrip}
            priorityImages={true}
          />
        </div>
      </div>

      <div className="mt-4 sm:mt-6">
        <PromoBanners banners={promoBanners} />
      </div>

      <div className="-mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full mt-4 sm:mt-6">
        <div className="overflow-hidden rounded-none border-y border-border bg-surface-muted sm:rounded-2xl sm:border sm:shadow-soft">
          <Benefits items={benefitsItems} />
        </div>
      </div>

      {fs.enabled ? <HomeFreeShippingStrip text={fs.text} /> : null}

      <div className="w-full max-w-full overflow-x-hidden mt-5 sm:mt-8">
        <div className="w-full max-w-full pb-12 pt-1 sm:pt-2">
          {midSections}
          <CtaBanner data={ctaBannerRow} />
        </div>
      </div>
    </div>
  );
};

export default HomePage;
