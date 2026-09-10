/**
 * site-content.ts — capa de persistencia (server-only) del contenido editable
 * del sitio. Para schema/tipos/defaults puros (importables en cliente) usar
 * `site-content-schema.ts`. Se persiste como JSON en AppConfig y se edita
 * desde /admin/personalizar.
 */
import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  siteContentSchema,
  SITE_CONTENT_KEY,
  DEFAULT_SITE_CONTENT,
  type SiteContent,
} from '@/lib/site-content-schema';

export {
  siteContentSchema,
  SITE_CONTENT_KEY,
  DEFAULT_SITE_CONTENT,
  trustIconSchema,
} from '@/lib/site-content-schema';
export type { SiteContent, TrustIcon } from '@/lib/site-content-schema';

export async function readSiteContent(): Promise<SiteContent> {
  try {
    const rec = await prisma.appConfig.findUnique({ where: { key: SITE_CONTENT_KEY } });
    if (!rec) return DEFAULT_SITE_CONTENT;
    const parsed = siteContentSchema.safeParse(JSON.parse(rec.value));
    return parsed.success ? parsed.data : DEFAULT_SITE_CONTENT;
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}

export async function writeSiteContent(content: SiteContent): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: SITE_CONTENT_KEY },
    update: { value: JSON.stringify(content) },
    create: { key: SITE_CONTENT_KEY, value: JSON.stringify(content) },
  });
}
