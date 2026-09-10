-- PRD-182: dedup por ventana vía bucket + unique (evita carrera read-then-write).

-- 1) Columna nullable para backfill
ALTER TABLE "ProductView" ADD COLUMN "viewBucket" TEXT;

-- 2) Backfill: bucket = floor(createdAt / 30 min)
UPDATE "ProductView"
SET "viewBucket" = FLOOR(EXTRACT(EPOCH FROM "createdAt") * 1000 / 1800000)::TEXT
WHERE "viewBucket" IS NULL;

-- 3) Eliminar duplicados pre-existentes (misma sesión/producto/ventana); conservar el más antiguo
DELETE FROM "ProductView" a
USING "ProductView" b
WHERE a.id > b.id
  AND a."sessionId" IS NOT DISTINCT FROM b."sessionId"
  AND a."productId" = b."productId"
  AND a."viewBucket" = b."viewBucket";

-- 4) NOT NULL + unique compuesto
ALTER TABLE "ProductView" ALTER COLUMN "viewBucket" SET NOT NULL;

CREATE UNIQUE INDEX "ProductView_sessionId_productId_viewBucket_key"
  ON "ProductView"("sessionId", "productId", "viewBucket");
