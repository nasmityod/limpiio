import { redirect } from 'next/navigation';
import { requireBackofficeAction } from '@/lib/admin-access-server';
import {
  ADMIN_PERMISSION_HOME,
  getFirstAuthorizedPermission,
  hasAdminPermission,
} from '@/lib/admin-permissions';
import AdminDashboardClient from './AdminDashboardClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const access = await requireBackofficeAction();

  if (!hasAdminPermission(access, 'DASHBOARD')) {
    const first = getFirstAuthorizedPermission(access);
    if (first && first !== 'DASHBOARD') {
      redirect(ADMIN_PERMISSION_HOME[first]);
    }
    redirect('/admin/unauthorized');
  }

  return <AdminDashboardClient />;
}
