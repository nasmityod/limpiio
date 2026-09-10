-- Migration: add_per_user_admin_permissions
-- Adds per-user RBAC columns to User and creates PermissionAuditLog.
-- NO automatic backfill of isSuperAdmin or adminPermissions.
-- The unique partial index enforces exactly one Superadmin at DB level.

-- 1. Nuevas columnas en User ──────────────────────────────────────────────────

ALTER TABLE "User"
  ADD COLUMN "isSuperAdmin"         BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN "adminPermissions"     TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "permissionsUpdatedAt" TIMESTAMP(3);

-- 2. Índice único parcial: máximo un Superadmin ───────────────────────────────
-- WHERE isSuperAdmin = true garantiza que solo una fila puede tener ese valor.
-- INSERT/UPDATE con un segundo isSuperAdmin=true fallará con unique violation.

CREATE UNIQUE INDEX "User_single_superadmin_key"
  ON "User" ("isSuperAdmin")
  WHERE "isSuperAdmin" = true;

-- 3. Tabla de auditoría ───────────────────────────────────────────────────────

CREATE TABLE "PermissionAuditLog" (
  "id"                TEXT        NOT NULL,
  "actorId"           TEXT        NOT NULL,
  "targetUserId"      TEXT        NOT NULL,
  "beforePermissions" TEXT[]      NOT NULL,
  "afterPermissions"  TEXT[]      NOT NULL,
  "targetRoleBefore"  TEXT        NOT NULL,
  "targetRoleAfter"   TEXT        NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissionAuditLog_pkey" PRIMARY KEY ("id")
);

-- 4. Claves foráneas ──────────────────────────────────────────────────────────

ALTER TABLE "PermissionAuditLog"
  ADD CONSTRAINT "PermissionAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PermissionAuditLog"
  ADD CONSTRAINT "PermissionAuditLog_targetUserId_fkey"
    FOREIGN KEY ("targetUserId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Índices de búsqueda ───────────────────────────────────────────────────────

CREATE INDEX "PermissionAuditLog_targetUserId_createdAt_idx"
  ON "PermissionAuditLog" ("targetUserId", "createdAt");

CREATE INDEX "PermissionAuditLog_actorId_createdAt_idx"
  ON "PermissionAuditLog" ("actorId", "createdAt");

-- FIN: ningún usuario es marcado automáticamente como Superadmin.
-- El propietario debe ejecutar manualmente en Prisma Studio o SQL:
--   UPDATE "User" SET "isSuperAdmin" = true, "role" = 'ADMIN'
--   WHERE email = 'REEMPLAZAR_POR_EMAIL_DEL_PROPIETARIO';
