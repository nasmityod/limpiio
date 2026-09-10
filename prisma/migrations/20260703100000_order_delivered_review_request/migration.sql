-- FASE 4.5 (MEJORA 2.2): base para el cron de solicitud de reseña post-entrega.
-- deliveredAt: cuándo pasó a 'Entregado' (lo setean las rutas de cambio de estado).
-- reviewRequestSentAt: cuándo se envió el email de reseña (null = pendiente).
ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "reviewRequestSentAt" TIMESTAMP(3);

-- Backfill conservador: pedidos ya entregados usan updatedAt como aproximación
-- de la fecha de entrega (la transición a Entregado suele ser la última edición).
UPDATE "Order" SET "deliveredAt" = "updatedAt" WHERE status = 'Entregado';

-- Índice parcial para el barrido del cron (pendientes de email, ya entregados).
CREATE INDEX "Order_reviewRequest_pending_idx"
  ON "Order" ("deliveredAt")
  WHERE status = 'Entregado' AND "reviewRequestSentAt" IS NULL;
