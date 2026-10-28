import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { bannerSchema } from '@/lib/editorial-schemas';
import { prisma } from '@/lib/prisma';
import { claimEditorialAssets } from '@/lib/products/product-asset-references';
import { requirePermission } from '@/lib/admin-access-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin } from '@/lib/security';

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
      return NextResponse.json({ error: 'Datos editoriales inválidos.', errors: parsed.error.flatten() }, { status: 400 });
    }
    const { type, imageUrl, title, subtitle, label, ctaText, tagText, link, focalPoint, active, order } = parsed.data;
    const banner = await prisma.$transaction(async (tx) => {
      await claimEditorialAssets(tx, imageUrl);
      return tx.banner.create({
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
    });
    revalidatePath('/');
    revalidateTag('banners', 'default');
    return NextResponse.json(banner, { status: 201 });
  } catch (error) {
    logError('banners_post_failed', error, { route: '/api/banners' });
    return NextResponse.json({ error: 'Error al crear banner' }, { status: 500 });
  }
}
