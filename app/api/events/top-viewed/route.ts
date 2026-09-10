import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';

/** Ventana de calidad del ranking: solo vistas de los últimos 90 días. */
const RANKING_WINDOW_DAYS = 90;

/**
 * GET /api/events/top-viewed
 * Devuelve los 20 productos más vistos (requiere admin).
 *
 * PRD-184: filtro de calidad — solo cuentan vistas con sessionId (las vistas
 * antiguas sin sesión / infladas por bots quedan fuera) y dentro de la ventana
 * de 90 días, para que el admin no decida merchandising con datos falsos.
 * // DEPENDENCIA-03: la purga/TTL física de ProductView vive en 03-INFRA (PRD-126).
 */
export async function GET() {
  const auth = await requirePermission('ANALYTICS');
  if (!auth.authorized) return auth.response;

  const windowStart = new Date(Date.now() - RANKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const grouped = await prisma.productView.groupBy({
    by:        ['productId'],
    where:     {
      sessionId: { not: null },
      createdAt: { gte: windowStart },
    },
    _count:    { productId: true },
    orderBy:   { _count: { productId: 'desc' } },
    take:      20,
  });

  if (grouped.length === 0) return NextResponse.json([]);

  const productIds = grouped.map(g => g.productId);
  const products   = await prisma.product.findMany({
    where:  { id: { in: productIds } },
    select: { id: true, name: true },
  });

  const nameMap = new Map(products.map(p => [p.id, p.name]));

  const result = grouped.map(g => ({
    productId:   g.productId,
    productName: nameMap.get(g.productId) ?? 'Producto eliminado',
    viewCount:   g._count.productId,
  }));

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, no-cache' },
  });
}
