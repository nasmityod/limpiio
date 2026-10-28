import { getSitemapCounts, SITEMAP_PAGE_SIZE, SITE_ORIGIN, xmlEscape, SITEMAP_HEADERS } from '@/lib/sitemap-data';
import { logError } from '@/lib/safe-logger';

export async function GET() {
  try {
    const counts = await getSitemapCounts();
    const urls = [`${SITE_ORIGIN}/sitemaps/static.xml`];
    for (const kind of ['products', 'categories'] as const) {
      for (let page = 0; page < Math.ceil(counts[kind] / SITEMAP_PAGE_SIZE); page++) {
        urls.push(`${SITE_ORIGIN}/sitemaps/${kind}/${page}`);
        if (urls.length > 50_000) throw new Error('Sitemap index capacity exceeded');
      }
    }
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<sitemap><loc>${xmlEscape(url)}</loc></sitemap>`).join('')}</sitemapindex>`, { headers: SITEMAP_HEADERS });
  } catch (error) {
    logError('sitemap_index_failed', error);
    return new Response('Sitemap temporalmente no disponible', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
}
