import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { isSafeEditableImageUrl, isSafeEditableLink } from '@/lib/safe-link';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rejectInvalidMutationOrigin } from '@/lib/security';

const promotionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().max(300).nullish(),
  discountText: z.string().max(60).nullish(),
  // PRD-042: URL https válida (R2), ruta interna o vacío/null.
  imageUrl: z
    .string()
    .max(600)
    .nullish()
    .refine((v) => v == null || isSafeEditableImageUrl(v), 'imageUrl debe ser una URL https válida o una ruta interna.'),
  bgColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  link: z
    .string()
    .max(400)
    .optional()
    .refine((v) => v == null || isSafeEditableLink(v), 'Enlace no permitido: usa ruta interna (/...) o https.'),
  active: z.boolean().optional(),
  order: z.coerce.number().int().min(0).max(99).optional(),
});

export async function GET(request: Request) {
  try {
    // PRD-279: GET público — rate limit por IP + caché corta contra scraping
    // de campañas y textos promocionales.
    const ip = getClientIp(request);
    if (await rateLimit(`promotions:get:${ip}`, { limit: 120, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);

    // Público siempre filtra por active: true.
    // Solo un admin puede pasar showAll=true para ver todas.
    let where: { active?: boolean } = { active: true };

    const showAll = searchParams.get('showAll') === 'true' || searchParams.get('active') === 'all';
    if (showAll) {
      const auth = await requirePermission('PROMOTIONS');
      if (auth.authorized) {
        where = {};
      }
    }

    const promotions = await prisma.promotion.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(promotions, {
      headers: showAll
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    logError('promotions_get_failed', error, { route: '/api/promotions' });
    return NextResponse.json({ error: 'Error al obtener promociones' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('PROMOTIONS');
  if (!auth.authorized) return auth.response;

  try {
    const parsed = promotionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;
    const promo = await prisma.promotion.create({
      data: {
        title:        body.title,
        subtitle:     body.subtitle     ?? null,
        discountText: body.discountText ?? null,
        imageUrl:     body.imageUrl     ?? null,
        bgColor:      body.bgColor      ?? '#FFD700',
        link:         body.link         ?? '/productos',
        active:       body.active       ?? true,
        order:        body.order        ?? 1,
      },
    });
    revalidatePath('/');
    revalidateTag('promotions', 'default');
    return NextResponse.json(promo, { status: 201 });
  } catch (error) {
    logError('promotions_post_failed', error, { route: '/api/promotions' });
    return NextResponse.json({ error: 'Error al crear promoción' }, { status: 500 });
  }
}
