/**
 * Helpers puros de filtrado/orden de estanterías (testeables sin Next/Prisma).
 */
export type HomeShelfProduct = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  stock: number;
  category: string;
  brand: string | null;
  images: string[];
  freeShipping: boolean;
};

/** Filtra ofertas reales y limita (post Decimal convert). */
export function filterOfferShelfProducts(
  products: HomeShelfProduct[],
  limit = 8,
): HomeShelfProduct[] {
  return products
    .filter((p) => p.originalPrice != null && p.originalPrice > p.price)
    .slice(0, limit);
}

/** Reordena productos según featuredProductIds; omite ausentes. */
export function orderFeaturedProducts(
  products: HomeShelfProduct[],
  featuredProductIds: string[],
): HomeShelfProduct[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return featuredProductIds
    .map((id) => byId.get(id))
    .filter((p): p is HomeShelfProduct => Boolean(p));
}
