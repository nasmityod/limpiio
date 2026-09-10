-- FIX 1: slot por usuario + índice único para impedir canjes concurrentes duplicados.
-- FIX 5: revertedAt para auditoría append-only en lugar de DELETE físico.

ALTER TABLE "CouponRedemption" ADD COLUMN "perUserSlot" INTEGER;
ALTER TABLE "CouponRedemption" ADD COLUMN "revertedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_perUserSlot_key"
ON "CouponRedemption"("couponId", "userId", "perUserSlot");
