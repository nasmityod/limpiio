-- SESIÓN 06: guest access token para confirmación de pedido sin sesión
-- Token SHA-256 único + expiración 72h. Solo pedidos guest (customerId IS NULL).

ALTER TABLE "Order"
  ADD COLUMN "guestAccessTokenHash"      TEXT,
  ADD COLUMN "guestAccessTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_guestAccessTokenHash_key" ON "Order"("guestAccessTokenHash");
