import AdminMenuClient from './AdminMenuClient';
import { requireBackofficeAction } from '@/lib/admin-access-server';
import { ADMIN_NAV_GROUPS, filterNavGroups } from '@/lib/admin-nav';

export const dynamic = 'force-dynamic';

export default async function AdminMenuPage() {
  const access = await requireBackofficeAction();
  const filteredGroups = filterNavGroups(ADMIN_NAV_GROUPS, access);
  return <AdminMenuClient filteredGroups={filteredGroups} />;
}
