import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { dn } from '@/lib/decimal';

/**
 * GET /api/admin/product-costs?ids=<id1,id2,…>
 *
 * Devuelve `{ [productId]: costoUnitarioUsd }` **solo** para los ids pedidos.
 *
 * ANTES (RC-08 de la auditoría de rendimiento): hacía
 * `prisma.product.findMany({ select: { id: true, cost: true } })` sin filtro y
 * devolvía el mapa de costes de TODO el catálogo. La página de Estadísticas lo
 * usa únicamente para calcular la ganancia estimada de los `topProducts`, que
 * son 20 como máximo: con 5 000 productos ya se enviaban 254 KB al navegador
 * para usar 20 valores, y con 20 000 serían ~1 MB. Además el coste es un dato
 * sensible del negocio (ver comentario del campo en prisma/schema.prisma): no
 * hay motivo para volcar el catálogo entero al cliente.
 *
 * Sigue exigiendo permiso CATALOG; el cambio es de superficie de datos, no de
 * autorización.
 */

/** Tope de ids por petición. `fetchTopProducts` devuelve 20 como máximo. */
const MAX_IDS = 50;

export async function GET(request: Request) {
  const auth = await requirePermission('CATALOG');
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('ids') ?? '';

  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 128);

  if (ids.length === 0) {
    return NextResponse.json(
      {
        message:
          'Parámetro ids requerido: indica los productos cuyo costo necesitas (máximo ' +
          `${MAX_IDS}).`,
      },
      { status: 400 },
    );
  }

  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { message: `Demasiados ids: el máximo por petición es ${MAX_IDS}.` },
      { status: 400 },
    );
  }

  try {
    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, cost: true },
    });
    const map: Record<string, number> = {};
    for (const p of products) {
      const c = dn(p.cost);
      if (c != null && c > 0) map[p.id] = c;
    }
    return NextResponse.json(map, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logError('product_costs_get_failed', error, { route: '/api/admin/product-costs' });
    return NextResponse.json({ message: 'Error al obtener costos.' }, { status: 500 });
  }
}
