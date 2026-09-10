import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { CACHE_TAG_CATEGORIES, CACHE_TAG_SITE_SHELL } from '@/lib/site-shell-cache';

const categorySchema = z.object({
  name:        z.string().trim().min(1).max(80),
  slug:        z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Slug inválido (minúsculas, números y guiones).'),
  imageUrl:    z.string().max(600).nullish(),
  isFeatured:  z.boolean().optional(),
  order:       z.number().int().min(0).max(9999).optional(),
  // P85: campos SEO opcionales — texto plano (sin HTML). Null = usar fallbacks.
  description:      z.string().trim().max(300, 'Descripción: máximo 300 caracteres.').nullish(),
  seoTitle:         z.string().trim().max(70, 'Título SEO: máximo 70 caracteres.').nullish(),
  // TODO-MC-01 (cerrado): override de categoría Google; null = usar mapa automático.
  googleCategoryId: z.number().int().positive().nullish(),
});

export async function GET(request: Request) {
  try {
    // PRD-278: GET público (lo usa el menú de categorías) — rate limit por IP
    // y caché corta para frenar scraping masivo del catálogo.
    const ip = getClientIp(request);
    if (await rateLimit(`categories:get:${ip}`, { limit: 120, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured');
    const where = featured === 'true' ? { isFeatured: true } : {};
    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    // Productos guardan `category` como string (nombre). Conteo por categoría.
    const counts = await prisma.product.groupBy({
      by: ['category'],
      _count: { _all: true },
    });
    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set((row.category ?? '').toLowerCase(), row._count._all);
    }
    const withCounts = categories.map((c) => ({
      ...c,
      productCount: countMap.get((c.name ?? '').toLowerCase()) ?? 0,
    }));
    return NextResponse.json(withCounts, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    // PRD-043: el catch silencioso ocultaba caídas de BD en un endpoint global.
    logError('categories_get_failed', error, { route: '/api/categories' });
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  try {
    const parsed = categorySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { name, slug, imageUrl, isFeatured, order, description, seoTitle, googleCategoryId } = parsed.data;
    const category = await prisma.category.create({
      data: {
        name,
        slug,
        imageUrl:         imageUrl         ?? null,
        isFeatured:       isFeatured       ?? false,
        order:            order            ?? 0,
        description:      description      ?? null,
        seoTitle:         seoTitle         ?? null,
        googleCategoryId: googleCategoryId ?? null,
      },
    });
    revalidatePath('/categoria/[slug]', 'page');
    revalidateTag(CACHE_TAG_CATEGORIES, 'default');
    revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    logError('categories_post_failed', error, { route: '/api/categories' });
    return NextResponse.json({ error: 'Error al crear categoría' }, { status: 500 });
  }
}
