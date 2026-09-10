import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isSafeEditableImageUrl, isSafeEditableLink } from '@/lib/safe-link';
import { rejectInvalidMutationOrigin } from '@/lib/security';

const FOCAL_POINTS = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

const bannerSchema = z.object({
  type: z.enum(['hero', 'ad_box', 'cta_banner', 'discover', 'promo_large', 'promo_small_1', 'promo_small_2']),
  // PRD-042: la imagen debe ser una URL https válida (R2) o ruta
  // interna — un string basura rompe next/image en la home.
  imageUrl: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .refine(isSafeEditableImageUrl, 'imageUrl debe ser una URL https válida o una ruta interna.'),
  title: z.string().max(160).nullish(),
  subtitle: z.string().max(300).nullish(),
  label: z.string().max(80).nullish(),
  ctaText: z.string().max(60).nullish(),
  tagText: z.string().max(60).nullish(),
  link: z
    .string()
    .max(400)
    .nullish()
    .refine((v) => v == null || isSafeEditableLink(v), 'Enlace no permitido: usa ruta interna (/...) o https.'),
  focalPoint: z.enum(FOCAL_POINTS).optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(9999).optional(),
});

export async function GET(request: Request) {
  try {
    // PRD-280: GET público — rate limit por IP contra scraping de la
    // configuración editorial (hero, CTAs).
    const ip = getClientIp(request);
    if (await rateLimit(`banners:get:${ip}`, { limit: 120, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    // Público siempre filtra por active: true.
    // Solo admin puede usar showAll=true para ver todos.
    const where: Record<string, unknown> = { active: true };

    const showAll = searchParams.get('showAll') === 'true' || searchParams.get('active') === 'all';
    if (showAll) {
      const auth = await requirePermission('SITE_CONTENT');
      if (auth.authorized) {
        delete where.active;
      }
    }

    if (type) where.type = type;

    const banners = await prisma.banner.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(banners, {
      headers: showAll
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    logError('banners_get_failed', error, { route: '/api/banners' });
    return NextResponse.json({ error: 'Error al obtener banners' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('SITE_CONTENT');
  if (!auth.authorized) return auth.response;

  try {
    const parsed = bannerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { type, imageUrl, title, subtitle, label, ctaText, tagText, link, focalPoint, active, order } = parsed.data;
    const banner = await prisma.banner.create({
      data: {
        type,
        imageUrl,
        title:    title    ?? null,
        subtitle: subtitle ?? null,
        label:    label    ?? null,
        ctaText:  ctaText  ?? null,
        tagText:  tagText  ?? null,
        link:     link     ?? '/productos',
        focalPoint: focalPoint ?? 'center',
        active:   active   ?? true,
        order:    order    ?? 0,
      },
    });
    revalidatePath('/');
    revalidateTag('banners', 'default');
    return NextResponse.json(banner, { status: 201 });
  } catch (error) {
    logError('banners_post_failed', error, { route: '/api/banners' });
    return NextResponse.json({ error: 'Error al crear banner' }, { status: 500 });
  }
}
