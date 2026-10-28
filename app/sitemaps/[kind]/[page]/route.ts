import { getSitemapCounts, getSitemapPage, sitemapXml, SITEMAP_HEADERS, SITEMAP_PAGE_SIZE } from '@/lib/sitemap-data';
import { logError } from '@/lib/safe-logger';

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; page: string }> }) {
  const { kind, page: raw } = await params;
  const page = Number(raw);
  if (!['products', 'categories'].includes(kind) || !/^\d{1,6}$/.test(raw) || !Number.isSafeInteger(page)) return new Response(null, { status: 404 });
  const validKind = kind as 'products' | 'categories';
  try {
    const counts = await getSitemapCounts();
    if (page >= Math.ceil(counts[validKind] / SITEMAP_PAGE_SIZE)) return new Response(null, { status: 404 });
    return new Response(sitemapXml(await getSitemapPage(validKind, page)), { headers: SITEMAP_HEADERS });
  } catch (error) {
    logError('sitemap_page_failed', error);
    return new Response('Sitemap temporalmente no disponible', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  }
}
