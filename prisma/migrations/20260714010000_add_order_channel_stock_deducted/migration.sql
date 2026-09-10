-- Añade las columnas `channel` y `stockDeducted` a "Order", ya usadas por el
-- código de la aplicación (checkout WhatsApp / full) pero sin migración
-- versionada previa. SQL idempotente: tolera que las columnas ya existan en
-- BD donde se crearon manualmente (p. ej. vía `prisma db push`) antes de
-- versionar este cambio.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS "stockDeducted" BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN "Order"."channel" IS 'Origen del pedido: web o whatsapp';
COMMENT ON COLUMN "Order"."stockDeducted" IS 'true si el inventario ya fue descontado';
