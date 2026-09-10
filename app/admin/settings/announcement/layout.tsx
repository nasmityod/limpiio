import { requireAdminPagePermission } from '@/lib/admin-access-server';

export default async function AnnouncementPermissionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPagePermission('SITE_CONTENT');
  return children;
}
