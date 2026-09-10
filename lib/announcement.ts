/**
 * announcement.ts
 * Barra de anuncios superior editable desde el panel admin. Se persiste como
 * JSON en AppConfig (clave `announcement_bar`).
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isSafeEditableLink } from '@/lib/safe-link';

export const ANNOUNCEMENT_KEY = 'announcement_bar';

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Color HEX inválido.');

export const announcementSchema = z.object({
  active: z.boolean().default(false),
  text: z.string().max(160).default(''),
  // PRD-283: la barra se muestra en TODAS las páginas — el enlace solo puede
  // ser ruta interna (/...) o https. Bloquea javascript:/data:/http externos.
  link: z
    .string()
    .max(300)
    .refine(isSafeEditableLink, 'Enlace no permitido: usa una ruta interna (/...) o una URL https.')
    .default(''),
  bgColor: hexColor.default('#0B1220'),
  textColor: hexColor.default('#FFFFFF'),
});

export type Announcement = z.infer<typeof announcementSchema>;

export const DEFAULT_ANNOUNCEMENT: Announcement = {
  active: false,
  text: '',
  link: '',
  bgColor: '#0B1220',
  textColor: '#FFFFFF',
};

export async function readAnnouncement(): Promise<Announcement> {
  try {
    const rec = await prisma.appConfig.findUnique({ where: { key: ANNOUNCEMENT_KEY } });
    if (!rec) return DEFAULT_ANNOUNCEMENT;
    const parsed = announcementSchema.safeParse(JSON.parse(rec.value));
    return parsed.success ? parsed.data : DEFAULT_ANNOUNCEMENT;
  } catch {
    return DEFAULT_ANNOUNCEMENT;
  }
}

export async function writeAnnouncement(a: Announcement): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: ANNOUNCEMENT_KEY },
    update: { value: JSON.stringify(a) },
    create: { key: ANNOUNCEMENT_KEY, value: JSON.stringify(a) },
  });
}
