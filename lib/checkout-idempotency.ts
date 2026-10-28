import { createHash, createHmac } from 'crypto';
import type { CheckoutInput } from '@/lib/checkout-order';
import { CheckoutError } from '@/lib/checkout-error';

export function checkoutOperationKey(buyer: string, attempt: string | undefined): string {
  if (!attempt || !/^[A-Za-z0-9_-]{16,128}$/.test(attempt)) throw new CheckoutError('Falta la identidad del intento de compra. Recarga e intenta de nuevo.', 400);
  return createHash('sha256').update(JSON.stringify([buyer, attempt])).digest('hex');
}

export function checkoutPayloadHash(input: CheckoutInput): string {
  const totals = new Map<string, number>();
  for (const item of input.items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  const payload = {
    customerId: input.customerId, customerName: input.customerName,
    customerEmail: input.customerEmail?.toLowerCase() ?? null,
    customerPhone: input.customerPhone ?? null, customerIdNumber: input.customerIdNumber ?? null,
    shippingMethod: input.shippingMethod ?? null, shippingDetails: input.shippingDetails,
    paymentMethodId: input.paymentMethodId, paymentCurrency: input.paymentCurrency ?? null,
    paymentBank: input.paymentBank ?? null, paymentHolderIdNumber: input.paymentHolderIdNumber ?? null,
    paymentHolderPhone: input.paymentHolderPhone ?? null, paymentReference: input.paymentReference ?? null,
    paymentUploadToken: input.paymentUploadToken ?? null, couponCode: input.couponCode?.toUpperCase() ?? null,
    channel: input.channel, items: [...totals].sort(([a], [b]) => a.localeCompare(b)),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Re-derivable secret capability, so a lost checkout response can be retried safely. */
export function checkoutCapability(purpose: 'guest' | 'cashea', operationKey: string): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new CheckoutError('La tienda no tiene configurada la seguridad del checkout.', 503);
  return createHmac('sha256', secret).update(`${purpose}:${operationKey}`).digest('base64url');
}
