import type { Prisma } from '@prisma/client';

/**
 * Campos mínimos para ProductCard y listados públicos de catálogo.
 * Excluye `isActive`, timestamps y campos internos — evita crash si Prisma
 * intenta leer columnas aún no migradas cuando la consulta no las necesita.
 */
export const PRODUCT_CARD_SELECT = {
  id:            true,
  slug:          true,
  name:          true,
  description:   true,
  price:         true,
  originalPrice: true,
  stock:         true,
  category:      true,
  brand:         true,
  images:        true,
  freeShipping:  true,
} as const satisfies Prisma.ProductSelect;

/**
 * Campos para ficha de producto (SSR) — incluye specs, sku y media ordenada.
 */
export const PRODUCT_DETAIL_SELECT = {
  id:            true,
  slug:          true,
  name:          true,
  description:   true,
  price:         true,
  originalPrice: true,
  stock:         true,
  category:      true,
  brand:         true,
  images:        true,
  sku:           true,
  specs:         true,
  updatedAt:     true,
  freeShipping:  true,
  media:         { orderBy: { sortOrder: 'asc' as const } },
} as const satisfies Prisma.ProductSelect;

/**
 * Detalle admin — TODOS los campos que necesita el modal de edición.
 *
 * Antes se llamaba `PRODUCT_ADMIN_SELECT` y era el select del **listado**: cada
 * carga de Inventario descargaba `description`, `specs`, `media`, `cost` y
 * `profitMarginPct` de todos los productos existentes (RC-02 de la auditoría de
 * rendimiento). Ahora sólo se usa para un producto concreto, al pulsar «Editar».
 */
export const PRODUCT_ADMIN_DETAIL_SELECT = {
  id:            true,
  sku:           true,
  slug:          true,
  name:          true,
  description:   true,
  price:         true,
  originalPrice: true,
  cost:          true,
  profitMarginPct: true,
  stock:         true,
  category:      true,
  brand:         true,
  images:        true,
  specs:         true,
  isActive:      true,
  createdAt:     true,
  freeShipping:  true,
  media:         { orderBy: { sortOrder: 'asc' as const } },
} as const satisfies Prisma.ProductSelect;

/**
 * @deprecated Alias histórico de {@link PRODUCT_ADMIN_DETAIL_SELECT}. El listado
 * administrativo usa `lib/products/admin-product-query.ts` (DTO ligero).
 */
export const PRODUCT_ADMIN_SELECT = PRODUCT_ADMIN_DETAIL_SELECT;
