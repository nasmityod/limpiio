'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requirePermissionAction } from '@/lib/admin-access-server';
import {
  announcementSchema,
  readAnnouncement,
  writeAnnouncement,
  type Announcement,
} from '@/lib/announcement';
import { CACHE_TAG_SITE_SHELL, CACHE_TAG_ANNOUNCEMENT } from '@/lib/site-shell-cache';

/** Lectura pública de la barra de anuncios (la usa el layout). */
export async function getAnnouncement(): Promise<Announcement> {
  return readAnnouncement();
}

export type UpdateAnnouncementResult = { success: true } | { success: false; message: string };

/** Guarda la barra de anuncios (solo admin). */
export async function updateAnnouncement(input: Announcement): Promise<UpdateAnnouncementResult> {
  try {
    await requirePermissionAction('SITE_CONTENT');
  } catch {
    return { success: false, message: 'No autorizado.' };
  }

  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: 'Datos de la barra de anuncios inválidos.' };
  }

  await writeAnnouncement(parsed.data);
  revalidatePath('/', 'layout');
  revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
  revalidateTag(CACHE_TAG_ANNOUNCEMENT, 'default');
  return { success: true };
}
