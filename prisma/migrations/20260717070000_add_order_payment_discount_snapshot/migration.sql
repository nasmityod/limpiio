-- Migration: add_order_payment_discount_snapshot
-- Congela en Order el descuento por método de pago (divisas) aplicado al crear.
-- NO backfill: pedidos antiguos conservan NULL; la UI deriva subtotal desde items.

ALTER TABLE "Order"
  ADD COLUMN "paymentMethodId"        TEXT,
  ADD COLUMN "subtotalBeforeDiscount" DECIMAL(12, 2),
  ADD COLUMN "paymentDiscountPercent" DECIMAL(5, 2),
  ADD COLUMN "paymentDiscount"        DECIMAL(12, 2),
  ADD COLUMN "paymentCurrency"        TEXT;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_paymentDiscountPercent_range"
    CHECK ("paymentDiscountPercent" IS NULL OR ("paymentDiscountPercent" >= 0 AND "paymentDiscountPercent" <= 100));

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_paymentDiscount_nonneg"
    CHECK ("paymentDiscount" IS NULL OR "paymentDiscount" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_subtotalBeforeDiscount_nonneg"
    CHECK ("subtotalBeforeDiscount" IS NULL OR "subtotalBeforeDiscount" >= 0);
