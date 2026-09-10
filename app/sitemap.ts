import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

export const dynamic = 'force-dynamic';

/**
 * Sitemap dinámico — solo rutas públicas indexables.
 *
 * Priorities: home 1.0 · catálogo/productos 0.8 · categorías 0.7 · estáticas 0.5.
 * Excluidas SIEMPRE: /admin, /api, /checkout, /account, /cart, /wishlist,
 * /buscar (noindex) y rutas de auth (noindex).
 *
 * H18: las páginas estáticas no emiten `lastModified` — antes enviaban
 * `new Date()` en cada request y Google las re-rastreaba sin necesidad.
 *
 * DEPENDENCIA-03 (resuelta): solo productos con `isActive: true` (soft-delete).
 * P42/H40: imágenes de producto incluidas en cada entrada para Google Images/Lens.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ── Páginas estáticas ──────────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/productos`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      // /ofertas es indexable (canonical propio + breadcrumb) pero faltaba aquí.
      url: `${SITE_URL}/ofertas`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/tienda-barquisimeto`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/nosotros`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/devoluciones`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy-policy`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terms-of-service`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/shipping-policy`,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];

  // ── Productos dinámicos ────────────────────────────────────────────────────
  // DEPENDENCIA-03: filtro isActive:true — requiere columna migrada.
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, updatedAt: true, name: true, images: true },
      orderBy: { updatedAt: 'desc' },
    });

    productPages = products.map((p) => {
      const images = p.images.filter(Boolean).slice(0, 3);

      return {
        url: `${SITE_URL}/product/${p.slug ?? p.id}`,
        lastModified: p.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
        ...(images.length > 0 ? { images } : {}),
      };
    });
  } catch (error) {
    console.error('[sitemap] Error al cargar productos activos:', error);
  }

  // ── Categorías dinámicas ───────────────────────────────────────────────────
  const categories = await prisma.category.findMany({
    select: { slug: true, updatedAt: true, imageUrl: true, name: true },
    orderBy: { order: 'asc' },
  });

  // Rutas canónicas /categoria/[slug] (preferidas para SEO).
  // P42/H40: imagen de portada de la categoría incluida si existe.
  const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${SITE_URL}/categoria/${cat.slug}`,
    lastModified: cat.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
    ...(cat.imageUrl ? { images: [cat.imageUrl] } : {}),
  }));

  return [...staticPages, ...productPages, ...categoryPages];
}
