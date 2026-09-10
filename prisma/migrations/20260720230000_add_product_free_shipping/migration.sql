-- Migration: add_product_free_shipping
-- Envío gratis configurable por producto (MISIÓN envío gratis).
-- `Product.freeShipping`: bandera editable en el admin. Default false: todos
--   los productos existentes quedan en "cobro a destino" automáticamente.
-- `Order.freeShipping` / `OrderItem.freeShipping`: snapshots congelados al
--   crear el pedido (dentro de la misma transacción del checkout). NO se
--   recalculan después: editar un producto nunca cambia pedidos ya creados.
-- Reversión razonable: `ALTER TABLE ... DROP COLUMN "freeShipping";` en las
-- tres tablas (se pierde la bandera/snapshots, sin otros efectos).

ALTER TABLE "Product"
  ADD COLUMN "freeShipping" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order"
  ADD COLUMN "freeShipping" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderItem"
  ADD COLUMN "freeShipping" BOOLEAN NOT NULL DEFAULT false;
