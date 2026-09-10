import { requireAdminPagePermission } from '@/lib/admin-access-server';

export default async function OrdersPermissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPagePermission('ORDERS');
  return children;
}
