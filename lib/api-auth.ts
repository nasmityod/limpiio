import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import type { Session } from 'next-auth';
import { isAdminRole } from '@/lib/is-admin-role';

export { isAdminRole } from '@/lib/is-admin-role';

type AuthResult =
  | { authorized: true; session: Session }
  | { authorized: false; response: NextResponse };

type AdminAuthResult = AuthResult;

/**
 * @deprecated Usar requirePermission() / requireSuperAdmin() de lib/admin-access-server.ts.
 * Guard genérico legacy: solo comprueba rol ADMIN sin verificar permisos granulares en BD.
 * Conservado temporalmente para compatibilidad durante la migración a RBAC.
 * TODO-RBAC: eliminar cuando todos los handlers hayan migrado a requirePermission().
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || !isAdminRole(role)) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'No autorizado. Se requiere rol ADMIN.' },
        { status: 403 }
      ),
    };
  }
  return { authorized: true, session };
}

/**
 * Verifica que exista sesión activa (cualquier usuario autenticado).
 * Uso (API route): const auth = await requireUser(); if (!auth.authorized) return auth.response;
 */
export async function requireUser(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'No autenticado.' },
        { status: 401 }
      ),
    };
  }
  return { authorized: true, session };
}

/**
 * @deprecated Usar requirePermissionAction() / requireSuperAdminAction() de lib/admin-access-server.ts.
 * Variante para Server Actions: lanza Error en lugar de devolver Response.
 * Guard genérico legacy: solo comprueba rol ADMIN sin verificar permisos granulares en BD.
 * Conservado temporalmente para compatibilidad durante la migración a RBAC.
 * TODO-RBAC: eliminar cuando todas las acciones hayan migrado a requirePermissionAction().
 * Uso: const session = await requireAdminAction();
 */
export async function requireAdminAction(): Promise<Session> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || !isAdminRole(role)) {
    throw new Error('No autorizado. Se requiere rol ADMIN.');
  }
  return session;
}
