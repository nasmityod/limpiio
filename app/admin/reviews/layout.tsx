import { requireAdminPagePermission } from '@/lib/admin-access-server';

export default async function ReviewsPermissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPagePermission('REVIEWS');
  return children;
}
