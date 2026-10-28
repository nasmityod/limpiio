import type { Prisma } from '@prisma/client';
import type { OrderConfirmationPayload } from '@/emails/transactional/types';
import { absoluteEmailUrl } from '@/emails/transactional/site';
import { d, dn } from '@/lib/decimal';
import { roundMoney2 } from '@/lib/exchange-rate';

type ConfirmationOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;
type ConfirmationProduct = { id: string; slug: string | null; images: string[]; media: { url: string }[] };

/** Checkout and manual resend share the stored financial/shipping snapshot. */
export function buildOrderConfirmationPayload(
  order: ConfirmationOrder,
  email: string,
  products: ConfirmationProduct[],
  guestToken: string | null = null,
): OrderConfirmationPayload {
  const productById = new Map(products.map((product) => [product.id, product]));
  const storedRate = dn(order.exchangeRateUsdBs);
  const rate = storedRate != null && storedRate > 0 ? storedRate : null;
  const toUsd = (amount: number) => roundMoney2(rate ? amount / rate : amount);
  const total = d(order.total);
  const couponDiscount = dn(order.couponDiscount) ?? 0;
  const paymentDiscount = dn(order.paymentDiscount) ?? 0;
  const paymentDiscountPercent = dn(order.paymentDiscountPercent);
  const subtotal = dn(order.subtotalBeforeDiscount) ?? roundMoney2(total + couponDiscount + paymentDiscount);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName.trim() || 'Cliente',
    email,
    createdAt: order.createdAt,
    status: order.status,
    items: order.items.map((item) => {
      const product = productById.get(item.productId);
      return {
        name: item.productName,
        slug: product?.slug?.trim() || item.productId,
        image: absoluteEmailUrl(item.imageUrl || product?.images[0]?.trim() || product?.media[0]?.url?.trim() || null),
        priceUsd: toUsd(d(item.price)),
        quantity: item.quantity,
      };
    }),
    subtotalUsd: toUsd(subtotal),
    // The store never collects carrier charges. Shipping is paid at destination,
    // free, or pickup; the saved address/benefit determines its visible label.
    shippingUsd: 0,
    totalUsd: toUsd(total),
    // Legacy orders without a rate store USD. Never relabel those values as Bs.
    ...(rate ? { subtotalBs: subtotal, shippingBs: 0, totalBs: total } : {}),
    exchangeRateUsdBs: rate,
    ...(couponDiscount > 0 ? {
      couponDiscountUsd: toUsd(couponDiscount),
      ...(rate ? { couponDiscountBs: couponDiscount } : {}),
    } : {}),
    ...(paymentDiscount > 0 ? {
      paymentDiscountUsd: toUsd(paymentDiscount),
      ...(rate ? { paymentDiscountBs: paymentDiscount } : {}),
    } : {}),
    ...(paymentDiscountPercent != null && paymentDiscountPercent > 0 ? { paymentDiscountPercent } : {}),
    paymentCurrency: order.paymentCurrency ?? null,
    paymentMethod: order.paymentMethod,
    paymentBank: order.paymentBank,
    paymentReference: order.paymentReference,
    shippingAddress: order.shippingAddress,
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    shippingZipCode: order.shippingZipCode,
    shippingCountry: order.shippingCountry,
    customerPhone: order.customerPhone,
    shippingMethod: order.trackingCarrier ?? null,
    freeShipping: order.freeShipping === true,
    guestToken,
    customerIsGuest: order.customerId == null,
  };
}
