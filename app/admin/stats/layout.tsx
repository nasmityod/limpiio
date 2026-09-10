import { requireAdminPagePermission } from '@/lib/admin-access-server';

export default async function StatsPermissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPagePermission('ANALYTICS');
  return children;
}
