import { prisma } from '@/lib/prisma';
import type { CartItemAPI } from '@/lib/definitions';
import { d, dn } from '@/lib/decimal';
import { PRODUCT_CARD_SELECT } from '@/lib/product-select';
import type { Prisma } from '@prisma/client';
type Decimal = Prisma.Decimal;

/** Selección base de campos de producto que expone la API de carrito. */
const PRODUCT_SELECT = PRODUCT_CARD_SELECT;

/** Mapea un CartItem con producto incluido al shape CartItemAPI. */
function toCartItemAPI(item: {
  id: string;
  productId: string;
  quantity: number;
  product: {
    name: string;
    slug: string | null;
    price: Decimal | number;
    originalPrice: Decimal | number | null;
    stock: number;
    category: string;
    brand: string | null;
    images: string[];
    freeShipping: boolean;
  };
}): CartItemAPI {
  return {
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    name: item.product.name,
    slug: item.product.slug,
    // PRD-204: convertir Decimal → number en frontera BD→UI
    price: d(item.product.price),
    originalPrice: dn(item.product.originalPrice),
    stock: item.product.stock,
    category: item.product.category,
    brand: item.product.brand,
    images: item.product.images,
    // La BD es la fuente de verdad: reemplaza cualquier valor viejo del cliente.
    freeShipping: item.product.freeShipping === true,
  };
}

/**
 * Devuelve los ítems del carrito del usuario con datos de producto actualizados.
 * Si no tiene carrito, retorna array vacío.
 */
export async function getUserCart(userId: string): Promise<CartItemAPI[]> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: { product: { select: PRODUCT_SELECT } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!cart) return [];

  return cart.items.map(toCartItemAPI);
}

/**
 * Inserta o actualiza un ítem en el carrito del usuario.
 * Si quantity <= 0, elimina el ítem.
 *
 * PRD-105: la cantidad se valida TAMBIÉN en servidor — un PATCH directo no
 * puede inflar el carrito por encima del stock real ni guardar productos
 * eliminados del catálogo. La cantidad final se recorta a `stock`.
 */
export async function upsertCartItem(
  userId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId, updatedAt: new Date() },
    update: { updatedAt: new Date() },
    select: { id: true },
  });

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stock: true },
  });

  const clampedQuantity = product ? Math.min(quantity, product.stock) : 0;

  if (clampedQuantity <= 0) {
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId },
    });
    return;
  }

  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity: clampedQuantity },
    update: { quantity: clampedQuantity, updatedAt: new Date() },
  });
}

/** Elimina un ítem del carrito por productId. */
export async function removeCartItem(userId: string, productId: string): Promise<void> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!cart) return;

  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id, productId },
  });
}

/** Elimina todos los ítems del carrito del usuario. */
export async function clearUserCart(userId: string): Promise<void> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!cart) return;

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
}

/**
 * Fusiona ítems locales (localStorage al hacer login) con el carrito en BD.
 * Estrategia: para cada producto, usa max(cantidad_local, cantidad_bd), capado al stock real.
 * Retorna el carrito resultante enriquecido con datos de producto.
 */
export async function mergeCart(
  userId: string,
  localItems: { productId: string; quantity: number }[],
): Promise<CartItemAPI[]> {
  // Si no hay ítems locales, simplemente devolvemos el carrito actual
  if (localItems.length === 0) {
    return getUserCart(userId);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Obtener o crear el carrito
    const cart = await tx.cart.upsert({
      where: { userId },
      create: { userId, updatedAt: new Date() },
      update: { updatedAt: new Date() },
      include: { items: { select: { productId: true, quantity: true } } },
    });

    // Recopilar todos los productIds involucrados
    const allProductIds = [
      ...new Set([
        ...cart.items.map((i) => i.productId),
        ...localItems.map((i) => i.productId),
      ]),
    ];

    // Consultar stock actual de todos los productos
    const products = await tx.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, stock: true },
    });
    const stockMap = new Map(products.map((p) => [p.id, p.stock]));

    // Construir mapa merged: max(local, db).
    const merged = new Map<string, number>(
      cart.items.map((i) => [i.productId, i.quantity]),
    );
    for (const local of localItems) {
      const current = merged.get(local.productId) ?? 0;
      merged.set(local.productId, Math.max(current, local.quantity));
    }

    // PRD-023: el recorte a stock aplica a TODAS las líneas resultantes —
    // también a las que ya estaban en BD con cantidades viejas — para que el
    // checkout no falle tarde por inventario que bajó mientras tanto.
    for (const [productId, quantity] of merged.entries()) {
      const stock = stockMap.get(productId) ?? 0;
      const clamped = Math.min(quantity, stock);

      if (clamped <= 0) {
        await tx.cartItem.deleteMany({
          where: { cartId: cart.id, productId },
        });
        continue;
      }

      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        create: { cartId: cart.id, productId, quantity: clamped },
        update: { quantity: clamped, updatedAt: new Date() },
      });
    }

    return cart.id;
  });

  // Devolvemos el carrito completo post-merge con datos de producto frescos
  const finalCart = await prisma.cart.findUnique({
    where: { id: result },
    include: {
      items: {
        include: { product: { select: PRODUCT_SELECT } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return finalCart ? finalCart.items.map(toCartItemAPI) : [];
}
