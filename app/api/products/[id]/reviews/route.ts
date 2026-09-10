import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth/next';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin, safeZodFlatten } from '@/lib/security';
import {
  reviewInputSchema,
  reviewToClient,
  getReviewSummary,
  getApprovedReviews,
  readReviewsAutoApprove,
  hasPurchasedProduct,
} from '@/lib/reviews';
import { logError } from '@/lib/safe-logger';

/** GET /api/products/[id]/reviews — reseñas aprobadas + resumen (público). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // SEC-03 (AUDITORIA-2026-07): rate limit por IP contra scraping de reseñas.
  const ip = getClientIp(req);
  if (await rateLimit(`reviews:get:ip:${ip}`, { limit: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Demasiadas solicitudes.' }, { status: 429 });
  }

  try {
    const { id } = await params;
    const [summary, reviews] = await Promise.all([
      getReviewSummary(id),
      getApprovedReviews(id),
    ]);
    // PRD-141: sin caché — al publicar/moderar una reseña (o al dejar la propia)
    // el cliente debe verla de inmediato; el costo por request es bajo (groupBy +
    // findMany limitado) y evita servir contadores/reseñas obsoletos.
    return NextResponse.json(
      { summary, reviews },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logError('product_reviews_get_failed', error, { route: '/api/products/[id]/reviews' });
    return NextResponse.json({ error: 'No se pudieron cargar las reseñas.' }, { status: 500 });
  }
}

/** POST /api/products/[id]/reviews — crear reseña (requiere sesión). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const ip = getClientIp(request);
  if (await rateLimit(`reviews:post:ip:${ip}`, { limit: 8, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
  }

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId || userId === 'guest') {
      return NextResponse.json(
        { error: 'Debes iniciar sesión para dejar una reseña.' },
        { status: 401 }
      );
    }

    const { id: productId } = await params;
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado.' }, { status: 404 });
    }

    const parsed = reviewInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de la reseña inválidos.', errors: safeZodFlatten(parsed.error.flatten()) },
        { status: 422 }
      );
    }

    // Una reseña por usuario y producto.
    const existing = await prisma.review.findFirst({
      where: { productId, userId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Ya dejaste una reseña para este producto.' },
        { status: 409 }
      );
    }

    const data = parsed.data;
    const sessionName = (session.user?.name ?? '').trim();
    const authorName = (data.authorName?.trim() || sessionName || 'Cliente').slice(0, 60);

    const verifiedPurchase = await hasPurchasedProduct(prisma, userId, productId);
    const autoApprove = await readReviewsAutoApprove();

    // PRD-161: el auto-approve solo aplica a compras verificadas. Una reseña
    // sin compra siempre pasa por moderación — evita reseñas falsas públicas.
    const approved = autoApprove && verifiedPurchase;

    let review;
    try {
      review = await prisma.review.create({
        data: {
          productId,
          userId,
          authorName,
          rating: data.rating,
          title: data.title?.trim() || null,
          comment: data.comment.trim(),
          photos: data.photos ?? [],
          verifiedPurchase,
          status: approved ? 'APPROVED' : 'PENDING',
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return NextResponse.json(
          { error: 'Ya dejaste una reseña para este producto.' },
          { status: 409 }
        );
      }
      throw e;
    }

    if (approved) {
      try {
        const prod = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true } });
        revalidatePath(`/product/${prod?.slug ?? productId}`);
      } catch (e) {
        logError('product_reviews_revalidate_failed', e, { operation: 'revalidate_product_reviews' });
      }
    }

    return NextResponse.json(
      {
        review: reviewToClient(review),
        moderated: !approved,
        message: approved
          ? '¡Gracias por tu reseña!'
          : '¡Gracias! Tu reseña será publicada tras una breve revisión.',
      },
      { status: 201 }
    );
  } catch (error) {
    logError('product_reviews_post_failed', error, { route: '/api/products/[id]/reviews' });
    return NextResponse.json({ error: 'No se pudo guardar la reseña.' }, { status: 500 });
  }
}
