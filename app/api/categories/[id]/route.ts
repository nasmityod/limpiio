import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { claimEditorialAssets } from '@/lib/products/product-asset-references';
import { sanitizeOrderItemImageUrl } from '@/lib/r2-public-url';
import { requirePermission } from '@/lib/admin-access-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { withSerializableCategoryTransaction, CategoryNameError, normalizeCategoryName } from '@/lib/categories/ensure-product-category';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { CACHE_TAG_CATEGORIES, CACHE_TAG_SITE_SHELL } from '@/lib/site-shell-cache';

/**
 * PRD-041: mismo contrato Zod que el POST de /api/categories — antes este PUT
 * escribía el body crudo en Prisma (sin tipos ni límites).
 * P85: añadidos description y seoTitle (opcionales, texto plano, sin HTML).
 */
const categoryUpdateSchema = z.object({
  name:        z.string().transform(normalizeCategoryName).pipe(z.string().min(1).max(80).refine(v => /[\p{L}\p{N}]/u.test(v))),
  slug:        z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Slug inválido (minúsculas, números y guiones).'),
  imageUrl:    z
    .string()
    .trim()
    .max(600)
    .nullish()
    .refine((v) => v == null || v === '' || sanitizeOrderItemImageUrl(v) !== null, 'imageUrl debe ser una ruta interna o una URL del CDN de la tienda.'), // SEC-2026-09 (#11)
  isFeatured:  z.boolean().optional(),
  order:       z.coerce.number().int().min(0).max(9999).optional(),
  // P85: campos SEO opcionales — texto plano (sin HTML). Null = usar fallbacks.
  description:      z.string().trim().max(300, 'Descripción: máximo 300 caracteres.').nullish(),
  seoTitle:         z.string().trim().max(70, 'Título SEO: máximo 70 caracteres.').nullish(),
  // TODO-MC-01 (cerrado): override de categoría Google; null = usar mapa automático.
  googleCategoryId: z.number().int().positive().nullish(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const parsed = categoryUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos de categoría inválidos.', errors: parsed.error.flatten() }, { status: 400 });
    }
    const { name, slug, imageUrl, isFeatured, order, description, seoTitle, googleCategoryId } = parsed.data;

    const { category, previousSlug } = await withSerializableCategoryTransaction(async (tx) => {
      await claimEditorialAssets(tx, imageUrl);
      const existing = await tx.category.findUniqueOrThrow({ where: { id } });
      const duplicate = await tx.category.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new CategoryNameError('Ya existe una categoría con ese nombre.');
      const category = await tx.category.update({ where: { id }, data: {
        name, slug, imageUrl: imageUrl ?? null, isFeatured: isFeatured ?? existing.isFeatured,
        order: order ?? existing.order, description: description ?? null,
        seoTitle: seoTitle ?? null, googleCategoryId: googleCategoryId ?? null,
      } });
      if (existing.name !== name) {
        await tx.product.updateMany({
          where: { category: { equals: existing.name, mode: 'insensitive' } },
          data: { category: name },
        });
      }
      if (existing.slug !== slug) {
        await tx.appConfig.updateMany({ where: { key: { startsWith: 'slug_redirect:' }, value: existing.slug }, data: { value: slug } });
        await tx.appConfig.deleteMany({ where: { key: `slug_redirect:${slug}` } });
        await tx.appConfig.upsert({ where: { key: `slug_redirect:${existing.slug}` }, update: { value: slug }, create: { key: `slug_redirect:${existing.slug}`, value: slug } });
      }
      return { category, previousSlug: existing.slug };
    });
    if (previousSlug !== slug) revalidatePath(`/categoria/${previousSlug}`, 'page');
    revalidateTag('catalog', 'default');
    revalidatePath('/categoria/[slug]', 'page');
    revalidateTag(CACHE_TAG_CATEGORIES, 'default');
    revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof CategoryNameError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'El nombre o slug ya está en uso.' }, { status: 409 });
    // PRD-043: logging del fallo (antes el catch tragaba el error).
    logError('categories_put_failed', error, { route: '/api/categories/[id]' });
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(_req);
  if (originCheck) return originCheck;

  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    await withSerializableCategoryTransaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id } });
      if (!category) return;
      const count = await tx.product.count({ where: { category: { equals: category.name, mode: 'insensitive' } } });
      if (count > 0) throw new CategoryNameError('Reasigna los productos antes de eliminar la categoría.');
      await tx.category.delete({ where: { id } });
    });
    revalidateTag(CACHE_TAG_CATEGORIES, 'default');
    revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    revalidatePath('/', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CategoryNameError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      revalidateTag(CACHE_TAG_CATEGORIES, 'default');
      revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
      return NextResponse.json({ success: true, alreadyDeleted: true });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return NextResponse.json(
        { error: 'No se puede eliminar: la categoría tiene registros asociados.' },
        { status: 409 }
      );
    }
    // PRD-043: logging del fallo (antes el catch tragaba el error).
    logError('categories_delete_failed', error, { route: '/api/categories/[id]' });
    return NextResponse.json(
      {
        error: 'Error al eliminar',
        code:
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : null,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
