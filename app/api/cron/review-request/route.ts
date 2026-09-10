import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendReviewRequestEmail } from '@/lib/resend';
import type { ReviewRequestProduct } from '@/emails/mundotech/ReviewRequestEmail';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * FASE 4.5 (MEJORA 2.2) — cron de solicitud de reseña post-entrega.
 *
 * A los 7 días de que un pedido pasó a 'Entregado' envía UN email (sin
 * incentivo) con deep-link al formulario de reseña de cada producto comprado.
 * Marca reviewRequestSentAt para no reenviar jamás.
 *
 * Reglas conservadoras:
 * - Solo pedidos entregados entre hace 7 y 30 días: al estrenar el cron no se
 *   bombardea a clientes de pedidos antiguos.
 * - deliveredAt (backfilled con updatedAt en la migración) como fecha base.
 * - Máx. 25 emails por corrida (el cron corre a diario).
 * - reviewRequestSentAt se marca con updateMany condicional ANTES de enviar:
 *   dos corridas concurrentes no pueden duplicar el email (el que no "ganó"
 *   la marca, no envía).
 *
 * Crontab (root, TZ America/Caracas — ver deploy/crontab.vps):
 *   0 10 * * * . /etc/mundotech/mundotech.env; curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/review-request >> /var/log/mundotech-cron.log 2>&1
 */

const WINDOW_MIN_DAYS = 7;
const WINDOW_MAX_DAYS = 30;
const BATCH_LIMIT = 25;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return verifyBearerSecret(request, cronSecret);
}

function firstNameFrom(displayName: string): string {
  const t = displayName.trim();
  if (!t) return 'Cliente';
  return t.split(/\s+/)[0] ?? t;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com').replace(/\/$/, '');
  const now = Date.now();
  const newestEligible = new Date(now - WINDOW_MIN_DAYS * 24 * 60 * 60 * 1000);
  const oldestEligible = new Date(now - WINDOW_MAX_DAYS * 24 * 60 * 60 * 1000);

  try {
    const candidates = await prisma.order.findMany({
      where: {
        status: 'Entregado',
        reviewRequestSentAt: null,
        deliveredAt: { gte: oldestEligible, lte: newestEligible },
        customerEmail: { not: null },
      },
      orderBy: { deliveredAt: 'asc' },
      take: BATCH_LIMIT,
      select: {
        id: true,
        customerName: true,
        customerEmail: true,
        items: {
          select: {
            productId: true,
            productName: true,
            imageUrl: true,
            product: { select: { slug: true, isActive: true } },
          },
        },
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const order of candidates) {
      const email = order.customerEmail?.trim();
      if (!email) {
        skipped++;
        continue;
      }

      // Deduplicar productos del pedido y descartar despublicados
      // (la ficha ya no existe → el deep-link daría 404).
      const seen = new Set<string>();
      const products: ReviewRequestProduct[] = [];
      for (const item of order.items) {
        if (seen.has(item.productId)) continue;
        seen.add(item.productId);
        if (!item.product?.isActive || !item.product.slug) continue;
        products.push({
          name: item.productName,
          reviewUrl: `${base}/product/${encodeURIComponent(item.product.slug)}?review=1`,
          imageUrl: item.imageUrl ?? undefined,
        });
      }

      // Reclamar el pedido de forma atómica ANTES de enviar: si otra corrida
      // concurrente ya lo marcó, count === 0 y no se duplica el email.
      const claimed = await prisma.order.updateMany({
        where: { id: order.id, reviewRequestSentAt: null },
        data: { reviewRequestSentAt: new Date() },
      });
      if (claimed.count === 0) {
        skipped++;
        continue;
      }

      if (products.length === 0) {
        // Sin fichas activas que reseñar — se marca para no reintentar.
        skipped++;
        continue;
      }

      const ok = await sendReviewRequestEmail({
        email,
        customerName: firstNameFrom(order.customerName),
        products,
      });
      if (ok) sent++;
      else skipped++;
    }

    if (sent > 0 || skipped > 0) {
      logInfo('cron_review_request', { count: sent, operation: 'review_request' });
    }

    return NextResponse.json({ ok: true, sent, skipped, candidates: candidates.length });
  } catch (error) {
    logError('cron_review_request_error', error, { operation: 'review_request' });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
