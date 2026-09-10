/**
 * Schema, tipos y helpers PUROS de SEO Local — sin imports de Prisma para
 * que se puedan usar tanto en Server Actions como en Client Components.
 */
import { z } from 'zod';

const dayEnum = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
export const SEO_DAYS: z.infer<typeof dayEnum>[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const timeRegex = /^\d{2}:\d{2}$/;

export const seoLocalSchema = z.object({
  legalName:       z.string().min(1, 'Nombre legal requerido.'),
  slogan:          z.string().min(1, 'Eslogan requerido.').max(120),
  streetAddress:   z.string().min(1, 'Dirección requerida.'),
  addressLocality: z.string().min(1).default('Barquisimeto'),
  addressRegion:   z.string().min(1).default('Lara'),
  postalCode:      z.string().min(1).default('3001'),
  addressCountry:  z.string().min(1).default('VE'),
  geo: z.object({
    latitude:  z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  googleMapsUrl:   z.string().url().or(z.literal('')).optional(),
  googleMapsEmbed: z.string().url().or(z.literal('')).optional(),
  openingHours: z.array(z.object({
    days:   z.array(dayEnum).min(1),
    opens:  z.string().regex(timeRegex, 'Formato HH:MM'),
    closes: z.string().regex(timeRegex, 'Formato HH:MM'),
  })).default([]),
  paymentAccepted: z.array(z.string()).default(['Cash', 'Transferencia', 'Pago Móvil']),
  priceRange:      z.string().default('$$'),
  whatsapp:        z.string().optional().default(''),
  tiktok:          z.string().url().or(z.literal('')).optional(),
});

export type SeoLocal = z.infer<typeof seoLocalSchema>;

export const SEO_LOCAL_KEY = 'seo_local';

export const DEFAULT_SEO_LOCAL: SeoLocal = {
  legalName:       'Mundo Tech',
  slogan:          'Conectados Contigo',
  streetAddress:   'Carrera 21 con esquina calle 21, Centro',
  addressLocality: 'Barquisimeto',
  addressRegion:   'Lara',
  postalCode:      '3001',
  addressCountry:  'VE',
  geo: {
    latitude:  10.068287498832946,
    longitude: -69.3120556394341,
  },
  googleMapsUrl:   '',
  googleMapsEmbed: '',
  openingHours: [
    { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], opens: '08:30', closes: '17:30' },
    { days: ['Sat'], opens: '08:30', closes: '18:00' },
  ],
  paymentAccepted: ['Cash', 'Transferencia', 'Pago Móvil', 'Binance Pay'],
  priceRange:      '$$',
  whatsapp:        '',
  tiktok:          '',
};

const SCHEMA_ORG_DAY: Record<z.infer<typeof dayEnum>, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

export const DAY_LABEL_ES: Record<z.infer<typeof dayEnum>, string> = {
  Mon: 'Lun', Tue: 'Mar', Wed: 'Mié', Thu: 'Jue', Fri: 'Vie', Sat: 'Sáb', Sun: 'Dom',
};

export interface LocalBusinessSchemaOptions {
  siteUrl: string;
  pageUrl?: string;
  storeName: string;
  email?: string;
  phone?: string;
  description?: string;
  ogImage?: string;
  type?: 'LocalBusiness' | 'ElectronicsStore' | 'Store';
  sameAs?: string[];
}

export function buildLocalBusinessSchema(seo: SeoLocal, opts: LocalBusinessSchemaOptions) {
  const sameAs = (opts.sameAs ?? []).filter(Boolean);
  if (seo.tiktok) sameAs.push(seo.tiktok);

  return {
    '@context': 'https://schema.org',
    '@type': opts.type ?? 'LocalBusiness',
    name: opts.storeName,
    legalName: seo.legalName,
    slogan: seo.slogan,
    url: opts.pageUrl ?? opts.siteUrl,
    telephone: opts.phone ?? undefined,
    email: opts.email ?? undefined,
    logo: `${opts.siteUrl}/opengraph-image`,
    image: opts.ogImage ?? `${opts.siteUrl}/opengraph-image`,
    description: opts.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress:   seo.streetAddress,
      addressLocality: seo.addressLocality,
      addressRegion:   seo.addressRegion,
      postalCode:      seo.postalCode,
      addressCountry:  seo.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude:  seo.geo.latitude,
      longitude: seo.geo.longitude,
    },
    hasMap: seo.googleMapsUrl || undefined,
    openingHoursSpecification: seo.openingHours.map(h => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days.map(d => SCHEMA_ORG_DAY[d]),
      opens:  h.opens,
      closes: h.closes,
    })),
    priceRange:        seo.priceRange,
    currenciesAccepted: 'USD, VES',
    paymentAccepted:   seo.paymentAccepted.join(', '),
    areaServed: [
      { '@type': 'City',    name: seo.addressLocality },
      { '@type': 'State',   name: seo.addressRegion   },
      { '@type': 'Country', name: 'Venezuela'         },
    ],
    sameAs,
  };
}

export function describeOpeningHours(seo: SeoLocal): { day: string; hours: string }[] {
  return seo.openingHours.map(h => ({
    day:   h.days.map(d => DAY_LABEL_ES[d]).join(' · '),
    hours: `${h.opens} – ${h.closes}`,
  }));
}
