import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { requirePermission } from '@/lib/admin-access-server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { reviewToClient, reviewInputSchema, readReviewsAutoApprove } from '@/lib/reviews';
import { VALID_REVIEW_STATUSES } from '@/lib/definitions';
import { logError } from '@/lib/safe-logger';

async function revalidateProductReviews(productId: string) {
  try {
    const prod = await prisma.product.findUnique({
      where: { id: productId },
      select: { slug: true },
    });
    revalidatePath(`/product/${prod?.slug ?? productId}`);
  } catch (e) {
    logError('reviews_revalidate_failed', e, { operation: 'revalidate_product_reviews' });
  }
}

const adminPatchSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  adminReply: z.string().trim().max(1000).optional().nullable(),
});

const authorPatchSchema = reviewInputSchema.pick({
  rating: true,
  title: true,
  comment: true,
  photos: true,
});

async function handleModeratorPatch(
  request: Request,
  id: string,
  body: unknown,
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('REVIEWS');
  if (!auth.authorized) return auth.response;

  const parsed = adminPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos.', errors: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { status, adminReply } = parsed.data;
  if (status && !VALID_REVIEW_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Estado de reseña no válido.' }, { status: 400 });
  }

  try {
    const review = await prisma.review.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(adminReply !== undefined ? { adminReply: adminReply?.trim() || null } : {}),
      },
    });
    await revalidateProductReviews(review.productId);
    return NextResponse.json(reviewToClient(review));
  } catch (error) {
    logError('reviews_patch_failed', error, { route: '/api/reviews/[id]' });
    return NextResponse.json({ error: 'No se pudo actualizar la reseña.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId || userId === 'guest') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);

  const existing = await prisma.review.findUnique({
    where: { id },
    select: { id: true, userId: true, verifiedPurchase: true, productId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const isAuthor = existing.userId === userId;
  const authorParsed = authorPatchSchema.safeParse(body);

  if (isAuthor && authorParsed.success) {
    if (!rejectInvalidMutationOrigin(request)) {
      return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
    }
    const ip = getClientIp(request);
    if (await rateLimit(`reviews:author-edit:${ip}`, { limit: 8, windowMs: 60_000 })) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
    }

    try {
      const autoApprove = await readReviewsAutoApprove();
      const approved = autoApprove && existing.verifiedPurchase;

      const review = await prisma.review.update({
        where: { id },
        data: {
          rating: authorParsed.data.rating,
          title: authorParsed.data.title?.trim() || null,
          comment: authorParsed.data.comment.trim(),
          photos: authorParsed.data.photos ?? [],
          status: approved ? 'APPROVED' : 'PENDING',
        },
      });

      await revalidateProductReviews(review.productId);

      return NextResponse.json({
        review: reviewToClient(review),
        moderated: !approved,
        message: approved
          ? 'Reseña actualizada.'
          : 'Reseña actualizada. Será visible tras una breve revisión.',
      });
    } catch (error) {
      logError('reviews_author_patch_failed', error, { route: '/api/reviews/[id]' });
      return NextResponse.json({ error: 'No se pudo actualizar la reseña.' }, { status: 500 });
    }
  }

  return handleModeratorPatch(request, id, body);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId || userId === 'guest') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.review.findUnique({
      where: { id },
      select: { id: true, userId: true, productId: true },
    });

    if (!existing) {
      return NextResponse.json({ success: true });
    }

    if (existing.userId === userId) {
      if (!rejectInvalidMutationOrigin(request)) {
        return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
      }
      const ip = getClientIp(request);
      if (await rateLimit(`reviews:author-delete:${ip}`, { limit: 8, windowMs: 60_000 })) {
        return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
      }

      await prisma.review.deleteMany({ where: { id, userId } });
      await revalidateProductReviews(existing.productId);
      return NextResponse.json({ success: true });
    }

    const originCheck = rejectInvalidMutationOrigin(request);
    if (originCheck) return originCheck;

    const auth = await requirePermission('REVIEWS');
    if (!auth.authorized) return auth.response;

    await prisma.review.deleteMany({ where: { id } });
    await revalidateProductReviews(existing.productId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logError('reviews_delete_failed', error, { route: '/api/reviews/[id]' });
    return NextResponse.json({ error: 'No se pudo eliminar la reseña.' }, { status: 500 });
  }
}
