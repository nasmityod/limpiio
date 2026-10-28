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
import type { Prisma } from '@prisma/client';

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

async function loadWishlistProducts(userId: string, db: Prisma.TransactionClient = prisma): Promise<WishlistProductDTO[]> {
  const rows = await db.wishlistItem.findMany({
    where: { userId, product: { isActive: true } },
    orderBy: { createdAt: 'asc' },
    take: MAX_WISHLIST_ITEMS,
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

export type WishlistResult = { ok: true; items: WishlistProductDTO[]; unmergedIds?: string[] } | {
  ok: false; code: 'UNAUTHORIZED' | 'UNAVAILABLE' | 'LIMIT' | 'INVALID_PRODUCT';
};

async function mutateWishlist(userId: string, ids: string[], mode: 'merge' | 'add' | 'remove' | 'clear'): Promise<WishlistResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'wishlist:' + userId}, 0))`;
    await tx.wishlistItem.deleteMany({ where: { userId, product: { isActive: false } } });
    const current = await tx.wishlistItem.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { productId: true } });
    // Repair overfull lists from older versions without silently replacing the
    // oldest favourites when an account receives concurrent additions.
    if (current.length > MAX_WISHLIST_ITEMS) {
      await tx.wishlistItem.deleteMany({ where: { userId, productId: { in: current.slice(MAX_WISHLIST_ITEMS).map(p => p.productId) } } });
    }
    const retained = new Set(current.slice(0, MAX_WISHLIST_ITEMS).map(p => p.productId));
    let unmergedIds: string[] = [];
    if (mode === 'clear') await tx.wishlistItem.deleteMany({ where: { userId } });
    else if (mode === 'remove') await tx.wishlistItem.deleteMany({ where: { userId, productId: { in: ids } } });
    else {
      const valid = await tx.product.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
      const active = new Set(valid.map(p => p.id));
      const additions = ids.filter(id => active.has(id) && !retained.has(id));
      if (mode === 'add' && !active.has(ids[0])) return { ok: false, code: 'INVALID_PRODUCT' };
      const remaining = MAX_WISHLIST_ITEMS - retained.size;
      if (mode === 'add' && additions.length > remaining) return { ok: false, code: 'LIMIT' };
      if (mode === 'merge') unmergedIds = additions.slice(remaining);
      if (additions.length) await tx.wishlistItem.createMany({ data: additions.slice(0, remaining).map(productId => ({ userId, productId })), skipDuplicates: true });
    }
    return { ok: true, items: await loadWishlistProducts(userId, tx), unmergedIds };
  });
}

/** A failed read is distinct from a successfully empty account. */
export async function getWishlistAction(): Promise<WishlistResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, code: 'UNAUTHORIZED' };
  try {
    return { ok: true, items: await loadWishlistProducts(userId) };
  } catch (err) {
    logError('wishlist_get_failed', err, { operation: 'get_wishlist' });
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

/**
 * Fusión al iniciar sesión: unión (cuenta ∪ local) sin duplicados.
 * Devuelve la lista resultante para que el cliente la adopte.
 */
export async function mergeWishlistAction(
  localProductIds: string[],
): Promise<WishlistResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, code: 'UNAUTHORIZED' };
  try {
    const ids = [...new Set(localProductIds)].filter(
      (id) => typeof id === 'string' && id.length > 0 && id.length < 40,
    ).slice(0, MAX_WISHLIST_ITEMS);

    return await mutateWishlist(userId, ids, 'merge');
  } catch (err) {
    logError('wishlist_merge_failed', err, { operation: 'merge_wishlist' });
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

export async function addWishlistItemAction(productId: string): Promise<WishlistResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, code: 'UNAUTHORIZED' };
  if (!productId || productId.length > 40) return { ok: false, code: 'INVALID_PRODUCT' };
  try {
    return await mutateWishlist(userId, [productId], 'add');
  } catch (err) {
    // FK violation = producto inexistente; best-effort, la UI ya se actualizó.
    logError('wishlist_add_failed', err, { operation: 'add_wishlist_item' });
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

export async function removeWishlistItemAction(productId: string): Promise<WishlistResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, code: 'UNAUTHORIZED' };
  try {
    return await mutateWishlist(userId, [productId], 'remove');
  } catch (err) {
    logError('wishlist_remove_failed', err, { operation: 'remove_wishlist_item' });
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

export async function clearWishlistAction(): Promise<WishlistResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, code: 'UNAUTHORIZED' };
  try {
    return await mutateWishlist(userId, [], 'clear');
  } catch (err) {
    logError('wishlist_clear_failed', err, { operation: 'clear_wishlist' });
    return { ok: false, code: 'UNAVAILABLE' };
  }
}
