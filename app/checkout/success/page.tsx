import type { Metadata } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// H03: página de confirmación — noindex; contenido personal no indexable.
export const metadata: Metadata = {
  title: 'Pedido confirmado',
  robots: { index: false, follow: false },
};

import { isAdminRole } from '@/lib/is-admin-role';
import { isWhatsAppCheckout } from '@/lib/checkout-mode';
import { Order, OrderItem, prismaOrderToOrder, toGuestOrderConfirmationDto } from '@/lib/definitions';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/security';
import SuccessClientPage from './SuccessClientPage';
import GuestSuccessClientPage from './GuestSuccessClientPage';

export interface EnrichedOrderItem extends OrderItem {
  imageUrl?: string;
}

export interface EnrichedOrder extends Omit<Order, 'items'> {
  items: EnrichedOrderItem[];
}

export const dynamic = 'force-dynamic';

async function getEnrichedOrder(orderId: string): Promise<EnrichedOrder | null> {
  const row = await prisma.order.findUnique({
    where:   { id: orderId },
    include: { items: true },
  });
  if (!row) return null;

  const order = prismaOrderToOrder(row);
  const enrichedItems: EnrichedOrderItem[] = order.items.map(item => ({
    ...item,
    imageUrl: item.imageUrl || '/placeholder.png',
  }));

  return { ...order, items: enrichedItems };
}

function InvalidOrderMessage() {
  return (
    <div className="text-center py-20 text-red-700">
      No encontramos este pedido. Verifica el enlace o contáctanos con tu
      número de pedido.
    </div>
  );
}

// En Next.js 15+, searchParams es una Promise y debe ser await-ada
export default async function SuccessPageWrapper({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; token?: string }>;
}) {
  const [session, params] = await Promise.all([
    getServerSession(authOptions),
    searchParams,
  ]);

  const { orderId, token } = params;

  // Guest solo en whatsapp / auth obligatoria en full: ?token= es la única
  // vía de acceso guest, y solo existe cuando CHECKOUT_MODE=whatsapp (en
  // full nunca se generan pedidos guest, así que un token ahí es inválido).
  // ?orderId= SIN sesión ya no consulta ni renderiza el pedido.
  if (token?.trim()) {
    if (!isWhatsAppCheckout) return <InvalidOrderMessage />;
    return handleGuestToken(token.trim());
  }

  if (!orderId?.trim()) {
    return <InvalidOrderMessage />;
  }

  if (!session?.user?.id) {
    // Sin sesión: NO se consulta el pedido (eliminado acceso guest legacy por ?orderId=).
    return <InvalidOrderMessage />;
  }

  const order = await getEnrichedOrder(orderId.trim());

  if (!order) {
    return <InvalidOrderMessage />;
  }

  const isOwner = order.customerId === session.user.id;
  const isAdmin = isAdminRole((session.user as { role?: string }).role);

  if (!isOwner && !isAdmin) {
    return <InvalidOrderMessage />;
  }

  return <SuccessClientPage order={order} />;
}

/**
 * SESIÓN 06 (CORREGIDO): maneja acceso guest exclusivamente mediante token.
 * Hash → lookup por guestAccessTokenHash + expiresAt > now.
 * Anti-enumeración: mismo mensaje para ausente/inválido/expirado.
 * Renderiza GuestSuccessClientPage con DTO mínimo. No necesita session.
 */
async function handleGuestToken(token: string) {
  const tokenHash = hashToken(token);
  const row = await prisma.order.findUnique({
    where: { guestAccessTokenHash: tokenHash },
    include: { items: true },
  });

  // Anti-enumeración: mismo mensaje para ausente, expirado o inválido
  if (
    !row ||
    !row.guestAccessTokenExpiresAt ||
    row.guestAccessTokenExpiresAt <= new Date()
  ) {
    return <InvalidOrderMessage />;
  }

  const guestDto = toGuestOrderConfirmationDto(row);
  return <GuestSuccessClientPage order={guestDto} guestToken={token} />;
}
