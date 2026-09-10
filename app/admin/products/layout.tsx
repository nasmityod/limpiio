import { requireAdminPagePermission } from '@/lib/admin-access-server';

export default async function ProductsPermissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPagePermission('CATALOG');
  return children;
}
