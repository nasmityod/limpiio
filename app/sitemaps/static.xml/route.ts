import { SITE_ORIGIN, sitemapXml, SITEMAP_HEADERS } from '@/lib/sitemap-data';

export async function GET() {
  const paths = ['', '/productos', '/ofertas', '/tienda-barquisimeto', '/nosotros', '/devoluciones', '/privacy-policy', '/terms-of-service', '/shipping-policy'];
  return new Response(sitemapXml(paths.map(path => ({ url: `${SITE_ORIGIN}${path}`, priority: path === '' ? 1 : ['/productos', '/ofertas'].includes(path) ? 0.8 : 0.5 }))), { headers: SITEMAP_HEADERS });
}
