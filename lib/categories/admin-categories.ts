/**
 * Nombres de categoría para los selectores del Panel Admin.
 *
 * ANTES (RC-04 de la auditoría de rendimiento): `getProductsAdmin()` resolvía
 * las categorías en la MISMA llamada que el listado, con dos consultas extra
 * (`category.findMany` + `product.findMany({ distinct: ['category'] })`). Como
 * el buscador del inventario recarga con debounce, escribir «cable» disparaba
 * ese trabajo una vez por pulsación aunque las categorías no cambien casi nunca.
 *
 * AHORA: consulta separada y cacheada con `unstable_cache`, invalidada por el
 * tag `categories` que ya emiten todas las mutaciones de producto y categoría
 * (crear/editar/borrar producto, import CSV, CRUD de categorías). El TTL es
 * únicamente una red de seguridad.
 */

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { normalizeCategoryName } from '@/lib/categories/ensure-product-category';
import { CACHE_TAG_CATEGORIES } from '@/lib/site-shell-cache';

/** Red de seguridad; los tags son el mecanismo real de frescura. */
const REVALIDATE_SECONDS = 300;

/**
 * Fuente principal: registros reales de `Category` (incluye categorías vacías).
 * Defensivo: añade huérfanas de `Product.category` que no tengan registro.
 * Es la misma lógica que vivía dentro de `getProductsAdmin()`, sin cambios de
 * comportamiento — sólo deja de ejecutarse en cada búsqueda.
 */
async function readAdminCategoryNames(): Promise<string[]> {
  const [categoryRows, productCategoryRows] = await Promise.all([
    prisma.category.findMany({
      select: { name: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    }),
    prisma.product.findMany({
      distinct: ['category'],
      select: { category: true },
    }),
  ]);

  const seen = new Set<string>();
  const allCategories: string[] = [];

  for (const row of categoryRows) {
    const name = normalizeCategoryName(row.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    allCategories.push(name);
  }

  const orphans = productCategoryRows
    .map((p) => normalizeCategoryName(p.category))
    .filter((name) => name.length > 0 && !seen.has(name.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  for (const name of orphans) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    allCategories.push(name);
  }

  return allCategories;
}

export const getCachedAdminCategoryNames = unstable_cache(
  readAdminCategoryNames,
  ['admin-category-names'],
  { tags: [CACHE_TAG_CATEGORIES], revalidate: REVALIDATE_SECONDS },
);

/** Exportado para tests: la lógica pura de mezcla/dedupe sin caché. */
export const __readAdminCategoryNamesForTests = readAdminCategoryNames;
