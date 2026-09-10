-- SESIONES 04-05-06 (CORRECCIÓN): máquina de estados PaymentUpload + FK a Order
-- Añade UPLOADING y DELETING al enum existente (creado en 20260711190000).
-- Crea la foreign key de PaymentUpload.orderId -> Order.id (ON DELETE SET NULL, ON UPDATE CASCADE).

ALTER TYPE "PaymentUploadStatus" ADD VALUE 'UPLOADING';
ALTER TYPE "PaymentUploadStatus" ADD VALUE 'DELETING';

ALTER TABLE "PaymentUpload"
  ADD CONSTRAINT "PaymentUpload_orderId_fkey"
    FOREIGN KEY ("orderId")
    REFERENCES "Order"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
