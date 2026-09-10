-- Una reseña por usuario y producto (evita TOCTOU en POST concurrentes).
-- Si existían duplicados, conservar la reseña más antigua por (productId, userId).

DELETE FROM "Review"
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "productId", "userId"
        ORDER BY "createdAt" ASC
      ) AS rn
    FROM "Review"
    WHERE "userId" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX "Review_productId_userId_key" ON "Review"("productId", "userId");
