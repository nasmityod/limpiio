'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requirePermissionAction } from '@/lib/admin-access-server';
import {
  siteContentSchema,
  readSiteContent,
  writeSiteContent,
  type SiteContent,
} from '@/lib/site-content';
import { CACHE_TAG_SITE_SHELL, CACHE_TAG_SITE_CONTENT } from '@/lib/site-shell-cache';
import { logError } from '@/lib/safe-logger';

/** Lectura del contenido del sitio (es contenido público — la usa el editor). */
export async function getSiteContent(): Promise<SiteContent> {
  return readSiteContent();
}

export type UpdateSiteContentResult = { success: true } | { success: false; message: string };

/** Guarda el contenido editable del sitio (solo admin). */
export async function updateSiteContent(input: SiteContent): Promise<UpdateSiteContentResult> {
  try {
    await requirePermissionAction('SITE_CONTENT');
  } catch {
    return { success: false, message: 'No autorizado.' };
  }

  const parsed = siteContentSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      success: false,
      message: first
        ? `Revisa el campo "${first.path.join('.')}" — ${first.message}`
        : 'Datos del contenido del sitio inválidos.',
    };
  }

  try {
    await writeSiteContent(parsed.data);
  } catch (error) {
    logError('site_content_update_failed', error, { operation: 'update_site_content' });
    return { success: false, message: 'No se pudo guardar. Intenta de nuevo.' };
  }

  revalidatePath('/', 'layout');
  revalidateTag('site-content', 'default');
  revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
  revalidateTag(CACHE_TAG_SITE_CONTENT, 'default');
  return { success: true };
}
