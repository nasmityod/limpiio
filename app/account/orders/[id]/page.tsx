import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { prismaOrderToOrder, type Order, type OrderItem } from '@/lib/definitions';
import { parseOrderRef, type OrderRef } from '@/lib/order-ref';
import OrderDetailClient from '@/components/account/OrderDetailClient';

export interface EnrichedOrderItem extends OrderItem {
  imageUrl?: string;
  productSlug: string;
}

export interface EnrichedOrder extends Omit<Order, 'items'> {
  items: EnrichedOrderItem[];
}

async function getEnrichedOrder(ref: OrderRef): Promise<EnrichedOrder | null> {
  const row = await prisma.order.findUnique({
    where:   'orderNumber' in ref ? { orderNumber: ref.orderNumber } : { id: ref.id },
    include: {
      items: {
        include: { product: { select: { slug: true } } },
      },
    },
  });
  if (!row) return null;

  const order = prismaOrderToOrder({
    ...row,
    items: row.items.map(({ product: _product, ...item }) => item),
  });
  const slugByProductId = new Map(
    row.items.map((i) => [i.productId, i.product.slug?.trim() || i.productId]),
  );
  const enrichedItems: EnrichedOrderItem[] = order.items.map((item) => ({
    ...item,
    imageUrl: item.imageUrl || '/placeholder.png',
    productSlug: slugByProductId.get(item.productId) ?? item.productId,
  }));

  return { ...order, items: enrichedItems };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, { id: orderId }] = await Promise.all([
    getServerSession(authOptions),
    params,
  ]);

  if (!session || !session.user?.id) {
    return (
      <div className="p-6">
        <p className="text-red-500">Acceso denegado. Por favor inicia sesión.</p>
      </div>
    );
  }

  const ref = parseOrderRef(orderId);
  const order = ref ? await getEnrichedOrder(ref) : null;

  // SEC-04 (AUDITORIA-2026-07): mensaje único para "no existe" y "no es tuyo" —
  // mensajes distintos revelaban qué números correlativos de pedido existen.
  if (!order || order.customerId !== session.user.id) {
    return (
      <div className="p-6">
        <p className="text-red-500">Pedido no disponible. Verifica el enlace o revisa tu lista de pedidos.</p>
      </div>
    );
  }

  return <OrderDetailClient order={order} />;
}
