-- Sesión 13: índices compuestos para estadísticas admin (status + fecha).
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_status_paidAt_idx" ON "Order"("status", "paidAt");
