import { listAdminUsers, listPermissionAuditLog } from '@/app/actions/userActions';
import { requireAdminPageSuperAdmin } from '@/lib/admin-access-server';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const access = await requireAdminPageSuperAdmin();
  // Sólo la primera página: la tabla `User` puede tener decenas de miles de
  // filas de clientes y esta pantalla nunca necesita más de 25 a la vez.
  const [firstPage, auditLog] = await Promise.all([
    listAdminUsers(),
    listPermissionAuditLog(),
  ]);
  return (
    <UsersClient
      users={firstPage.users}
      total={firstPage.total}
      pageSize={firstPage.pageSize}
      auditLog={auditLog}
      currentUserId={access.userId}
    />
  );
}
