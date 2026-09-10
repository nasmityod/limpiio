import { requireAdminPagePermission } from '@/lib/admin-access-server';

export default async function CouponsPermissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPagePermission('PROMOTIONS');
  return children;
}
