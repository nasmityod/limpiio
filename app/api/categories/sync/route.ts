import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { slugify } from '@/lib/slugify';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAG_CATEGORIES, CACHE_TAG_SITE_SHELL } from '@/lib/site-shell-cache';

/**
 * POST /api/categories/sync — herramienta de reparación / backfill histórico.
 *
 * Crea registros en `Category` para cada `Product.category` distinto que aún no
 * tenga fila correspondiente. NO es el flujo normal diario: al crear o editar
 * un producto, `ensureProductCategory` ya crea la Category en la misma
 * transacción. Usa este endpoint solo para sanear datos antiguos.
 */
export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  try {
    const products = await prisma.product.findMany({ select: { category: true }, distinct: ['category'] });
    const existing = await prisma.category.findMany({ select: { name: true, slug: true } });
    const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
    // PRD-185: registro de slugs ya usados (BD + lote actual) para evitar
    // colisiones que dejaban categorías sin crear / huérfanas en Product.category.
    const usedSlugs = new Set(existing.map(c => c.slug));

    const toCreate = products
      .map(p => p.category)
      .filter(name => name.trim() !== '' && !existingNames.has(name.toLowerCase()))
      .map((name, i) => {
        const base = slugify(name) || `categoria-${i + 1}`;
        let candidate = base;
        let counter = 2;
        while (usedSlugs.has(candidate)) {
          candidate = `${base}-${counter}`;
          counter++;
        }
        usedSlugs.add(candidate);
        return {
          name,
          slug: candidate,
          // PRD-186: sin imágenes Unsplash hardcodeadas — el admin sube la imagen
          // real (R2) desde el panel; null = sin imagen, la UI lo tolera.
          imageUrl: null,
          isFeatured: i < 5,
          order: i,
        };
      });

    if (toCreate.length > 0) {
      await prisma.category.createMany({ data: toCreate, skipDuplicates: true });
    }

    const all = await prisma.category.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] });
    revalidatePath('/', 'layout');
    revalidateTag(CACHE_TAG_CATEGORIES, 'default');
    revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    return NextResponse.json({ created: toCreate.length, categories: all });
  } catch (e) {
    logError('categories_sync_failed', e, { route: '/api/categories/sync' });
    return NextResponse.json({ error: 'Error al sincronizar' }, { status: 500 });
  }
}
