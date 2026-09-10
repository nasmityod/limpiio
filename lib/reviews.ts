/**
 * reviews.ts
 * Lógica de reseñas/valoraciones de productos: mapeo, agregados (promedio,
 * distribución) y configuración de moderación (auto-aprobación).
 */
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { isR2PublicUrl, keyFromR2PublicUrl } from '@/lib/r2';
import type { OrderStatus, Review, ReviewStatus, ReviewSummary } from '@/lib/definitions';

type DbClient = Prisma.TransactionClient;

export const REVIEWS_AUTO_APPROVE_KEY = 'reviews_auto_approve';
export const MAX_REVIEW_PHOTOS = 4;

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1, 'La valoración mínima es 1.').max(5, 'La valoración máxima es 5.'),
  title: z.string().trim().max(120).optional().nullable(),
  comment: z
    .string()
    .trim()
    .min(5, 'Cuéntanos un poco más (mínimo 5 caracteres).')
    .max(2000, 'La reseña es demasiado larga.'),
  authorName: z.string().trim().min(2).max(60).optional().nullable(),
  photos: z
    .array(z.string().url())
    .max(MAX_REVIEW_PHOTOS, `Máximo ${MAX_REVIEW_PHOTOS} fotos.`)
    .optional()
    .default([])
    .refine(
      (urls) =>
        urls.every((u) => {
          const key = keyFromR2PublicUrl(u);
          return isR2PublicUrl(u) && key !== null && key.startsWith('reviews/');
        }),
      'Una de las fotos no es válida.',
    ),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;

/** Mapea un registro Prisma de Review al tipo de UI. */
export function reviewToClient(r: {
  id: string;
  productId: string;
  userId: string | null;
  authorName: string;
  rating: number;
  title: string | null;
  comment: string;
  status: string;
  verifiedPurchase: boolean;
  adminReply: string | null;
  photos: string[];
  createdAt: Date;
  product?: { name: string } | null;
}): Review {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.product?.name,
    userId: r.userId,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    status: r.status as ReviewStatus,
    verifiedPurchase: r.verifiedPurchase,
    adminReply: r.adminReply,
    photos: r.photos ?? [],
    createdAt: r.createdAt.toISOString(),
  };
}

const EMPTY_BREAKDOWN: ReviewSummary['breakdown'] = [0, 0, 0, 0, 0];

/** Resumen (promedio + distribución) de reseñas APROBADAS de un producto. */
export async function getReviewSummary(productId: string): Promise<ReviewSummary> {
  const grouped = await prisma.review.groupBy({
    by: ['rating'],
    where: { productId, status: 'APPROVED' },
    _count: { _all: true },
  });

  const breakdown: ReviewSummary['breakdown'] = [0, 0, 0, 0, 0];
  let count = 0;
  let sum = 0;
  for (const g of grouped) {
    const n = g._count._all;
    const idx = Math.min(4, Math.max(0, g.rating - 1));
    breakdown[idx] += n;
    count += n;
    sum += g.rating * n;
  }
  const average = count ? Math.round((sum / count) * 10) / 10 : 0;
  return { average, count, breakdown };
}

/** Resúmenes por producto (batch, sin N+1) para listados y tarjetas. */
export async function getReviewSummariesMap(
  productIds: string[],
): Promise<Map<string, ReviewSummary>> {
  const map = new Map<string, ReviewSummary>();
  if (productIds.length === 0) return map;

  const grouped = await prisma.review.groupBy({
    by: ['productId', 'rating'],
    where: { productId: { in: productIds }, status: 'APPROVED' },
    _count: { _all: true },
  });

  const acc = new Map<string, { sum: number; count: number; breakdown: number[] }>();
  for (const g of grouped) {
    const cur = acc.get(g.productId) ?? { sum: 0, count: 0, breakdown: [0, 0, 0, 0, 0] };
    const n = g._count._all;
    const idx = Math.min(4, Math.max(0, g.rating - 1));
    cur.breakdown[idx] += n;
    cur.count += n;
    cur.sum += g.rating * n;
    acc.set(g.productId, cur);
  }

  for (const [productId, v] of acc) {
    map.set(productId, {
      average: v.count ? Math.round((v.sum / v.count) * 10) / 10 : 0,
      count: v.count,
      breakdown: v.breakdown as ReviewSummary['breakdown'],
    });
  }
  return map;
}

/** Lista reseñas APROBADAS de un producto (para la ficha pública). */
export async function getApprovedReviews(productId: string, limit = 50): Promise<Review[]> {
  const rows = await prisma.review.findMany({
    where: { productId, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(reviewToClient);
}

/** ¿Auto-aprobar reseñas nuevas? Config en AppConfig (editable desde el panel). */
export async function readReviewsAutoApprove(): Promise<boolean> {
  try {
    const rec = await prisma.appConfig.findUnique({ where: { key: REVIEWS_AUTO_APPROVE_KEY } });
    return rec?.value === 'true';
  } catch {
    return false;
  }
}

export async function writeReviewsAutoApprove(value: boolean): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: REVIEWS_AUTO_APPROVE_KEY },
    update: { value: value ? 'true' : 'false' },
    create: { key: REVIEWS_AUTO_APPROVE_KEY, value: value ? 'true' : 'false' },
  });
}

/**
 * ¿El usuario compró este producto?
 * PRD-208: el badge «compra verificada» exige pago confirmado — pedido con
 * `paidAt` sellado (validación de pago del admin) o ya `Entregado` (pedidos
 * legados sin paidAt). Un pedido apenas «Pendiente» sin pago NO cuenta.
 */
export async function hasPurchasedProduct(
  db: DbClient,
  userId: string,
  productId: string,
): Promise<boolean> {
  const order = await db.order.findFirst({
    where: {
      customerId: userId,
      status: { not: 'Cancelado' satisfies OrderStatus },
      OR: [
        { paidAt: { not: null } },
        { status: 'Entregado' satisfies OrderStatus },
      ],
      items: { some: { productId } },
    },
    select: { id: true },
  });
  return !!order;
}

export const EMPTY_REVIEW_SUMMARY: ReviewSummary = {
  average: 0,
  count: 0,
  breakdown: EMPTY_BREAKDOWN,
};
