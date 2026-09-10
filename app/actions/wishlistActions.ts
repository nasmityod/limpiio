'use server';

/**
 * FASE 4.6 (MEJORA 3.2) — wishlist sincronizada con la cuenta.
 *
 * El invitado sigue usando localStorage (WishlistProvider). Con sesión:
 *  - al iniciar sesión se FUSIONAN (unión sin duplicados) los favoritos locales
 *    con los de la cuenta (mergeWishlistAction) y se limpia el local;
 *  - añadir/quitar sincroniza best-effort contra estas actions.
 *
 * Base lista para "bajó de precio lo que guardaste": WishlistItem guarda el
 * productId; un cron futuro puede comparar contra price actual (patrón
 * restock-alert como referencia).
 */
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { d, dn } from '@/lib/decimal';
import { PRODUCT_CARD_SELECT } from '@/lib/product-select';
import { firstCardImage } from '@/lib/product-media';
import { logError } from '@/lib/safe-logger';

const MAX_WISHLIST_ITEMS = 100;

export interface WishlistProductDTO {
  id: string;
  slug: string | null;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  category: string;
  brand: string | null;
  image: string;
  images: string[];
  freeShipping: boolean;
}

async function sessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

async function loadWishlistProducts(userId: string): Promise<WishlistProductDTO[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId, product: { isActive: true } },
    orderBy: { createdAt: 'asc' },
    select: { product: { select: PRODUCT_CARD_SELECT } },
  });
  return rows.map(({ product: p }) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? '',
    price: d(p.price),
    originalPrice: dn(p.originalPrice),
    stock: p.stock,
    category: p.category,
    brand: p.brand,
    image: firstCardImage(p.images),
    images: p.images ?? [],
    freeShipping: p.freeShipping === true,
  }));
}

/** Wishlist de la cuenta (solo productos activos). [] sin sesión. */
export async function getWishlistAction(): Promise<WishlistProductDTO[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  try {
    return await loadWishlistProducts(userId);
  } catch (err) {
    logError('wishlist_get_failed', err, { operation: 'get_wishlist' });
    return [];
  }
}

/**
 * Fusión al iniciar sesión: unión (cuenta ∪ local) sin duplicados.
 * Devuelve la lista resultante para que el cliente la adopte.
 */
export async function mergeWishlistAction(
  localProductIds: string[],
): Promise<WishlistProductDTO[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  try {
    const ids = [...new Set(localProductIds)].filter(
      (id) => typeof id === 'string' && id.length > 0 && id.length < 40,
    ).slice(0, MAX_WISHLIST_ITEMS);

    if (ids.length > 0) {
      // Solo productos que existen y están activos (ids locales pueden estar viejos).
      const valid = await prisma.product.findMany({
        where: { id: { in: ids }, isActive: true },
        select: { id: true },
      });
      if (valid.length > 0) {
        await prisma.wishlistItem.createMany({
          data: valid.map((p) => ({ userId, productId: p.id })),
          skipDuplicates: true,
        });
      }
    }
    return await loadWishlistProducts(userId);
  } catch (err) {
    logError('wishlist_merge_failed', err, { operation: 'merge_wishlist' });
    return [];
  }
}

export async function addWishlistItemAction(productId: string): Promise<void> {
  const userId = await sessionUserId();
  if (!userId || !productId) return;
  try {
    const count = await prisma.wishlistItem.count({ where: { userId } });
    if (count >= MAX_WISHLIST_ITEMS) return;
    await prisma.wishlistItem.createMany({
      data: [{ userId, productId }],
      skipDuplicates: true,
    });
  } catch (err) {
    // FK violation = producto inexistente; best-effort, la UI ya se actualizó.
    logError('wishlist_add_failed', err, { operation: 'add_wishlist_item' });
  }
}

export async function removeWishlistItemAction(productId: string): Promise<void> {
  const userId = await sessionUserId();
  if (!userId || !productId) return;
  try {
    await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  } catch (err) {
    logError('wishlist_remove_failed', err, { operation: 'remove_wishlist_item' });
  }
}

export async function clearWishlistAction(): Promise<void> {
  const userId = await sessionUserId();
  if (!userId) return;
  try {
    await prisma.wishlistItem.deleteMany({ where: { userId } });
  } catch (err) {
    logError('wishlist_clear_failed', err, { operation: 'clear_wishlist' });
  }
}
