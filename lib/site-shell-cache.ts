/**
 * site-shell-cache.ts — Lectura global cacheada para layout y footer.
 *
 * Unifica en un solo DTO cacheado todas las lecturas de AppConfig que el layout
 * raíz y el Footer necesitan (settings públicos, SEO local, contenido del sitio,
 * announcement, rutas de categorías). El layout llama una vez, recibe el DTO
 * completo y pasa a Footer por props — Footer nunca vuelve a Prisma.
 *
 * REGLAS:
 * - No incluye cookies/headers/session (serían inestables cacheables).
 * - No incluye datos bancarios/secretos (solo lo que necesita el shell visual).
 * - Fallback seguro si AppConfig no existe.
 * - Logger sin PII.
 *
 * Cache tags para invalidación:
 *   'site-shell'      — invalida todo el DTO (revalidación general).
 *   'settings'        — cuando cambian store settings.
 *   'site-content'    — cuando cambia contenido del sitio.
 *   'seo-local'       — cuando cambia SEO local.
 *   'announcement'    — cuando cambia la barra de anuncios.
 *   'categories'      — cuando cambian categorías (rutas de footer).
 */

import 'server-only';
import { unstable_cache } from 'next/cache';
import { readSettings } from '@/lib/data-store';
import { readSeoLocal, describeOpeningHours, type SeoLocal } from '@/lib/seo-local';
import { readSiteContent, type SiteContent } from '@/lib/site-content';
import { readAnnouncement, type Announcement } from '@/lib/announcement';
import { resolveCategoryPathFromProductCategory } from '@/lib/resolve-category-path';
import { buildFooterPaymentMethodLabels } from '@/lib/footer-payment-labels';
import { logInfo, logWarn } from '@/lib/safe-logger';

// ── Tags de caché ───────────────────────────────────────────────────────────

export const SHELL_CACHE_TAGS = [
  'site-shell',
  'settings',
  'store-settings',
  'site-content',
  'seo-local',
  'announcement',
  'categories',
] as const;

export const SHELL_CACHE_KEY = 'site-shell-data';
export const SHELL_CACHE_REVALIDATE = 300; // 5 minutos

export const CACHE_TAG_SITE_SHELL = 'site-shell';
export const CACHE_TAG_SETTINGS = 'settings';
export const CACHE_TAG_SITE_CONTENT = 'site-content';
export const CACHE_TAG_SEO_LOCAL = 'seo-local';
export const CACHE_TAG_ANNOUNCEMENT = 'announcement';
export const CACHE_TAG_CATEGORIES = 'categories';

// ── DTO público (sin datos bancarios) ──────────────────────────────────────

export type SiteShellFooterCategoryPaths = {
  accesoriosPath: string;
};

export type SiteShellContact = {
  phone: string;
  phone2: string;
  email: string;
  address: string;
  deliveryNote: string;
};

/**
 * DTO serializable con todo lo que layout.tsx y Footer.tsx necesitan.
 * Excluye: pagoMovil, transferencia, binancePayId, binanceQrUrl,
 * recipientValue, instructions y cualquier dato financiero privado.
 */
export type SiteShellData = {
  /** Anuncio de la barra superior. */
  announcement: Announcement;
  /** Campos públicos de settings (sin datos bancarios). */
  settings: {
    storeName: string;
    tagline: string;
    phone: string;
    phone2: string;
    email: string;
    address: string;
    instagram: string;
    facebook: string;
  };
  /** SEO local completo (es metadato público). */
  seoLocal: SeoLocal;
  /** Contenido del sitio completo. */
  siteContent: SiteContent;
  /** Rutas de categorías calculadas para el footer. */
  categoryPaths: SiteShellFooterCategoryPaths;
  /** Horarios formateados para el footer. */
  openingHours: { day: string; hours: string }[];
  /** Nombres públicos de métodos activos en web y/o WhatsApp. */
  paymentMethodLabels: string[];
};

// ── Función de lectura interna (raw, sin cache) ────────────────────────────

async function buildSiteShellData(): Promise<SiteShellData> {
  const [settings, seoLocal, siteContent, announcement, accesoriosPath] =
    await Promise.all([
      readSettings(),
      readSeoLocal(),
      readSiteContent(),
      readAnnouncement(),
      resolveCategoryPathFromProductCategory('Accesorios'),
    ]);

  const hours = describeOpeningHours(seoLocal);
  const paymentMethodLabels = buildFooterPaymentMethodLabels(settings);

  const dto: SiteShellData = {
    announcement,
    settings: {
      storeName: settings.storeName,
      tagline: settings.tagline,
      phone: settings.phone,
      phone2: settings.phone2,
      email: settings.email,
      address: settings.address,
      instagram: settings.instagram,
      facebook: settings.facebook,
    },
    seoLocal,
    siteContent,
    categoryPaths: { accesoriosPath },
    openingHours: hours,
    paymentMethodLabels,
  };

  return dto;
}

// ── Helper de contacto para AppContent ────────────────────────────────────

/**
 * Deriva el objeto `contact` que AppContent necesita.
 * Se llama con el `SiteShellData` ya resuelto, sin leer BD otra vez.
 */
export function buildContactFromShellData(data: SiteShellData): SiteShellContact {
  return {
    phone: data.settings.phone,
    phone2: data.settings.phone2,
    email: data.settings.email,
    address: data.settings.address,
    deliveryNote:
      data.siteContent.productTrust.find((t) => t.icon === 'truck')?.title ?? '',
  };
}

// ── Función cacheada (punto de entrada público) ────────────────────────────

/**
 * Lee todos los datos globales del shell (layout + footer) en una sola
 * llamada cacheada. Usa unstable_cache con revalidate=300 y 5 tags para
 * invalidación granular.
 *
 * No acepta cookies/headers/session — solo datos públicos globales.
 * Si la configuración falta, retorna fallbacks seguros.
 */
export const getCachedSiteShellData = unstable_cache(
  async (): Promise<SiteShellData> => {
    try {
      logInfo('site_shell_build', { route: 'lib/site-shell-cache' });
      return await buildSiteShellData();
    } catch (err) {
      logWarn('site_shell_fallback', {
        errorName: err instanceof Error ? err.name : 'UnknownError',
        route: 'lib/site-shell-cache',
      });

      const fallbackSeo: SeoLocal = {
        legalName: 'Mundo Tech',
        slogan: 'Conectados Contigo',
        streetAddress: '',
        addressLocality: 'Barquisimeto',
        addressRegion: 'Lara',
        postalCode: '3001',
        addressCountry: 'VE',
        geo: { latitude: 10.068, longitude: -69.312 },
        googleMapsUrl: '',
        googleMapsEmbed: '',
        openingHours: [],
        paymentAccepted: ['Cash', 'Transferencia', 'Pago Móvil'],
        priceRange: '$$',
        whatsapp: '',
        tiktok: '',
      };

      return {
        announcement: { active: false, text: '', link: '', bgColor: '#0B1220', textColor: '#FFFFFF' },
        settings: {
          storeName: 'MundoTech',
          tagline: '',
          phone: '',
          phone2: '',
          email: '',
          address: '',
          instagram: '',
          facebook: '',
        },
        seoLocal: fallbackSeo,
        siteContent: {
          heroFallback: { badge: '', title: '', subtitle: '', ctaText: 'Explorar catálogo', ctaLink: '/productos', imageUrl: '' },
          brandStrip: { enabled: true, slogan: 'CONECTADOS CONTIGO', note: '' },
          whatsapp: { enabled: true, phone: '', message: '' },
          productTrust: [{ icon: 'shield', title: 'Tienda en línea', sub: '' }],
          popup: { enabled: false, badge: '', title: '', text: '', ctaText: '', ctaLink: '/productos', imageUrl: '', frequencyDays: 7, delaySeconds: 6, endsAt: '' },
        },
        categoryPaths: { accesoriosPath: '/productos' },
        openingHours: [],
        paymentMethodLabels: [],
      };
    }
  },
  [SHELL_CACHE_KEY],
  {
    tags: [...SHELL_CACHE_TAGS],
    revalidate: SHELL_CACHE_REVALIDATE,
  },
);

/** Expuesto para tests unitarios (sin caché). */
export { buildSiteShellData as buildSiteShellDataForTests };
