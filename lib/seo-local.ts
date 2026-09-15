/**
 * SEO Local — capa de persistencia (server-only).
 * Para schema/tipos puros (que pueden importarse en cliente) usar `seo-local-schema.ts`.
 */
import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  seoLocalSchema, SEO_LOCAL_KEY, DEFAULT_SEO_LOCAL,
  type SeoLocal,
} from '@/lib/seo-local-schema';

export {
  seoLocalSchema, SEO_LOCAL_KEY, DEFAULT_SEO_LOCAL, SEO_DAYS, DAY_LABEL_ES,
  buildLocalBusinessSchema, describeOpeningHours,
} from '@/lib/seo-local-schema';
export type { SeoLocal, LocalBusinessSchemaOptions } from '@/lib/seo-local-schema';

export async function readSeoLocal(): Promise<SeoLocal> {
  try {
    const record = await prisma.appConfig.findUnique({ where: { key: SEO_LOCAL_KEY } });
    if (!record) return DEFAULT_SEO_LOCAL;
    const raw = JSON.parse(record.value) as Record<string, unknown>;
    const parsed = seoLocalSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    // SEC-2026-09 (#4): el schema ahora exige https en las URLs. Si el registro
    // guardado trae una URL inválida (legacy http: o algo peor), se descartan
    // SOLO esas URLs en vez de perder dirección/horarios completos.
    const retry = seoLocalSchema.safeParse({
      ...raw,
      googleMapsUrl: '',
      googleMapsEmbed: '',
      tiktok: '',
    });
    return retry.success ? retry.data : DEFAULT_SEO_LOCAL;
  } catch {
    return DEFAULT_SEO_LOCAL;
  }
}

export async function writeSeoLocal(data: SeoLocal): Promise<void> {
  const parsed = seoLocalSchema.parse(data);
  await prisma.appConfig.upsert({
    where:  { key: SEO_LOCAL_KEY },
    update: { value: JSON.stringify(parsed) },
    create: { key: SEO_LOCAL_KEY, value: JSON.stringify(parsed) },
  });
}
