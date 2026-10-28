ALTER TABLE "Order" ADD COLUMN "legacyPaidConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "checkoutAttemptKey" TEXT;
ALTER TABLE "Order" ADD COLUMN "checkoutPayloadHash" TEXT;
CREATE UNIQUE INDEX "Order_checkoutAttemptKey_key" ON "Order"("checkoutAttemptKey");
CREATE INDEX "PaymentUpload_status_updatedAt_idx" ON "PaymentUpload"("status", "updatedAt");
CREATE TABLE "CheckoutAttempt" (
  "key" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("key")
);
CREATE UNIQUE INDEX "CheckoutAttempt_orderId_key" ON "CheckoutAttempt"("orderId");
ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Preserve financial redemption history even when an administrator removes a coupon.
ALTER TABLE "CouponRedemption" DROP CONSTRAINT "CouponRedemption_couponId_fkey";
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
