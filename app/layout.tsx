import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AuthProvider from "./components/AuthProvider";
import { CartProvider } from "../context/CartContext";
import { WishlistProvider } from "../context/WishlistContext";
import { ProductProvider } from "../context/ProductContext";
import { ExchangeRateProvider } from "../context/ExchangeRateContext";
import AppContent from "./AppContent";
import Footer from "./components/Footer";
import AppLayoutShell from "./components/AppLayoutShell";
import AnnouncementBar from "./components/AnnouncementBar";
import DeferredClientWidgets from "./components/DeferredClientWidgets";
import CookieConsent from "./components/CookieConsent";
import ChunkErrorReloader from "@/components/ChunkErrorReloader";
import JsonLd from "./components/JsonLd";
import { Toaster } from "@/components/ui/Toaster";
import MotionProvider from "@/components/MotionProvider";
import { buildLocalBusinessSchema } from "@/lib/seo-local";
import { getCachedSiteShellData, buildContactFromShellData } from "@/lib/site-shell-cache";
import { googleMapsBusinessUrl } from "@/lib/google-maps";
import { getExchangeRateWithTimestamp } from "@/lib/load-exchange-rate-ssr";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mundotechve.com";
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "";

// Jost es la tipografía de marca declarada en el sistema de diseño; antes se
// referenciaba en CSS sin cargarse nunca (el sitio caía a Arial en silencio).
const jost = Jost({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jost",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0B1220",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // H02 (P08): las páginas que ya llevan marca usan `title.absolute`;
  // el resto hereda el sufijo "| MundoTech" una sola vez vía template.
  title: {
    default: "MundoTech | Tecnología, hogar y variedades en Barquisimeto",
    template: "%s | MundoTech",
  },
  description:
    "Tienda de variedades en Barquisimeto: tecnología, gadgets, hogar, cocina, fitness, salud y cuidado personal. Precios en USD y Bs, retiro en tienda y envíos a toda Venezuela.",
  keywords: [
    "tienda de variedades Barquisimeto",
    "tecnología Barquisimeto",
    "productos para el hogar Venezuela",
    "artículos de cocina Barquisimeto",
    "fitness y gym Venezuela",
    "salud y cuidado personal Barquisimeto",
    "herramientas y automotriz Venezuela",
    "productos virales Barquisimeto",
    "MundoTech",
  ],
  authors: [{ name: "MundoTech", url: SITE_URL }],
  creator: "MundoTech",
  publisher: "MundoTech",
  // H03: sin canonical global — cada página indexable declara el suyo.
  // Heredar el canonical de la raíz hacía que /cart, /login, /account, etc.
  // apuntaran a la home como URL canónica (consolidación errónea de señales).
  // La imagen og:image / twitter:image la inyecta automáticamente
  // app/opengraph-image.tsx (generada con la marca; el antiguo
  // /og-default.jpg no existía y rompía las previews sociales).
  openGraph: {
    type: "website",
    locale: "es_VE",
    url: SITE_URL,
    siteName: "MundoTech",
    title: "MundoTech | Tecnología, hogar y variedades en Barquisimeto",
    description:
      "Tecnología, hogar, cocina, fitness y mucho más en Barquisimeto. USD/Bs., retiro en tienda y envíos a toda Venezuela.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MundoTech | Tecnología, hogar y variedades en Barquisimeto",
    description:
      "Variedades en Barquisimeto: tecnología, hogar, cocina y más. Retiro en tienda y envíos a toda Venezuela.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  // iOS "Añadir a pantalla de inicio": título corto y modo standalone.
  // (Los iconos PNG/maskable van en manifest.ts + app/apple-icon.png.)
  appleWebApp: {
    capable: true,
    title: "MundoTech",
    statusBarStyle: "default",
  },
  // H24: solo emitir el meta de verificación cuando la env var existe
  // (un content="" vacío no verifica Search Console y ensucia el head).
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
    : {}),
};

// ── Schemas globales: WebSite + LocalBusiness ───────────────────────────────
// @id estables (P78/H54): permiten que Google consolide WebSite ↔ Organization
// ↔ LocalBusiness ↔ Product (seller) como una sola entidad de marca.
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "MundoTech",
  url: SITE_URL,
  inLanguage: "es-VE",
  description:
    "Tienda de variedades en Barquisimeto, Lara — Venezuela: tecnología, hogar, cocina, fitness, salud y más.",
  publisher: { "@id": `${SITE_URL}/#organization` },
  // H08 (P64): el SearchAction apunta a la búsqueda real del sitio (/buscar),
  // la misma que usan SearchBar y SearchMobileOverlay.
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/buscar?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SESIÓN 15: los datos globales del shell se leen en una única llamada
  // cacheada (unstable_cache, revalidate=300). Footer recibe estos mismos
  // datos por props, duplicando cero lecturas de BD.
  // Sin cookies()/headers() aquí: el layout raíz debe poder cachearse (ISR/estático).
  // Lo per-usuario (consentimiento, dismiss del aviso, badge carrito, sesión) se
  // resuelve en Client Components tras hidratar — ver CookieConsent, AnnouncementBarClient, Navbar.
  const shellData = await getCachedSiteShellData();
  const { announcement, settings, seoLocal: seo, siteContent } = shellData;
  const sameAs = [settings.instagram, settings.facebook].filter(Boolean) as string[];

  const localBusinessSchema = {
    ...buildLocalBusinessSchema(seo, {
      siteUrl: SITE_URL,
      storeName: settings.storeName,
      email: settings.email,
      phone: settings.phone,
      description:
        "Tienda de variedades en Lara y Barquisimeto: tecnología, hogar, cocina, fitness y más. Envíos por MRW, Zoom y Tealca, USD/Bs., retiro en tienda.",
      sameAs,
    }),
    // H29/P24: mismo @id en todas las páginas — una sola entidad local.
    "@id": `${SITE_URL}/#localbusiness`,
  };

  // Si el admin no llenó el URL del mapa, usamos el helper con la dirección viva.
  if (!localBusinessSchema.hasMap) {
    localBusinessSchema.hasMap = googleMapsBusinessUrl(
      `${seo.legalName}, ${seo.streetAddress}, ${seo.addressLocality}, ${seo.addressRegion}, Venezuela`,
    );
  }

  // Organization: potencia la entidad de marca, el logo y el panel de conocimiento.
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: settings.storeName,
    url: SITE_URL,
    logo: `${SITE_URL}/opengraph-image`,
    image: `${SITE_URL}/opengraph-image`,
    ...(settings.email ? { email: settings.email } : {}),
    ...(settings.phone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            telephone: settings.phone,
            contactType: "customer service",
            areaServed: "VE",
            availableLanguage: ["es"],
          },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  // SESIÓN 17: leer tasa actual con timestamp para hidratación del provider
  const { rate: initialRate, updatedAt: initialUpdatedAt } = await getExchangeRateWithTimestamp();

  return (
    <html lang="es" data-scroll-behavior="smooth" className={jost.variable}>
      <body className="bg-white text-navy antialiased nums" suppressHydrationWarning>
        {/*
          Meta Pixel base code (recomendación oficial: en <head> de todas las páginas).
          strategy=beforeInteractive → Next lo inyecta en el <head> del HTML inicial
          del layout raíz. Consent Mode: revoke por defecto; CookieConsent hace
          grant + PageView solo tras "Aceptar".
        */}
        {META_PIXEL_ID ? (
          <Script id="meta-pixel" strategy="beforeInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];
              /* PERF-2026-08: el stub queda disponible de forma SÍNCRONA (fbq
                 existe y encola en n.queue), pero la descarga de fbevents.js
                 (~105 KiB, ~460 ms de hilo principal) se aplaza a tiempo ocioso.
                 Al cargar, el propio SDK vacía n.queue: no se pierde ningún
                 evento, y el pixel no puede emitir nada antes del consentimiento
                 (arranca en 'revoke'). */
              var l=function(){t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)};
              'requestIdleCallback' in f?f.requestIdleCallback(l,{timeout:4000}):setTimeout(l,2500)
              }(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('consent', 'revoke');
              fbq('init', '${META_PIXEL_ID}');
            `}
          </Script>
        ) : null}
        <ChunkErrorReloader />
        {/* PRD-289: descriptor OpenSearch (React hoistea este link al <head>). */}
        <link
          rel="search"
          type="application/opensearchdescription+xml"
          title="MundoTech"
          href="/opensearch.xml"
        />
        {/* PRD-055: skip link — primer elemento enfocable de la página. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-navy focus:text-white focus:px-4 focus:py-2.5 focus:rounded-xl focus:text-sm focus:font-semibold focus:shadow-lift"
        >
          Saltar al contenido
        </a>
        {/* Sin nonce: JSON-LD no es ejecutable; compatible con HTML cacheado (JsonLd.tsx). */}
        <JsonLd data={[websiteSchema, localBusinessSchema, organizationSchema]} />
        <AuthProvider>
          <MotionProvider>
          <CartProvider>
            <WishlistProvider>
              <ProductProvider>
                <ExchangeRateProvider initialRate={initialRate} initialUpdatedAt={initialUpdatedAt}>
                  {/*
                    Shell del layout: Navbar/CartDrawer en cliente (AppContent),
                    <main> y <Footer> en servidor para reducir JS bundle
                    y mejorar LCP / INP (Core Web Vitals).
                  */}
                  <div className="flex min-h-[100dvh] flex-col w-full max-w-full overflow-x-hidden">
                    <AnnouncementBar data={announcement} />
                    <AppContent contact={buildContactFromShellData(shellData)} />
                    <AppLayoutShell footer={<Footer shellData={shellData} />}>
                      {children}
                    </AppLayoutShell>
                  </div>
                  <DeferredClientWidgets
                    whatsapp={siteContent.whatsapp}
                    popup={siteContent.popup}
                  />
                  <CookieConsent />
                </ExchangeRateProvider>
              </ProductProvider>
            </WishlistProvider>
          </CartProvider>
          </MotionProvider>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
