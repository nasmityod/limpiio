/**
 * GET /api/merchant-feed
 *
 * Feed XML para Google Merchant Center (RSS 2.0 + namespace g:).
 * Compatible con el formato esperado por la importación de productos en
 * Google Merchant Center → Feed → Añadir feed → Feed XML.
 *
 * Solo incluye productos isActive:true con slug (URL amigable).
 * Todos los datos vienen de Prisma + readSettings(); sin valores hardcodeados.
 *
 * google_product_category: ID numérico de la taxonomía oficial de Google.
 * Prioridad: Category.googleCategoryId (override admin) → mapa automático
 * (lib/google-product-categories.ts) → fallback 222 (Electronics).
 *
 * return_policy / shipping: gestionados a nivel de cuenta en Merchant Center
 * (no se emiten por ítem — un label placeholder o un bloque shipping sin precio
 * son peor que omitirlos y pueden provocar rechazos de productos).
 *
 * P67/P68/H50: primer paso para presencia en Google Shopping.
 *
 * Cache: 1 hora (stale-while-revalidate 4h). El feed se regenera al añadir
 * o modificar productos desde el admin.
 *
 * robots.txt: /api/ está bloqueado a crawlers genéricos, pero Googlebot
 * Merchant Center lo consumes explícitamente vía URL registrada en la
 * cuenta — no necesita estar en robots.txt ni en sitemap.
 */

import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { readSettings } from '@/lib/data-store';
import { getGoogleCategoryId } from '@/lib/google-product-categories';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com';

// Escapa caracteres especiales XML para datos de usuario (nombre, descripción).
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Limpia HTML para el campo description del feed (sin tags).
function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(request: Request) {
  // SEC-03 (AUDITORIA-2026-07): el feed expone precios/stock/SKUs completos —
  // rate limit por IP contra scraping masivo (Merchant Center lo lee 1-2×/día).
  const ip = getClientIp(request);
  if (await rateLimit(`merchant-feed:ip:${ip}`, { limit: 30, windowMs: 60_000 })) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  try {
    const [products, categories, settings] = await Promise.all([
      prisma.product.findMany({
        where: {
          isActive: true,
          // Solo productos con slug legible; los que solo tienen id no
          // tienen URL amigable verificable para Merchant Center.
          slug: { not: undefined },
        },
        select: {
          id:            true,
          slug:          true,
          name:          true,
          description:   true,
          price:         true,
          originalPrice: true,
          stock:         true,
          category:      true,
          brand:         true,
          images:        true,
          sku:           true,
          updatedAt:     true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      // Carga el override googleCategoryId de cada categoría para priorizar
      // sobre el mapa automático.
      prisma.category.findMany({
        select: { name: true, googleCategoryId: true },
      }),
      readSettings(),
    ]);

    // Índice nombre (lowercase) → googleCategoryId admin override.
    const categoryOverrides = new Map<string, number | null>(
      categories.map(c => [c.name.toLowerCase(), c.googleCategoryId])
    );

    const storeName = escapeXml(settings.storeName);
    const storeDesc = escapeXml(
      settings.tagline || `${settings.storeName} — tecnología en Barquisimeto, Venezuela`,
    );

    // ── Generar ítems del feed ───────────────────────────────────────────────
    const items = products.map((p) => {
      const productUrl  = `${SITE_URL}/product/${p.slug}`;
      const imageUrl    = p.images[0] ?? '';
      const availability = p.stock > 0 ? 'in stock' : 'out of stock';
      // Precio en formato requerido por Google: "99.00 USD"
      const price       = `${p.price.toFixed(2)} USD`;
      // Precio de venta si hay rebaja
      const salePrice   =
        p.originalPrice && p.originalPrice > p.price
          ? `${p.price.toFixed(2)} USD`
          : null;
      const listPrice   =
        salePrice && p.originalPrice
          ? `${p.originalPrice.toFixed(2)} USD`
          : null;

      const desc = escapeXml(
        stripHtml(p.description) ||
          `${p.name} — disponible en ${settings.storeName} Barquisimeto. Compra con factura.`,
      );

      // google_product_category: prioridad al override definido por el admin en
      // la entidad Category. Si es null/undefined, cae en el mapa automático.
      const adminOverride = categoryOverrides.get(p.category.toLowerCase());
      const googleCategoryId =
        adminOverride != null
          ? adminOverride
          : getGoogleCategoryId(p.category);

      return `
    <item>
      <g:id>${escapeXml(p.sku ?? p.id)}</g:id>
      <g:title>${escapeXml(p.name)}</g:title>
      <g:description>${desc}</g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      ${imageUrl ? `<g:image_link>${escapeXml(imageUrl)}</g:image_link>` : ''}
      <g:availability>${availability}</g:availability>
      <g:price>${listPrice ?? price}</g:price>
      ${salePrice ? `<g:sale_price>${salePrice}</g:sale_price>` : ''}
      ${p.brand ? `<g:brand>${escapeXml(p.brand)}</g:brand>` : ''}
      ${p.sku ? `<g:mpn>${escapeXml(p.sku)}</g:mpn>` : ''}
      <g:condition>new</g:condition>
      <g:product_type>${escapeXml(p.category)}</g:product_type>
      <g:google_product_category>${googleCategoryId}</g:google_product_category>
    </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${storeName}</title>
    <link>${SITE_URL}</link>
    <description>${storeDesc}</description>
${items.join('\n')}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        // Cache 1 hora; Merchant Center tipicamente rastrea cada 24h–72h.
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=14400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logError('merchant_feed_get_failed', error, { route: '/api/merchant-feed' });
    return new NextResponse('Error interno del servidor', { status: 500 });
  }
}
