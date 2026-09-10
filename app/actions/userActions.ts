'use server';

import bcrypt from 'bcrypt';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireSuperAdminAction } from '@/lib/admin-access-server';
import {
  ADMIN_PERMISSIONS,
  normalizeAdminPermissions,
  normalizePermissionDependencies,
  type AdminPermission,
} from '@/lib/admin-permissions';
import { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id:                   string;
  email:                string;
  name:                 string | null;
  role:                 string;
  isSuperAdmin:         boolean;
  adminPermissions:     AdminPermission[];
  permissionsUpdatedAt: string | null;
  createdAt:            string;
  orderCount:           number;
}

export interface PermissionAuditEntry {
  id:                string;
  createdAt:         string;
  actorEmail:        string;
  targetEmail:       string;
  targetRoleBefore:  string;
  targetRoleAfter:   string;
  beforePermissions: string[];
  afterPermissions:  string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

async function countAdmins(): Promise<number> {
  return prisma.user.count({
    where: { role: { equals: 'ADMIN', mode: 'insensitive' } },
  });
}

function isPrismaSerializationError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  if (error instanceof Error && 'code' in error) {
    return (error as { code?: string }).code === '40001';
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR USUARIOS ADMIN (solo Superadmin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Usuarios por página en /admin/settings/users.
 * No se exporta: los archivos `'use server'` sólo pueden exportar funciones
 * async (y tipos). El cliente recibe el valor en `AdminUsersPage.pageSize`.
 */
const ADMIN_USERS_PAGE_SIZE = 25;

export interface AdminUsersPage {
  users: AdminUser[];
  /** Total de usuarios que cumplen el filtro (no sólo la página). */
  total: number;
  page: number;
  pageSize: number;
}

export interface ListAdminUsersParams {
  /** Filtra por nombre o email (contains, sin distinguir mayúsculas). */
  search?: string;
  page?: number;
  pageSize?: number;
  /** Sólo cuentas con acceso administrativo (superadmin, rol admin o permisos). */
  onlyStaff?: boolean;
}

/**
 * Listado paginado de usuarios.
 *
 * ANTES (RC-10 de la auditoría de rendimiento): devolvía la tabla `User`
 * ENTERA —clientes incluidos— con un subconsulta `_count: { orders: true }` por
 * fila, y la página `/admin/settings/users` la renderizaba de golpe desde el
 * servidor. Es la pantalla del panel que peor escala con el crecimiento del
 * negocio: 50 000 clientes ⇒ 50 000 filas con PII y 50 000 subconsultas COUNT
 * en cada visita.
 *
 * AHORA: página de 25 con búsqueda por nombre/email y filtro opcional «sólo
 * personal». El conteo de pedidos se conserva, pero se calcula sólo para las
 * 25 filas visibles.
 */
export async function listAdminUsers(
  params: ListAdminUsersParams = {},
): Promise<AdminUsersPage> {
  await requireSuperAdminAction();

  const page = Number.isFinite(params.page) && (params.page as number) >= 1
    ? Math.floor(params.page as number)
    : 1;
  const pageSize = Number.isFinite(params.pageSize)
    ? Math.min(100, Math.max(1, Math.floor(params.pageSize as number)))
    : ADMIN_USERS_PAGE_SIZE;
  const search = (params.search ?? '').trim().slice(0, 120);

  const where: Prisma.UserWhereInput = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { name:  { contains: search, mode: 'insensitive' } },
    ];
  }
  if (params.onlyStaff) {
    where.AND = [
      {
        OR: [
          { isSuperAdmin: true },
          { role: { in: ['ADMIN', 'admin'] } },
          { adminPermissions: { isEmpty: false } },
        ],
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ isSuperAdmin: 'desc' }, { role: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id:                   true,
        email:                true,
        name:                 true,
        role:                 true,
        isSuperAdmin:         true,
        adminPermissions:     true,
        permissionsUpdatedAt: true,
        createdAt:            true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    page,
    pageSize,
    total,
    users: rows.map(r => ({
      id:                   r.id,
      email:                r.email,
      name:                 r.name,
      role:                 r.role,
      isSuperAdmin:         r.isSuperAdmin,
      adminPermissions:     normalizeAdminPermissions(r.adminPermissions),
      permissionsUpdatedAt: r.permissionsUpdatedAt?.toISOString() ?? null,
      createdAt:            r.createdAt.toISOString(),
      orderCount:           r._count.orders,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTUALIZAR PERMISOS DE UN USUARIO (solo Superadmin)
// ─────────────────────────────────────────────────────────────────────────────

const updatePermissionsSchema = z.object({
  userId:      z.string().min(1),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)),
});

export async function updateUserPermissions(
  input: unknown
): Promise<{ success: boolean; message: string }> {
  const actor = await requireSuperAdminAction();

  const parsed = updatePermissionsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: 'Datos inválidos.' };
  }

  const { userId, permissions: rawPermissions } = parsed.data;

  const newPermissions = normalizePermissionDependencies(
    normalizeAdminPermissions(rawPermissions),
  );

  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const targetUser = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, adminPermissions: true, isSuperAdmin: true },
        });
        if (!targetUser) throw new Error('USER_NOT_FOUND');
        if (targetUser.isSuperAdmin) throw new Error('SUPERADMIN_IMMUTABLE');

        const newRole = newPermissions.length > 0 ? 'ADMIN' : 'CLIENT';
        const oldRole = targetUser.role;
        const oldPermissions = normalizeAdminPermissions(targetUser.adminPermissions);

        await tx.user.update({
          where: { id: userId },
          data: {
            adminPermissions:     newPermissions,
            role:                 newRole,
            permissionsUpdatedAt: new Date(),
          },
        });

        await tx.permissionAuditLog.create({
          data: {
            actorId:           actor.userId,
            targetUserId:      userId,
            beforePermissions: oldPermissions,
            afterPermissions:  newPermissions,
            targetRoleBefore:  oldRole,
            targetRoleAfter:   newRole,
          },
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      });
      break;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'USER_NOT_FOUND') {
          return { success: false, message: 'Usuario no encontrado.' };
        }
        if (error.message === 'SUPERADMIN_IMMUTABLE') {
          return { success: false, message: 'No se pueden modificar los permisos del Superadmin.' };
        }
      }
      if (isPrismaSerializationError(error) && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }

  revalidatePath('/admin/settings/users');
  revalidatePath('/admin', 'layout');

  return { success: true, message: 'Permisos actualizados. Los cambios ya están activos.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// CREAR USUARIO ADMINISTRATIVO (solo Superadmin)
// ─────────────────────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  name:     z.string().min(1, 'Nombre requerido.').max(80),
  email:    z.string().email('Email inválido.'),
  password: z.string().min(8, 'Mínimo 8 caracteres.'),
});

export async function createAdminUser(
  input: unknown
): Promise<{ success: boolean; message: string }> {
  await requireSuperAdminAction();
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }
  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { success: false, message: 'Ese email ya está registrado.' };

  const hashed = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      name:             parsed.data.name,
      email:            parsed.data.email.toLowerCase(),
      password:         hashed,
      role:             'CLIENT',
      isSuperAdmin:     false,
      adminPermissions: [],
    },
  });
  revalidatePath('/admin/settings/users');
  return { success: true, message: 'Usuario creado. Asigna los permisos a continuación.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESETEAR CONTRASEÑA (solo Superadmin)
// ─────────────────────────────────────────────────────────────────────────────

const resetPasswordSchema = z.object({
  userId:   z.string().min(1),
  password: z.string().min(8, 'Mínimo 8 caracteres.'),
});

export async function resetUserPassword(
  input: unknown
): Promise<{ success: boolean; message: string }> {
  const actor = await requireSuperAdminAction();
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }

  // El Superadmin no puede resetear su propia contraseña desde aquí
  if (parsed.data.userId === actor.userId) {
    return { success: false, message: 'Cambia tu propia contraseña desde tu cuenta.' };
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { isSuperAdmin: true },
  });
  if (target?.isSuperAdmin) {
    return { success: false, message: 'No se puede resetear la contraseña del Superadmin desde aquí.' };
  }

  const hashed = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data:  { password: hashed, passwordChangedAt: new Date() },
  });
  return { success: true, message: 'Contraseña actualizada.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR USUARIO (solo Superadmin)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteAdminUser(
  userId: string
): Promise<{ success: boolean; message: string }> {
  const access = await requireSuperAdminAction();
  if (access.userId === userId) {
    return { success: false, message: 'No puedes eliminar tu propio usuario.' };
  }
  let target: {
    role: string;
    isSuperAdmin: boolean;
    _count: {
      orders: number;
      reviews: number;
      permissionChangesAuthored: number;
      permissionChangesReceived: number;
    };
  } | null;

  try {
    target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role:         true,
        isSuperAdmin: true,
        _count: {
          select: {
            orders:                    true,
            reviews:                   true,
            permissionChangesAuthored: true,
            permissionChangesReceived: true,
          },
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[deleteAdminUser] Error al consultar usuario ${userId}: ${msg}\n`);
    return { success: false, message: 'Error al consultar el usuario. Inténtalo de nuevo.' };
  }

  if (!target) return { success: false, message: 'Usuario no encontrado.' };
  if (target.isSuperAdmin) {
    return { success: false, message: 'No se puede eliminar al Superadmin.' };
  }

  if ((target.role ?? '').toUpperCase() === 'ADMIN') {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return { success: false, message: 'No puedes eliminar al último administrador.' };
    }
  }

  const { orders: orderCount, reviews: reviewCount, permissionChangesAuthored, permissionChangesReceived } = target._count;

  if (permissionChangesAuthored > 0 || permissionChangesReceived > 0) {
    return {
      success: false,
      message:
        'No se puede eliminar este usuario porque forma parte del historial de cambios de permisos. Conserva la cuenta para mantener la auditoría.',
    };
  }

  if (orderCount > 0 || reviewCount > 0) {
    return {
      success: false,
      message: `No se puede eliminar: el usuario tiene ${orderCount} pedido${orderCount !== 1 ? 's' : ''} y ${reviewCount} reseña${reviewCount !== 1 ? 's' : ''} asociados.`,
    };
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return { success: false, message: 'No se puede eliminar: el usuario tiene registros asociados en la base de datos.' };
    }
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[deleteAdminUser] Error al eliminar usuario ${userId}: ${msg}\n`);
    return { success: false, message: 'Error al eliminar el usuario. Inténtalo de nuevo.' };
  }

  revalidatePath('/admin/settings/users');
  return { success: true, message: 'Usuario eliminado.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORÍA DE PERMISOS (solo Superadmin)
// ─────────────────────────────────────────────────────────────────────────────

export async function listPermissionAuditLog(): Promise<PermissionAuditEntry[]> {
  await requireSuperAdminAction();
  const rows = await prisma.permissionAuditLog.findMany({
    orderBy:  { createdAt: 'desc' },
    take:     50,
    include: {
      actor:  { select: { email: true } },
      target: { select: { email: true } },
    },
  });
  return rows.map(r => ({
    id:                r.id,
    createdAt:         r.createdAt.toISOString(),
    actorEmail:        r.actor.email,
    targetEmail:       r.target.email,
    targetRoleBefore:  r.targetRoleBefore,
    targetRoleAfter:   r.targetRoleAfter,
    beforePermissions: r.beforePermissions,
    afterPermissions:  r.afterPermissions,
  }));
}
