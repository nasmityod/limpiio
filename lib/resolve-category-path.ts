import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/slugify';

/** Misma lógica de slug que POST /api/categories/sync (creación de filas Category). */
function syncStyleSlugFromCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Devuelve la ruta canónica `/categoria/[slug]` usando el registro Category,
 * o `/productos` si no hay correspondencia (evita prefetch 404 desde la ficha).
 *
 * NO usar solo slugify(nombre) como slug de URL: debe coincidir con `Category.slug`.
 */
export async function resolveCategoryPathFromProductCategory(
  productCategoryName: string
): Promise<string> {
  const name = productCategoryName.trim();
  if (!name) return '/productos';

  const byName = await prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { slug: true },
  });
  if (byName?.slug) return `/categoria/${byName.slug}`;

  const fromSlugify = slugify(name);
  const bySlugify = await prisma.category.findFirst({
    where: { slug: fromSlugify },
    select: { slug: true },
  });
  if (bySlugify?.slug) return `/categoria/${bySlugify.slug}`;

  const fromSync = syncStyleSlugFromCategoryName(name);
  if (fromSync !== fromSlugify) {
    const bySync = await prisma.category.findFirst({
      where: { slug: fromSync },
      select: { slug: true },
    });
    if (bySync?.slug) return `/categoria/${bySync.slug}`;
  }

  return '/productos';
}
