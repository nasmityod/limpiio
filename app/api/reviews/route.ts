import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { reviewToClient, readReviewsAutoApprove } from '@/lib/reviews';
import { VALID_REVIEW_STATUSES, type ReviewStatus } from '@/lib/definitions';

/**
 * GET /api/reviews?status=PENDING|APPROVED|REJECTED|all&page=1&pageSize=50
 * Listado admin.
 * PRD-163: soporta paginación (`page` ≥ 1, `pageSize` 1–300) y devuelve
 * `total`/`page`/`pageSize`.
 *
 * Auditoría de rendimiento (RC-09): el default sin parámetros era 300 reseñas
 * completas por respuesta, y la UI admin no enviaba `page`, así que ése era el
 * comportamiento real. La UI ya pagina (25 por página); el default sin
 * parámetros baja a 50 para que ninguna llamada futura vuelva a arrastrar
 * cientos de filas por descuido. `pageSize` explícito sigue admitiendo hasta
 * 300 para usos puntuales.
 *
 * Los contadores (`counts`) salen de un `groupBy` sobre TODAS las reseñas, no
 * de la página devuelta: pendientes/aprobadas/rechazadas siguen siendo totales.
 */
export async function GET(request: Request) {
  const auth = await requirePermission('REVIEWS');
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    // PRD-122 (segmento 03): Review.status ahora es enum en Prisma — narrow al
    // union ReviewStatus (mismos literales) tras validar contra la whitelist.
    const statusFilter =
      statusParam && VALID_REVIEW_STATUSES.includes(statusParam as ReviewStatus)
        ? (statusParam as ReviewStatus)
        : null;
    const where = statusFilter ? { status: statusFilter } : {};

    const pageParam = Number.parseInt(searchParams.get('page') ?? '', 10);
    const sizeParam = Number.parseInt(searchParams.get('pageSize') ?? '', 10);
    const paginated = Number.isFinite(pageParam) && pageParam >= 1;
    const page = paginated ? pageParam : 1;
    const DEFAULT_PAGE_SIZE = 50;
    const pageSize = Number.isFinite(sizeParam)
      ? Math.min(300, Math.max(1, sizeParam))
      : DEFAULT_PAGE_SIZE;

    const [reviews, total, counts, autoApprove] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { product: { select: { name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.review.count({ where }),
      prisma.review.groupBy({ by: ['status'], _count: { _all: true } }),
      readReviewsAutoApprove(),
    ]);

    const countMap: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const c of counts) countMap[c.status] = c._count._all;

    return NextResponse.json(
      {
        reviews: reviews.map(reviewToClient),
        counts: countMap,
        autoApprove,
        total,
        page,
        pageSize,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logError('reviews_get_failed', error, { route: '/api/reviews' });
    return NextResponse.json({ error: 'No se pudieron cargar las reseñas.' }, { status: 500 });
  }
}
