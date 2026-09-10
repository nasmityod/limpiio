/**
 * RBAC — Guards de autorización server-side.
 *
 * PRINCIPIO: la BD es la fuente autoritativa de permisos.
 * El JWT solo sirve para identificar la sesión; nunca para autorizar acciones sensibles.
 *
 * Quitar un permiso tiene efecto en la siguiente petición (sin esperar JWT expiry).
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  normalizeAdminPermissions,
  hasAdminPermission,
  type AdminPermission,
} from '@/lib/admin-permissions';

function hasBackofficeAccess(access: CurrentAdminAccess): boolean {
  return access.isSuperAdmin || access.permissions.length > 0;
}
import type { Session } from 'next-auth';

// ─────────────────────────────────────────────────────────────────────────────
// TIPO PÚBLICO
// ─────────────────────────────────────────────────────────────────────────────

export type CurrentAdminAccess = {
  userId: string;
  role: string;
  isSuperAdmin: boolean;
  permissions: AdminPermission[];
};

// ─────────────────────────────────────────────────────────────────────────────
// CARGA DE PERMISOS ACTUALES DESDE BD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consulta los permisos actuales del usuario autenticado directamente en BD.
 * Nunca confía en el array del JWT — el JWT solo identifica, la BD autoriza.
 *
 * @throws si no hay sesión con userId.
 */
export async function loadCurrentAdminAccess(): Promise<CurrentAdminAccess> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error('Sin sesión activa.');

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isSuperAdmin: true,
      adminPermissions: true,
    },
  });

  if (!dbUser) throw new Error('Usuario no encontrado.');

  return {
    userId: dbUser.id,
    role: dbUser.role,
    isSuperAdmin: dbUser.isSuperAdmin,
    permissions: normalizeAdminPermissions(dbUser.adminPermissions),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTADO TIPADO PARA ROUTE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

type AuthorizedResult = {
  authorized: true;
  session: Session;
  access: CurrentAdminAccess;
};

type UnauthorizedResult = {
  authorized: false;
  response: NextResponse;
};

type PermissionCheckResult = AuthorizedResult | UnauthorizedResult;

// ─────────────────────────────────────────────────────────────────────────────
// GUARDS PARA ROUTE HANDLERS (devuelven NextResponse en caso de error)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica acceso al backoffice: sesión activa + (isSuperAdmin OR role=ADMIN).
 * Para Route Handlers.
 */
export async function requireBackofficeAccess(): Promise<PermissionCheckResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }),
    };
  }

  let access: CurrentAdminAccess;
  try {
    access = await loadCurrentAdminAccess();
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }),
    };
  }

  if (!hasBackofficeAccess(access)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }),
    };
  }

  return { authorized: true, session: session as Session, access };
}

/**
 * Exige permiso específico consultado en BD.
 * - Sin sesión → 401
 * - Usuario inexistente → 401
 * - Sin permiso → 403
 * - Autorizado → { authorized: true, session, access }
 */
export async function requirePermission(
  permission: AdminPermission,
): Promise<PermissionCheckResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }),
    };
  }

  let access: CurrentAdminAccess;
  try {
    access = await loadCurrentAdminAccess();
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }),
    };
  }

  if (!hasAdminPermission(access, permission)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }),
    };
  }

  return { authorized: true, session: session as Session, access };
}

/**
 * Exige isSuperAdmin === true leído desde BD.
 * role=ADMIN por sí solo nunca es suficiente.
 */
export async function requireSuperAdmin(): Promise<PermissionCheckResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }),
    };
  }

  let access: CurrentAdminAccess;
  try {
    access = await loadCurrentAdminAccess();
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'No autenticado.' }, { status: 401 }),
    };
  }

  if (!access.isSuperAdmin) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 }),
    };
  }

  return { authorized: true, session: session as Session, access };
}

// ─────────────────────────────────────────────────────────────────────────────
// GUARDS PARA SERVER ACTIONS (lanzan Error en lugar de devolver Response)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica acceso al backoffice en Server Action.
 * Lanza error genérico si no autorizado.
 */
export async function requireBackofficeAction(): Promise<CurrentAdminAccess> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('No autorizado.');

  const access = await loadCurrentAdminAccess();
  if (!hasBackofficeAccess(access)) throw new Error('No autorizado.');

  return access;
}

/**
 * Exige permiso específico en Server Action.
 * Lanza error genérico (sin filtrar qué permiso faltó).
 */
export async function requirePermissionAction(
  permission: AdminPermission,
): Promise<CurrentAdminAccess> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('No autorizado.');

  const access = await loadCurrentAdminAccess();
  if (!hasAdminPermission(access, permission)) {
    throw new Error('No autorizado.');
  }

  return access;
}

/**
 * Exige isSuperAdmin === true en Server Action.
 * Lanza error genérico si no es Superadmin.
 */
export async function requireSuperAdminAction(): Promise<CurrentAdminAccess> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('No autorizado.');

  const access = await loadCurrentAdminAccess();
  if (!access.isSuperAdmin) {
    throw new Error('No autorizado.');
  }

  return access;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER PARA PÁGINAS ADMIN (redirige en lugar de devolver Response)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Para Server Components de página.
 * Si hay sesión pero falta el permiso → redirige a /admin/unauthorized.
 * Si no hay sesión → redirige a /login.
 *
 * @returns CurrentAdminAccess si el usuario tiene acceso.
 */
export async function requireAdminPagePermission(
  permission: AdminPermission,
): Promise<CurrentAdminAccess> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }

  let access: CurrentAdminAccess;
  try {
    access = await loadCurrentAdminAccess();
  } catch {
    redirect('/login');
  }

  if (!hasAdminPermission(access, permission)) {
    redirect('/admin/unauthorized');
  }

  return access;
}

/**
 * Para Server Components que admiten acceso con cualquiera de varios permisos.
 */
export async function requireAdminPageAnyPermission(
  permissions: AdminPermission[],
): Promise<CurrentAdminAccess> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }

  let access: CurrentAdminAccess;
  try {
    access = await loadCurrentAdminAccess();
  } catch {
    redirect('/login');
  }

  const allowed = permissions.some((permission) => hasAdminPermission(access, permission));
  if (!allowed) {
    redirect('/admin/unauthorized');
  }

  return access;
}

/**
 * Para la página /admin/settings/users. Redirige si no es Superadmin.
 */
export async function requireAdminPageSuperAdmin(): Promise<CurrentAdminAccess> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }

  let access: CurrentAdminAccess;
  try {
    access = await loadCurrentAdminAccess();
  } catch {
    redirect('/login');
  }

  if (!access.isSuperAdmin) {
    redirect('/admin/unauthorized');
  }

  return access;
}
