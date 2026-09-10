import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { slugify } from '@/lib/slugify';
import { rejectInvalidMutationOrigin } from '@/lib/security';

/**
 * POST /api/admin/migrate-slugs
 * Genera slugs SEO para todos los productos sin slug útil (vacío).
 * Nota: desde la migración `prd_infra_datos` el slug es NOT NULL con backfill,
 * así que esta ruta queda como herramienta de reparación (slugs vacíos legacy).
 * Solo accesible por administradores.
 */
export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('OPERATIONS');
  if (!auth.authorized) return auth.response;

  try {
    // Productos sin slug útil (el schema ya no permite NULL).
    const products = await prisma.product.findMany({
      where: { slug: '' },
      select: { id: true, name: true },
    });

    if (products.length === 0) {
      return NextResponse.json({ message: 'Todos los productos ya tienen slug.', updated: 0 });
    }

    // Cargar todos los slugs existentes para evitar duplicados
    const existingSlugs = await prisma.product
      .findMany({ where: { slug: { not: '' } }, select: { slug: true } })
      .then(res => new Set(res.map(p => p.slug)));

    const updates: { id: string; slug: string }[] = [];

    for (const product of products) {
      let base = slugify(product.name);
      if (!base) base = `producto-${product.id.slice(-6)}`;

      let candidate = base;
      let counter = 2;

      while (existingSlugs.has(candidate)) {
        candidate = `${base}-${counter}`;
        counter++;
      }

      existingSlugs.add(candidate);
      updates.push({ id: product.id, slug: candidate });
    }

    // PRD-187: una sola transacción — o se migra todo el catálogo o nada,
    // nunca un catálogo a mitad de migrar si una fila falla.
    await prisma.$transaction(
      updates.map(u =>
        prisma.product.update({ where: { id: u.id }, data: { slug: u.slug } }),
      ),
    );

    // Los slugs cambian las URLs de ficha → invalidar páginas ISR afectadas.
    revalidatePath('/productos');
    revalidatePath('/product/[slug]', 'page');
    revalidatePath('/');

    return NextResponse.json({
      message: `Migración completa. ${updates.length} slugs generados.`,
      updated: updates.length,
      errors: [],
    });
  } catch (error) {
    logError('migrate_slugs_failed', error, { route: '/api/admin/migrate-slugs' });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
