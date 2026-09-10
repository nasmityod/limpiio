-- Auditoría de rendimiento del Panel Admin (docs/AUDITORIA-RENDIMIENTO-PANEL-ADMIN.md)
--
-- Todos los índices son ADITIVOS: no se elimina ninguno existente, así que el
-- rollback es simplemente `DROP INDEX` de los cinco creados aquí.
--
-- Se usa CREATE INDEX (no CONCURRENTLY) porque Prisma ejecuta cada migración en
-- una transacción y CONCURRENTLY no puede correr dentro de una. Con el volumen
-- actual (cientos de productos) el bloqueo es de milisegundos; medido sobre un
-- dataset sintético de 5 000 productos tarda < 120 ms. Si "Product" llegara a
-- cientos de miles de filas, crear estos índices a mano con CONCURRENTLY antes
-- de desplegar y dejar que el IF NOT EXISTS los dé por hechos.

-- ── Product ────────────────────────────────────────────────────────────────

-- Paginación keyset del inventario: ORDER BY ("createdAt" DESC, id DESC).
-- Antes: Seq Scan de 5 000 filas + top-N heapsort en cada carga (5,9 ms);
-- después: Index Scan de 31 filas (0,22 ms).
CREATE INDEX IF NOT EXISTS "Product_createdAt_id_idx"
  ON "Product" ("createdAt", "id");

-- Filtro por categoría con el mismo orden keyset.
CREATE INDEX IF NOT EXISTS "Product_category_createdAt_id_idx"
  ON "Product" ("category", "createdAt", "id");

-- Filtros «agotados» / «stock bajo» y los COUNT(*) FILTER del encabezado.
CREATE INDEX IF NOT EXISTS "Product_stock_createdAt_idx"
  ON "Product" ("stock", "createdAt");

-- Buscador de productos del Gestor Home (ORDER BY "updatedAt" DESC LIMIT 12).
CREATE INDEX IF NOT EXISTS "Product_updatedAt_idx"
  ON "Product" ("updatedAt");

-- Búsqueda del inventario admin por nombre / SKU / marca.
--
-- El buscador hacía `contains + mode:'insensitive'` en Prisma, que termina en
-- `ILIKE '%texto%'`: un B-tree NO puede servir un patrón con comodín inicial, y
-- el plan era siempre Seq Scan (20,5 ms para un término raro sobre 5 000 filas,
-- creciendo linealmente). Con este índice GIN de trigramas el mismo término
-- resuelve por Bitmap Index Scan en 0,32 ms (~64×).
--
-- La expresión DEBE coincidir literalmente con ADMIN_SEARCH_EXPR de
-- lib/products/admin-product-query.ts o el planificador no usará el índice.
-- pg_trgm / unaccent / immutable_unaccent ya los crea la migración
-- 20260613130000_add_search_trgm (índice equivalente del catálogo público).
-- La expresión va en UNA sola línea, idéntica carácter a carácter a
-- ADMIN_SEARCH_EXPR (tests/admin-product-query.test.ts comprueba la paridad).
CREATE INDEX IF NOT EXISTS product_admin_search_trgm_idx
  ON "Product" USING gin (
    immutable_unaccent(lower(coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(brand,''))) gin_trgm_ops
  );

-- ── Review ─────────────────────────────────────────────────────────────────

-- Moderación admin paginada: WHERE status = ? ORDER BY "createdAt" DESC.
-- Antes recorría "Review_createdAt_idx" descartando filas de otros estados.
CREATE INDEX IF NOT EXISTS "Review_status_createdAt_idx"
  ON "Review" ("status", "createdAt");
