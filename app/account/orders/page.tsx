import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { prismaOrderToOrder, type Order } from '@/lib/definitions';
import OrderHistoryClient from '@/components/account/OrderHistoryClient';
import ForbiddenBanner from '@/components/account/ForbiddenBanner';
import { Suspense } from 'react';

async function getUserOrders(userId: string): Promise<Order[]> {
  const rows = await prisma.order.findMany({
    where:   { customerId: userId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(prismaOrderToOrder);
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AccountOrdersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    /* Destino tras login lo pone middleware (cookie→/login→header). */
    redirect('/login');
  }

  // Await searchParams for Next.js 15 compatibility
  const resolvedParams = await searchParams;
  const showForbidden = resolvedParams['error'] === 'forbidden';

  const orders = await getUserOrders(session.user.id);

  return (
    <>
      {showForbidden && (
        // Suspense requerido por useSearchParams dentro de ForbiddenBanner
        <Suspense>
          <ForbiddenBanner />
        </Suspense>
      )}
      <OrderHistoryClient orders={orders} />
    </>
  );
}
