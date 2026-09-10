import { requireAdminPagePermission } from '@/lib/admin-access-server';

export default async function CategoriesPermissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPagePermission('CATALOG');
  return children;
}
