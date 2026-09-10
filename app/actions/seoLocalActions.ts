'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requirePermissionAction } from '@/lib/admin-access-server';
import { readSeoLocal, writeSeoLocal } from '@/lib/seo-local';
import { seoLocalSchema, type SeoLocal } from '@/lib/seo-local-schema';
import { CACHE_TAG_SITE_SHELL, CACHE_TAG_SEO_LOCAL } from '@/lib/site-shell-cache';

export interface SeoLocalActionResult {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  data?: SeoLocal;
}

export async function updateSeoLocal(input: unknown): Promise<SeoLocalActionResult> {
  await requirePermissionAction('SITE_CONTENT');

  const parsed = seoLocalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: 'Algunos campos no son válidos.',
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  await writeSeoLocal(parsed.data);

  // Revalidar todas las rutas que consumen estos datos
  revalidatePath('/', 'layout');
  revalidatePath('/tienda-barquisimeto');
  revalidatePath('/nosotros');
  revalidatePath('/devoluciones');
  revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
  revalidateTag(CACHE_TAG_SEO_LOCAL, 'default');

  return { success: true, message: 'Datos guardados.', data: parsed.data };
}

export async function getSeoLocal(): Promise<SeoLocal> {
  return readSeoLocal();
}
