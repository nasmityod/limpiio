CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  SET search_path = public
  AS $$ SELECT unaccent('unaccent', $1) $$;

CREATE INDEX IF NOT EXISTS product_search_trgm_idx
  ON "Product" USING gin (
    immutable_unaccent(lower(
      coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' ||
      coalesce(category,'') || ' ' || coalesce(sku,'') || ' ' ||
      coalesce(description,'')
    )) gin_trgm_ops
  );
