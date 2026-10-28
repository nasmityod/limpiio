import { loadCurrentAdminAccess } from '@/lib/admin-access-server';
import { hasAdminPermission } from '@/lib/admin-permissions';
import HomeManagerClient from './HomeManagerClient';

export default async function HomeManagerPage() {
  const access = await loadCurrentAdminAccess();
  return <HomeManagerClient canCatalog={hasAdminPermission(access, 'CATALOG')} canPromotions={hasAdminPermission(access, 'PROMOTIONS')} />;
}
