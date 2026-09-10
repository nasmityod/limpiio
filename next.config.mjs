import withBundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
/**
 * Headers estáticos que no requieren nonce por petición.
 * El Content-Security-Policy (con nonce dinámico por request) lo genera middleware.ts,
 * que cubre todas las rutas HTML excepto _next/static y _next/image.
 */
const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  // HSTS: los navegadores lo ignoran sobre HTTP plano, así que es seguro
  // emitirlo siempre; en producción (HTTPS) fuerza TLS por 1 año.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/** Hostname del CDN público de R2 (R2_PUBLIC_BASE_URL). */
function r2RemotePattern() {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!base) return null;
  try {
    const u = new URL(base);
    if (u.protocol !== 'https:') return null;
    return { protocol: 'https', hostname: u.hostname, pathname: '/**' };
  } catch {
    return null;
  }
}

const remotePatterns = [];

const r2Pattern = r2RemotePattern();
if (r2Pattern) {
  remotePatterns.push(r2Pattern);
}

const nextConfig = {
  // Permite builds de validación (NEXT_BUILD_DIR=.next-validate npx next build)
  // sin sobreescribir el .next que systemd está sirviendo en producción.
  distDir: process.env.NEXT_BUILD_DIR || '.next',

  // PRD-071: no exponer el framework al servidor ("X-Powered-By: Next.js").
  poweredByHeader: false,

  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },

  serverExternalPackages: ['@prisma/client', '.prisma/client', 'sharp', '@aws-sdk/client-s3'],

  async headers() {
    return [
      {
        // Aplica a todas las rutas del sitio
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/icon.svg',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/checkout/success',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
          },
        ],
      },
      {
        // SESIÓN 04 / Prompt 05 — refuerzo estático a nivel de plataforma para
        // el comprobante de pago privado. El handler ya envía estos mismos
        // headers por request (app/api/orders/[id]/payment-proof/route.ts);
        // esta regla es defensa en profundidad (p.ej. si el handler cambiara
        // sin actualizar sus headers) y no depende del código de la ruta.
        source: '/api/orders/:id/payment-proof',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
    ];
  },

  /** Peticiones legacy que piden `/favicon.ico` → mismo asset que `app/icon.svg`. */
  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/icon.svg',
        permanent: false,
      },
      // Alias en español de páginas legales/informativas (URLs memorables
      // para clientes locales + evitan 404 desde material impreso).
      { source: '/privacidad',    destination: '/privacy-policy',   permanent: true },
      { source: '/terminos',      destination: '/terms-of-service', permanent: true },
      { source: '/envios',        destination: '/shipping-policy',  permanent: true },
      { source: '/about',         destination: '/nosotros',         permanent: true },
      { source: '/quienes-somos', destination: '/nosotros',         permanent: true },
    ];
  },

  images: {
    // WebP exclusivo: AVIF añadió ~3-5 puntos de latencia en LCP por generar
    // el formato on-the-fly en primera visita. Volvemos a WebP que ya daba
    // estabilidad con score 86 en móvil.
    formats: ['image/webp'],
    // Optimizador por defecto de Next.js contra el dominio público de R2.
    // TODO: transformación on-the-fly opcional con Cloudflare Image Resizing (cdn-cgi/image).
    remotePatterns,
  },

  /**
   * Sustituye next-polyfill-module por un stub vacío vía resolveAlias de Turbopack.
   *
   * Next.js inyecta ~13 KiB de polyfills (Array.prototype.at, flat, flatMap,
   * Object.fromEntries, Object.hasOwn, String.prototype.trimStart/trimEnd)
   * independientemente del browserslist. Nuestro objetivo (chrome >= 111,
   * safari >= 16, firefox >= 111, edge >= 111) cubre nativamente todos estos
   * métodos, así que los polyfills son bytes desperdiciados.
   *
   * @see https://github.com/vercel/next.js/issues/86785
   * @see https://github.com/vercel/next.js/pull/87270
   */
  transpilePackages: ['next'],

  turbopack: {
    resolveAlias: {
      // next/dist/{client,esm}/client/index.js: require("../build/polyfills/polyfill-module")
      // También cubre imports absolutos desde node_modules
      '../build/polyfills/polyfill-module': './lib/polyfill-stub.js',
      'next/dist/build/polyfills/polyfill-module': './lib/polyfill-stub.js',
    },
  },
};

const withAnalyzer = process.env.ANALYZE === 'true'
  ? withBundleAnalyzer({ enabled: true })
  : (config) => config;

export default withAnalyzer(nextConfig);
