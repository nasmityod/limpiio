-- FIX 1: índice único parcial — solo canjes activos (revertedAt IS NULL).
-- Permite reutilizar perUserSlot tras revertir un canje sin violar unicidad.

DROP INDEX "CouponRedemption_couponId_userId_perUserSlot_key";

CREATE UNIQUE INDEX "CouponRedemption_active_per_user_slot_key"
ON "CouponRedemption"("couponId", "userId", "perUserSlot")
WHERE "revertedAt" IS NULL;
