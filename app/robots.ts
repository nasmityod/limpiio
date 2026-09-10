import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

/**
 * /robots.txt — permite el rastreo de la tienda pública (home, catálogo,
 * fichas y categorías) y bloquea rutas privadas/transaccionales.
 *
 * Notas:
 * • H11: /cart bloqueado (antes era rastreable sin aportar valor).
 * • /buscar queda PERMITIDO a propósito: lleva meta noindex y Google debe
 *   poder leerlo (un Disallow impediría ver la directiva).
 * • Las páginas de auth (/login, /registro, /reset-password…) llevan meta
 *   noindex (P96/H61/H12) — mismo motivo para no bloquearlas aquí.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Bots genéricos: tienda pública abierta, rutas sensibles bloqueadas
        userAgent: '*',
        allow: ['/', '/productos', '/product/', '/categoria/'],
        disallow: [
          '/admin',
          '/admin/',
          '/api/',
          '/checkout',
          '/checkout/',
          '/account',
          '/account/',
          '/cart',
          '/cart/',
          '/wishlist',
        ],
      },
      {
        // GPTBot y similares: sin acceso (decisión de privacidad documentada)
        userAgent: 'GPTBot',
        disallow: ['/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
