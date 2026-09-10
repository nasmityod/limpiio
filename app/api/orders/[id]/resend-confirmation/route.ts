/**
 * PRD-051: POST /api/orders/[id]/resend-confirmation
 * Permite al admin reenviar el email de confirmación de un pedido.
 * Reutiliza la misma lógica de construcción del payload que orders/route.ts.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { absoluteEmailUrl } from '@/emails/mundotech/site';
import type { OrderConfirmationPayload } from '@/emails/mundotech/types';
import { d, dn } from '@/lib/decimal';
import { sendOrderConfirmationEmail } from '@/lib/resend';
import { roundMoney2 } from '@/lib/exchange-rate';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(_request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const { id: orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
  }

  // Resolver email del destinatario (pedido directo o cuenta vinculada)
  let recipientEmail = order.customerEmail?.trim() ?? '';
  if (!recipientEmail && order.customerId) {
    const u = await prisma.user.findUnique({
      where: { id: order.customerId },
      select: { email: true },
    });
    recipientEmail = u?.email?.trim() ?? '';
  }

  if (!recipientEmail) {
    return NextResponse.json(
      { message: 'El pedido no tiene email de contacto; no se puede reenviar la confirmación.' },
      { status: 422 }
    );
  }

  // Construir payload igual que en POST /api/orders
  const productIds = [...new Set(order.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      slug: true,
      images: true,
      media: {
        where: { type: 'IMAGE' },
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { url: true },
      },
    },
  });
  const slugById = new Map(
    products.map((p) => [p.id, (p.slug?.trim() || p.id) as string])
  );
  const fallbackImageById = new Map(
    products.map((p) => [p.id, p.images?.[0]?.trim() || p.media?.[0]?.url?.trim() || null])
  );

  // PRD-204: convertir Decimal → number
  const rate = dn(order.exchangeRateUsdBs);
  const priceUsdFromStored = (priceStored: number) =>
    rate != null && rate > 0 ? roundMoney2(priceStored / rate) : roundMoney2(priceStored);

  const itemsPayload = order.items.map((i) => ({
    name: i.productName,
    slug: slugById.get(i.productId) ?? i.productId,
    image: absoluteEmailUrl(i.imageUrl || fallbackImageById.get(i.productId) || null),
    priceUsd: priceUsdFromStored(d(i.price)),
    quantity: i.quantity,
  }));

  const totalNum = d(order.total);
  const totalUsd =
    rate != null && rate > 0 ? roundMoney2(totalNum / rate) : roundMoney2(totalNum);

  const confirmationPayload: OrderConfirmationPayload = {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName.trim() || 'Cliente',
    email: recipientEmail,
    createdAt: order.createdAt,
    status: order.status,
    items: itemsPayload,
    subtotalUsd: totalUsd,
    shippingUsd: 0,
    totalUsd,
    exchangeRateUsdBs: rate,
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
  };

  try {
    await sendOrderConfirmationEmail(confirmationPayload);
    logInfo('resend_confirmation_success', { orderId, operation: 'resend_confirmation' });
    return NextResponse.json({ success: true, email: recipientEmail });
  } catch (emailError) {
    logError('resend_confirmation_failed', emailError, { orderId, provider: 'resend', operation: 'resend_confirmation' });
    return NextResponse.json(
      { message: 'No se pudo reenviar el correo en este momento. Inténtalo de nuevo.' },
      { status: 500 }
    );
  }
}
