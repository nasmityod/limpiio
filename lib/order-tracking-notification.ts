import type { Prisma } from '@prisma/client';
import { queueTransactionalEmails } from '@/lib/email-outbox-context';
import { orderPathSegment } from '@/lib/order-ref';

type TrackingSnapshot = {
  status: string; orderNumber: number; customerEmail: string | null; customerName: string;
  trackingNumber: string | null; trackingCarrier: string | null; trackingUrl: string | null;
  customer?: { email: string; name: string | null } | null;
};
const text = (value: string | null | undefined) => value?.trim() ?? '';

/** New guide and meaningful corrections notify through the same durable path
 * whether saved by the shipping transition or the tracking editor. */
export async function queueTrackingNotification(
  tx: Prisma.TransactionClient, previous: TrackingSnapshot, current: TrackingSnapshot,
) {
  const guide = text(current.trackingNumber);
  if (current.status !== 'Enviado' || !guide) return;
  const changed = previous.status !== 'Enviado' ||
    (['trackingNumber', 'trackingCarrier', 'trackingUrl'] as const).some(key => text(previous[key]) !== text(current[key]));
  if (!changed) return;
  const recipient = text(current.customerEmail) || text(current.customer?.email);
  if (!recipient) return;
  const firstName = (text(current.customerName) || text(current.customer?.name)).split(/\s+/)[0] || 'Cliente';
  const { sendShippingEmail } = await import('@/lib/resend');
  await queueTransactionalEmails(tx, () => sendShippingEmail(recipient, firstName, guide, {
    carrier: current.trackingCarrier, trackingUrl: current.trackingUrl, orderId: orderPathSegment(current.orderNumber),
  }));
}
