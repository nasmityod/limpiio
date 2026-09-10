-- SESIÓN 04: columna privada para key de R2, coexiste con paymentProofUrl legacy
ALTER TABLE "Order" ADD COLUMN "paymentProofKey" TEXT;

-- Sin backfill: no podemos derivar una key verificada del host R2. paymentProofUrl
-- existente sigue funcionando mediante el flujo legacy durante la transición.
