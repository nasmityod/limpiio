/**
 * Contrato compartido del listado de Inventario admin.
 *
 * Este módulo es **puro**: no importa Prisma ni nada de servidor, así que puede
 * importarse desde el Client Component `/admin/products` sin arrastrar `pg` al
 * bundle del navegador. La consulta vive en `admin-product-query.ts`.
 */

/** Página por defecto del inventario admin. */
export const ADMIN_PRODUCTS_PAGE_SIZE = 30;
/** Cota dura para el `pageSize` recibido del cliente. */
export const ADMIN_PRODUCTS_MAX_PAGE_SIZE = 100;
/** Umbral por defecto de «stock bajo» (coincide con la UI del panel). */
export const ADMIN_LOW_STOCK_THRESHOLD = 3;
/** Longitud máxima aceptada en el buscador. */
export const ADMIN_SEARCH_MAX_LENGTH = 120;

export type AdminStockFilter = 'all' | 'low' | 'out';
export type AdminStatusFilter = 'all' | 'active' | 'inactive';

export interface AdminProductFilters {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  stockFilter?: AdminStockFilter;
  status?: AdminStatusFilter;
  lowThreshold?: number;
}

export interface AdminProductListParams extends AdminProductFilters {
  /** Cursor opaco devuelto por la página anterior. */
  cursor?: string | null;
  pageSize?: number;
}

/**
 * DTO ligero de fila/card. NO incluye `description`, `specs`, `media`, `cost`
 * ni `profitMarginPct`: son datos de edición y viajan sólo al abrir el modal.
 */
export interface AdminProductListItem {
  id: string;
  sku: string | null;
  name: string;
  category: string;
  brand: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  isActive: boolean;
  freeShipping: boolean;
  /** Miniatura ya resuelta en servidor (no viaja el array completo de imágenes). */
  image: string;
  createdAt: string;
}

export interface AdminProductListResult {
  products: AdminProductListItem[];
  /** Cursor de la página siguiente, o null si ésta es la última. */
  nextCursor: string | null;
  /** Total de productos que cumplen los filtros (no sólo la página). */
  total: number;
  /** Productos con stock bajo dentro del conjunto filtrado. */
  lowStockCount: number;
  /** Productos agotados dentro del conjunto filtrado. */
  outOfStockCount: number;
  pageSize: number;
}

/** Fila del CSV de inventario. Cabeceras canónicas de `importProductsFromCSV`. */
export interface AdminProductCsvRow {
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  imageUrl: string;
  freeShipping: string;
}

export type NormalizedAdminProductFilters = Required<
  Pick<AdminProductFilters, 'stockFilter' | 'status' | 'lowThreshold'>
> &
  AdminProductFilters;

/** Saneado de los filtros que llegan del cliente (entrada no confiable). */
export function normalizeAdminProductFilters(
  filters: AdminProductFilters,
): NormalizedAdminProductFilters {
  const search = (filters.search ?? '').trim().slice(0, ADMIN_SEARCH_MAX_LENGTH);
  const category = (filters.category ?? '').trim().slice(0, 120);
  const lowThresholdRaw = filters.lowThreshold ?? ADMIN_LOW_STOCK_THRESHOLD;
  return {
    search: search || undefined,
    category: category || undefined,
    minPrice:
      typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice)
        ? filters.minPrice
        : undefined,
    maxPrice:
      typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice)
        ? filters.maxPrice
        : undefined,
    stockFilter: filters.stockFilter ?? 'all',
    status: filters.status ?? 'all',
    lowThreshold:
      Number.isFinite(lowThresholdRaw) && lowThresholdRaw > 0
        ? Math.floor(lowThresholdRaw)
        : ADMIN_LOW_STOCK_THRESHOLD,
  };
}

export function clampAdminPageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize)) return ADMIN_PRODUCTS_PAGE_SIZE;
  return Math.min(ADMIN_PRODUCTS_MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize as number)));
}
