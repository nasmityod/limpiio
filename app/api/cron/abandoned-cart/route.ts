import { NextRequest, NextResponse } from 'next/server';
import { getCartsFor24hEmail, getCartsFor72hEmail, refreshAbandonedCartItems } from '@/lib/abandoned-cart';
import { enqueueAbandonedReminder, enqueuePendingRestockNotifications, processEmailDeliveries } from '@/lib/email-delivery';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Platform headers are supplied by public clients too; authenticate every
  // production invocation with the configured bearer secret.
  return secret ? verifyBearerSecret(req, secret) : process.env.NODE_ENV === 'development';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const waves = [
      { carts: await getCartsFor24hEmail(), wave: '24h' as const },
      { carts: await getCartsFor72hEmail(), wave: '72h' as const },
    ];
    let enqueueErrors = 0;
    for (const { carts, wave } of waves) {
      for (const cart of carts) {
        try {
          const snapshot = await refreshAbandonedCartItems(cart.items);
          if (snapshot) await enqueueAbandonedReminder(cart.id, wave, snapshot);
        } catch (error) {
          enqueueErrors++;
          logError('abandoned_cart_enqueue_failed', error, { operation: 'abandoned_cart' });
        }
      }
    }
    await enqueuePendingRestockNotifications();
    const result = await processEmailDeliveries(['ABANDONED_24H', 'ABANDONED_72H', 'RESTOCK', 'TRANSACTIONAL']);
    const sent24h = result.accepted.ABANDONED_24H || 0;
    const sent72h = result.accepted.ABANDONED_72H || 0;
    logInfo('cron_abandoned_cart', { count: sent24h + sent72h, operation: 'abandoned_cart' });
    return NextResponse.json({
      ok: enqueueErrors === 0 && result.failed === 0 && result.review === 0,
      sent24h, sent72h, acceptedRestock: result.accepted.RESTOCK || 0,
      acceptedTransactional: result.accepted.TRANSACTIONAL || 0,
      errors: enqueueErrors + result.failed, deferred: result.deferred, needsReview: result.review,
      // Counts describe API acceptance; final inbox delivery requires provider webhooks.
    });
  } catch (error) {
    logError('cron_abandoned_cart_error', error, { operation: 'abandoned_cart' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
