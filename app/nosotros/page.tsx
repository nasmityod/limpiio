import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MapPin, Phone, Clock, ArrowRight,
  Store, Wallet, Truck, Navigation,
} from 'lucide-react';

/** Glyph de Instagram (lucide 1.x no exporta iconos de marca). */
const InstagramGlyph = ({ size = 17, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);
import { googleMapsBusinessUrl, googleMapsEmbedUrl } from '@/lib/google-maps';
import { readSeoLocal, describeOpeningHours } from '@/lib/seo-local';
import { readSettings } from '@/lib/data-store';
import { whatsappHref } from '@/lib/mundotech-social';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';
const PAGE_URL = `${SITE_URL}/nosotros`;

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Quiénes somos — la tienda detrás del letrero amarillo',
  description:
    'MundoTech es una tienda real de tecnología en el centro de Barquisimeto: gadgets, variedades y productos virales. Visítanos o escríbenos por WhatsApp.',
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'Quiénes somos — MundoTech Barquisimeto',
    description:
      'Una tienda real, con local físico verificable en Barquisimeto. Conectados Contigo.',
    url: PAGE_URL,
    locale: 'es_VE',
    type: 'website',
  },
};

export default async function NosotrosPage() {
  const [seo, settings] = await Promise.all([readSeoLocal(), readSettings()]);

  const mapQuery = `${seo.legalName}, ${seo.streetAddress}, ${seo.addressLocality}, ${seo.addressRegion}, Venezuela`;
  const mapOpenUrl = seo.googleMapsUrl || googleMapsBusinessUrl(mapQuery);
  const mapEmbedUrl = seo.googleMapsEmbed || googleMapsEmbedUrl(mapQuery);
  const hours = describeOpeningHours(seo);
  const waHref = whatsappHref(settings.phone, 'Hola MundoTech, leí su página "Quiénes somos" y quiero hacerles una pregunta.');

  const aboutSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: 'Quiénes somos — MundoTech',
    url: PAGE_URL,
    mainEntity: {
      '@type': 'ElectronicsStore',
      // P78/H54: mismo @id que el LocalBusiness global — una sola entidad local.
      '@id': `${SITE_URL}/#localbusiness`,
      name: settings.storeName,
      slogan: seo.slogan,
      telephone: settings.phone,
      email: settings.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: seo.streetAddress,
        addressLocality: seo.addressLocality,
        addressRegion: seo.addressRegion,
        addressCountry: 'VE',
      },
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Quiénes somos', item: PAGE_URL },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <div className="pb-14 w-full max-w-full space-y-10 sm:space-y-14">

        {/* Hero — el letrero de la tienda */}
        <section className="relative overflow-hidden rounded-2xl bg-navy text-white">
          <div className="absolute inset-0 circuit-bg opacity-50" aria-hidden />
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-yellow/10 blur-3xl" aria-hidden />

          <div className="relative px-6 py-12 sm:px-10 sm:py-16 lg:px-16">
            <nav className="flex items-center gap-2 text-[11px] text-white/50 mb-8" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-brand-yellow transition-colors">Inicio</Link>
              <span aria-hidden>/</span>
              <span className="text-white/80">Quiénes somos</span>
            </nav>

            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-brand-yellow">
              Conectados Contigo
            </p>
            <h1 className="mt-3 max-w-2xl text-balance text-[1.7rem] sm:text-4xl lg:text-[2.6rem] font-bold leading-[1.12] tracking-tight text-white">
              Somos la tienda detrás del letrero amarillo en el centro de Barquisimeto.
            </h1>
            <p className="mt-4 max-w-xl text-[14.5px] sm:text-base leading-relaxed text-white/75">
              MundoTech no es un marketplace ni una tienda fantasma: es un local
              real en el centro de Barquisimeto, atendido por gente que conoce
              cada producto del mostrador. Esta página web es nuestra vitrina;
              la tienda, nuestra casa.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <a
                href={mapOpenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-brand-yellowDk bg-brand-yellow px-5 text-sm font-black text-navy transition-all hover:bg-[#FFE03A] active:scale-[0.98]"
              >
                <Navigation size={15} aria-hidden /> Cómo llegar
              </a>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/15 active:scale-[0.98]"
              >
                <Phone size={15} aria-hidden /> Escríbenos por WhatsApp
              </a>
            </div>
          </div>
        </section>

        {/* Qué vendemos — en palabras de la tienda */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-navy">
              De todo un poco, elegido con criterio
            </h2>
            <div className="mt-4 space-y-4 text-[14.5px] leading-relaxed text-slate-600">
              <p>
                Vendemos tecnología y también lo que la gente realmente nos pide:
                audífonos, consolas y accesorios, pero igual la freidora de aire,
                la lámpara viral de TikTok o el regalo que salvó un cumpleaños a
                última hora. Si está en vitrina es porque alguien del equipo lo
                probó, lo revisó o respondió cincuenta preguntas sobre él por
                WhatsApp.
              </p>
              <p>
                Trabajamos con precios en dólares y bolívares a tasa del día,
                porque así se compra en Venezuela. Y como la tienda es física,
                cualquier cosa que veas en la web la puedes tocar, preguntar y
                comparar antes de llevártela.
              </p>
              <p className="font-medium text-navy">
                «Conectados Contigo» no es un slogan decorativo: es la forma en
                que atendemos — el mismo trato en el mostrador, por WhatsApp o
                en un pedido web.
              </p>
            </div>
          </div>

          {/* Por qué comprar aquí */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                icon: Store,
                title: 'Local físico verificable',
                desc: 'Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001. Búscanos en Google Maps o pasa a saludar.',
              },
              {
                icon: Clock,
                title: 'Retiro en tienda el mismo día',
                desc: 'Compra por la web y recoge en Carrera 21 cuando te convenga.',
              },
              {
                icon: Wallet,
                title: 'Pagos como pagamos aquí',
                desc: 'Pago Móvil, transferencia o Binance. En bolívares o dólares, a tasa del día.',
              },
              {
                icon: Truck,
                title: 'Retira o recibe',
                desc: 'Retiro en tienda gratis, delivery gratis en Barquisimeto (Centro y Este) y envíos por MRW, Zoom y Tealca.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellowSft text-navy">
                  <Icon size={18} aria-hidden />
                </span>
                <p className="mt-3 text-[14px] font-bold text-navy leading-snug">{title}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dónde estamos */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-soft flex flex-col">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-navy">
              Ven a visitarnos
            </h2>
            <div className="mt-5 space-y-4 text-[14px] text-slate-600">
              <div className="flex items-start gap-3">
                <MapPin size={17} className="mt-0.5 flex-shrink-0 text-brand-yellowDk" aria-hidden />
                <div>
                  <p className="font-semibold text-navy">{seo.streetAddress}</p>
                  <p className="text-slate-500">{seo.addressLocality}, estado {seo.addressRegion} — Venezuela</p>
                </div>
              </div>
              {hours.length > 0 && (
                <div className="flex items-start gap-3">
                  <Clock size={17} className="mt-0.5 flex-shrink-0 text-brand-yellowDk" aria-hidden />
                  <div className="space-y-0.5">
                    {hours.map((h) => (
                      <p key={h.day}>
                        <span className="font-semibold text-navy">{h.day}:</span> {h.hours}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Phone size={17} className="mt-0.5 flex-shrink-0 text-brand-yellowDk" aria-hidden />
                <p>
                  {settings.phone}
                  {settings.phone2 ? ` · ${settings.phone2}` : ''}
                </p>
              </div>
              {settings.instagram ? (
                <div className="flex items-start gap-3">
                  <InstagramGlyph size={17} className="mt-0.5 flex-shrink-0 text-brand-yellowDk" />
                  <a
                    href={settings.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-navy underline decoration-brand-yellow decoration-2 underline-offset-2"
                  >
                    @Mundotech39
                  </a>
                </div>
              ) : null}
            </div>

            <div className="mt-auto pt-6">
              <Link
                href="/productos"
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-navy px-5 text-sm font-bold text-white transition-all hover:bg-navy-700 active:scale-[0.98]"
              >
                Explorar todo el catálogo <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-soft min-h-[320px]">
            <iframe
              src={mapEmbedUrl}
              title={`Mapa: ${settings.storeName} en ${seo.addressLocality}`}
              className="h-full w-full min-h-[320px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </section>

        {/* Cómo se compra */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-10 shadow-soft">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-navy text-center">
            Comprar aquí es así de simple
          </h2>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                title: 'Elige cómo prefieras',
                desc: 'Arma tu pedido en la web, escríbenos por WhatsApp o ven directo a la tienda.',
              },
              {
                step: '2',
                title: 'Paga a tu manera',
                desc: 'Pago Móvil, transferencia o Binance. Subes el comprobante y nosotros lo verificamos.',
              },
              {
                step: '3',
                title: 'Retira o recibe',
                desc: 'Retiro en tienda el mismo día, delivery gratis en Barquisimeto (Centro y Este) o envío nacional por MRW, Zoom y Tealca.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-yellowDk bg-brand-yellow text-base font-black text-navy">
                  {step}
                </span>
                <p className="mt-3 text-[15px] font-bold text-navy">{title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 max-w-[260px] mx-auto">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
