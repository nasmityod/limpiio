import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';

/** Tope de antigüedad del polling: nada anterior a 24 h cuenta como «nuevo». */
const MAX_SINCE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * PRD-226: el polling viaja con frecuencia y alimenta notificaciones; el nombre
 * se enmascara (nombre de pila + inicial) para minimizar la PII expuesta.
 */
function maskCustomerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Cliente';
  const first = parts[0];
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : '';
  return `${first}${lastInitial}`;
}

/**
 * GET /api/orders/new-count?since=ISO
 * Devuelve la cantidad de pedidos creados después de `since`.
 * Si no se pasa `since`, devuelve los de las últimas 24 h.
 *
 * Uso: polling cada 15-30s desde el panel admin para mostrar
 * notificaciones (sonido + vibración + badge).
 *
 * PRD-222: `since` se acota en servidor a 24 h hacia atrás — un localStorage
 * borrado o muy viejo en el watcher ya no re-alerta pedidos antiguos en masa.
 */
export async function GET(request: Request) {
  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');
  let sinceDate = since ? new Date(since) : new Date(Date.now() - MAX_SINCE_AGE_MS);

  if (Number.isNaN(sinceDate.getTime())) {
    return NextResponse.json({ error: 'Parámetro since inválido.' }, { status: 400 });
  }

  // PRD-222: clamp server-side, no depende del estado local del navegador admin
  const floor = Date.now() - MAX_SINCE_AGE_MS;
  if (sinceDate.getTime() < floor) sinceDate = new Date(floor);

  try {
    const [count, latest] = await Promise.all([
      prisma.order.count({
        where: { createdAt: { gt: sinceDate } },
      }),
      prisma.order.findMany({
        where: { createdAt: { gt: sinceDate } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          total: true,
          exchangeRateUsdBs: true,
          createdAt: true,
          status: true,
        },
      }),
    ]);

    return NextResponse.json({
      count,
      latest: latest.map(o => ({
        ...o,
        // PRD-226: nombre minimizado en el payload de polling
        customerName: maskCustomerName(o.customerName),
      })),
    });
  } catch (error) {
    logError('orders_new_count_failed', error, { route: '/api/orders/new-count' });
    return NextResponse.json(
      { error: 'Error al consultar nuevos pedidos.' },
      { status: 500 },
    );
  }
}
