-- AlterTable: punto focal opcional para recorte del hero en móvil
ALTER TABLE "Banner" ADD COLUMN "focalPoint" TEXT DEFAULT 'center';
