-- SESIÓN 22 — Índices Prisma
-- Elimina índices redundantes y añade compuesto para paginación cursor.
--
-- Justificación:
--   1. Product_slug_idx: redundante porque @unique(slug) ya crea índice btree único.
--   2. Product_sku_idx:  redundante porque @unique(sku) ya crea índice btree único.
--   3. AppConfig_key_idx: redundante porque @unique(key) ya crea índice btree único.
--   4. Coupon_code_idx:   redundante porque @unique(code) ya crea índice btree único.
--   5. Order_createdAt_idx: reemplazado por Order_createdAt_id_idx, que cubre el
--      orden compuesto (createdAt DESC, id DESC) usado en paginación cursor y evita
--      un heap-sort extra.
--
-- Rollback: recrear cada índice DROPeado.

-- 1. Eliminar índices redundantes (UNIQUE constraint ya cubre la columna)
DROP INDEX IF EXISTS "Product_slug_idx";
DROP INDEX IF EXISTS "Product_sku_idx";
DROP INDEX IF EXISTS "AppConfig_key_idx";
DROP INDEX IF EXISTS "Coupon_code_idx";

-- 2. Reemplazar índice simple de createdAt por compuesto (createdAt, id)
--    para paginación cursor con tie-break.
DROP INDEX IF EXISTS "Order_createdAt_idx";
CREATE INDEX "Order_createdAt_id_idx" ON "Order"("createdAt", "id");
