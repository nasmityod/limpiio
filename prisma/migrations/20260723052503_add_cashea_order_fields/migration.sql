-- Cashea (Sección 6/10 del documento maestro): campos opcionales en Order.
-- No afectan filas existentes; no se usan en lógica todavía (Fase 2 = solo esquema).

-- CreateEnum
CREATE TYPE "CasheaStatus" AS ENUM ('CREATED', 'REDIRECTED', 'RETURNED', 'VERIFYING', 'CONFIRMED', 'CANCEL_PENDING', 'CANCELLED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "casheaAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "casheaCancelledAt" TIMESTAMP(3),
ADD COLUMN     "casheaConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "casheaCurrency" TEXT,
ADD COLUMN     "casheaInitialAmount" DECIMAL(18,2),
ADD COLUMN     "casheaLastResponseCode" TEXT,
ADD COLUMN     "casheaOrderId" TEXT,
ADD COLUMN     "casheaRedirectedAt" TIMESTAMP(3),
ADD COLUMN     "casheaReservationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "casheaReturnTokenHash" TEXT,
ADD COLUMN     "casheaReturnedAt" TIMESTAMP(3),
ADD COLUMN     "casheaStatus" "CasheaStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Order_casheaOrderId_key" ON "Order"("casheaOrderId");

-- CreateIndex
CREATE INDEX "Order_casheaStatus_idx" ON "Order"("casheaStatus");

-- CreateIndex
CREATE INDEX "Order_casheaReservationExpiresAt_idx" ON "Order"("casheaReservationExpiresAt");
