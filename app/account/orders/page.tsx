import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { prismaOrderToOrder, toCustomerOrderDto, type Order } from '@/lib/definitions';
import OrderHistoryClient from '@/components/account/OrderHistoryClient';
import ForbiddenBanner from '@/components/account/ForbiddenBanner';
import { Suspense } from 'react';
import PaginationBar from '@/app/components/PaginationBar';

const ORDERS_PAGE_SIZE = 20;
async function getUserOrders(userId: string, page: number): Promise<Order[]> {
  const rows = await prisma.order.findMany({
    where:   { customerId: userId },
    include: { items: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * ORDERS_PAGE_SIZE,
    take: ORDERS_PAGE_SIZE,
  });
  return rows.map(row => toCustomerOrderDto(prismaOrderToOrder(row)));
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

  const rawPage = resolvedParams.page;
  const requested = typeof rawPage === 'string' && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const total = await prisma.order.count({ where: { customerId: session.user.id } });
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, totalPages) : 1;
  if (rawPage !== undefined && (String(page) !== rawPage || page === 1)) {
    redirect(page === 1 ? '/account/orders' : `/account/orders?page=${page}`);
  }
  const orders = await getUserOrders(session.user.id, page);

  return (
    <>
      {showForbidden && (
        // Suspense requerido por useSearchParams dentro de ForbiddenBanner
        <Suspense>
          <ForbiddenBanner />
        </Suspense>
      )}
      <OrderHistoryClient orders={orders} total={total} />
      <PaginationBar page={page} totalPages={totalPages} basePath="/account/orders" />
    </>
  );
}
