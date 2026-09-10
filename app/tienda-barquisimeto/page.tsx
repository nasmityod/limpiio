import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MapPin, Phone, Mail, Clock, ShieldCheck,
  Truck, RefreshCcw, Star, ArrowRight, Navigation,
} from 'lucide-react';
import { googleMapsBusinessUrl, googleMapsEmbedUrl } from '@/lib/google-maps';
import { readSeoLocal, buildLocalBusinessSchema, describeOpeningHours } from '@/lib/seo-local';
import { readSettings } from '@/lib/data-store';
import { resolveCategoryPathFromProductCategory } from '@/lib/resolve-category-path';
import JsonLd from '@/app/components/JsonLd';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';
const PAGE_URL = `${SITE_URL}/tienda-barquisimeto`;

export const revalidate = 300;

export const metadata: Metadata = {
  // H26: marca unificada "MundoTech" (sin espacio) + título absoluto para que
  // el template del layout no duplique la marca (H02/P08).
  title: { absolute: 'Tienda de variedades y tecnología en Barquisimeto | MundoTech' },
  description:
    'MundoTech en el centro de Barquisimeto: tecnología, hogar, cocina, fitness, salud y más. Precios en USD y Bs, retiro en tienda y envíos a toda Venezuela.',
  keywords: [
    'tienda de variedades Barquisimeto',
    'tienda tecnología Barquisimeto',
    'productos para el hogar Barquisimeto',
    'artículos de cocina Barquisimeto',
    'MundoTech Barquisimeto',
    'variedades Lara Venezuela',
  ],
  alternates: { canonical: PAGE_URL },
  // og:image heredada de app/opengraph-image.tsx (imagen de marca generada)
  openGraph: {
    title: 'MundoTech Barquisimeto — Conectados Contigo',
    description:
      'Tu tienda en el Centro de Barquisimeto: tecnología, hogar, cocina, fitness y más. USD/Bs., retiro en tienda y envíos nacionales.',
    url: PAGE_URL,
    siteName: 'MundoTech',
    locale: 'es_VE',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MundoTech Barquisimeto — Conectados Contigo',
    description:
      'Variedades en Barquisimeto: tecnología, hogar, cocina y más. USD/Bs., retiro en tienda y envíos nacionales.',
  },
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio',             item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Tienda Barquisimeto', item: PAGE_URL },
  ],
};

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: 'Garantía de 7 días',     desc: 'En electrónica general; con factura y caja original.' },
  { icon: Truck,       title: 'Envíos nacionales', desc: 'MRW, Zoom y Tealca (cobro a destino). Delivery gratis en Barquisimeto (Centro y Este).' },
  { icon: RefreshCcw,  title: 'Devolución en 7 días',  desc: 'Electrónica general con factura y caja original.' },
  { icon: Star,        title: 'Atención personalizada', desc: 'Nuestro equipo te asesora para elegir el mejor producto para ti.' },
];

// P46/H14: cada tarjeta enlaza a la URL canónica /categoria/[slug] resuelta
// contra la tabla Category (fallback /productos si no existe la categoría).
const CATEGORY_CARDS = [
  { label: 'Gadgets y accesorios', category: 'Accesorios' },
  { label: 'Computadoras',         category: 'Computadoras' },
  { label: 'Electrodomésticos',    category: 'Electrodomesticos' },
  { label: 'Audio y video',        category: 'Audio' },
] as const;

function formatPhoneLink(phone: string | undefined | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('58')) return `+${digits}`;
  if (digits.startsWith('0')) return `+58${digits.slice(1)}`;
  return `+${digits}`;
}

export default async function TiendaBarquisimetoPage() {
  const [seo, settings, ...categoryPaths] = await Promise.all([
    readSeoLocal(),
    readSettings(),
    ...CATEGORY_CARDS.map((c) => resolveCategoryPathFromProductCategory(c.category)),
  ]);
  const categoryLinks = [
    ...CATEGORY_CARDS.map((c, i) => ({ label: c.label, href: categoryPaths[i] })),
    { label: 'Todo el catálogo', href: '/productos' },
  ];
  const sameAs = [settings.instagram, settings.facebook].filter(Boolean) as string[];

  const mapQuery = `${seo.legalName}, ${seo.streetAddress}, ${seo.addressLocality}, ${seo.addressRegion}, Venezuela`;
  const mapOpenUrl  = seo.googleMapsUrl   || googleMapsBusinessUrl(mapQuery);
  const mapEmbedUrl = seo.googleMapsEmbed || googleMapsEmbedUrl(mapQuery);
  const hours = describeOpeningHours(seo);

  const localBusinessSchema = {
    ...buildLocalBusinessSchema(seo, {
      siteUrl: SITE_URL,
      pageUrl: PAGE_URL,
      storeName: settings.storeName,
      email: settings.email,
      phone: settings.phone,
      description:
        'Tecnología y gadgets en Barquisimeto, Lara. Envíos por MRW, Zoom y Tealca, USD/Bs., retiro en tienda.',
      type: 'ElectronicsStore',
      sameAs,
    }),
    // H29: mismo @id que el LocalBusiness del layout — Google consolida ambas
    // declaraciones como UNA entidad local (ElectronicsStore ⊂ LocalBusiness).
    '@id': `${SITE_URL}/#localbusiness`,
    alternateName: settings.storeName,
  };

  return (
    <>
      <JsonLd data={[localBusinessSchema, breadcrumbSchema]} />

      <div className="pb-12 w-full max-w-full space-y-8 sm:space-y-10">

        {/* Hero local */}
        <section className="relative overflow-hidden rounded-2xl bg-navy text-white px-6 py-10 sm:px-10 sm:py-14 lg:px-16 lg:py-20">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#FFD700]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-[#FFD700]/5 blur-3xl" />

          <nav className="flex items-center gap-2 text-[11px] text-white/50 mb-6" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-brand-yellow transition-colors">Inicio</Link>
            <span>/</span>
            <span className="text-white/80">Tienda Barquisimeto</span>
          </nav>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E6C200]/50 bg-[#FFD700]/10 px-3 py-1 text-[11px] font-semibold text-[#FFD700] mb-4">
            <MapPin size={11} />
            {seo.addressLocality} · Estado {seo.addressRegion} · Venezuela
          </span>

          <h1 className="text-[2rem] sm:text-4xl md:text-[3rem] font-bold tracking-tight leading-[1.1] text-balance max-w-2xl">
            {settings.storeName} —{' '}
            <span className="text-[#FFD700]">{seo.slogan}</span>
          </h1>

          <p className="mt-4 text-[15px] sm:text-base text-white/75 max-w-xl leading-relaxed">
            Somos tu tienda de referencia en el centro de {seo.addressLocality} para{' '}
            <strong className="text-white">tecnología, gadgets y accesorios</strong>
            . Precios USD/Bs.,{' '}
            <strong className="text-white">retiro en tienda</strong> y envíos nacionales.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/productos"
              className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-xl bg-[#FFD700] text-navy text-sm font-black border border-[#E6C200] hover:bg-[#FFE03A] transition-colors shadow-md"
            >
              Ver catálogo <ArrowRight size={16} />
            </Link>
            <a
              href={mapOpenUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-xl border border-white/25 bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors backdrop-blur-sm"
            >
              <Navigation size={15} /> Cómo llegar
            </a>
          </div>
        </section>

        {/* Info + mapa */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-6 sm:p-8 space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-navy tracking-tight">
              Encuéntranos en {seo.addressLocality}
            </h2>

            <address className="not-italic space-y-4">
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-[#FFD700] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-navy">Dirección</p>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {seo.streetAddress}<br />
                    {seo.addressLocality}, Estado {seo.addressRegion} — Venezuela
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone size={18} className="text-[#FFD700] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-navy">Teléfonos</p>
                  {settings.phone && (
                    <a
                      href={`tel:${formatPhoneLink(settings.phone)}`}
                      className="text-sm text-slate-600 hover:text-navy transition-colors block"
                    >
                      {settings.phone}
                    </a>
                  )}
                  {settings.phone2 && (
                    <a
                      href={`tel:${formatPhoneLink(settings.phone2)}`}
                      className="text-sm text-slate-600 hover:text-navy transition-colors block mt-0.5"
                    >
                      {settings.phone2}
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail size={18} className="text-[#FFD700] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-navy">Correo</p>
                  <a
                    href={`mailto:${settings.email}`}
                    className="text-sm text-slate-600 hover:text-navy transition-colors"
                  >
                    {settings.email}
                  </a>
                </div>
              </div>
            </address>

            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-[#FFD700]" />
                <h3 className="text-sm font-bold text-navy uppercase tracking-wide">
                  Horario de atención
                </h3>
              </div>
              {hours.length === 0 ? (
                <p className="text-sm text-slate-500">Horario no disponible.</p>
              ) : (
                <ul className="space-y-2">
                  {hours.map(({ day, hours }, i) => (
                    <li key={i} className="flex justify-between text-sm">
                      <span className="text-slate-600">{day}</span>
                      <span className="font-semibold text-navy">{hours}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 pt-5">
              <p className="text-sm font-bold text-navy uppercase tracking-wide mb-3">
                Métodos de pago aceptados
              </p>
              <div className="flex flex-wrap gap-2">
                {seo.paymentAccepted.map((m) => (
                  <span key={m} className="bg-slate-100 text-navy text-[11px] font-semibold px-2.5 py-1 rounded-lg">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl overflow-hidden border border-slate-200/80 shadow-soft min-h-[360px] lg:min-h-0">
            <iframe
              title={`Ubicación ${settings.storeName}`}
              src={mapEmbedUrl}
              width="100%"
              height="100%"
              style={{ border: 0, minHeight: '360px' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </section>
        </div>

        <section aria-labelledby="trust-heading">
          <h2 id="trust-heading" className="text-xl sm:text-2xl font-bold text-navy tracking-tight mb-5">
            ¿Por qué comprar en {settings.storeName}?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-5 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF8D1] border border-[#E6C200]/40 flex items-center justify-center text-[#9a7b00]">
                  <Icon size={18} />
                </div>
                <p className="text-sm font-bold text-navy">{title}</p>
                <p className="text-[13px] text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="text-xl sm:text-2xl font-bold text-navy tracking-tight mb-2">
            Lo que encontrarás en nuestra tienda
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            Tecnología práctica y gadgets con envíos y retiro en tienda.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categoryLinks.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="group flex items-center justify-between bg-white rounded-xl border border-slate-200/80 shadow-soft px-4 py-3.5 text-sm font-semibold text-navy hover:border-[#E6C200] hover:bg-[#FFFBEA] transition-all"
              >
                {label}
                <ArrowRight size={14} className="text-slate-300 group-hover:text-[#9a7b00] transition-colors" />
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-navy rounded-2xl px-6 py-10 sm:px-10 sm:py-12 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            ¿Listo para visitar {settings.storeName}?
          </h2>
          <p className="text-white/70 text-sm max-w-md mx-auto mb-6">
            Encuéntranos en el corazón de {seo.addressLocality}. Te esperamos con el mejor catálogo
            de tecnología del Estado {seo.addressRegion}.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={mapOpenUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-xl bg-[#FFD700] text-navy text-sm font-black border border-[#E6C200] hover:bg-[#FFE03A] transition-colors shadow-md"
            >
              <Navigation size={15} /> Ver en Google Maps
            </a>
            <Link
              href="/productos"
              className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-xl border border-white/25 bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              Ver catálogo online <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
