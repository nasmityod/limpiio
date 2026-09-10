/**
 * Rotación determinista de las estanterías por categoría del home.
 *
 * El home es ISR (revalidate=300) y sus consultas viven en `unstable_cache`:
 * cualquier rotación debe ser función pura del reloj para poder entrar en la
 * cache key. `ORDER BY random()` quedaría congelado por el caché y barajar en
 * el cliente nunca alcanzaría a los productos fuera de los 18 ya traídos.
 *
 * Modelo: una ventana temporal (`bucket`) desplaza una vista circular sobre el
 * catálogo de la categoría, con los más nuevos anclados en cabecera. Todo
 * producto entra en rotación tarde o temprano; el mismo instante siempre
 * produce la misma estantería para todos los visitantes.
 */

/** Duración de cada ventana. Múltiplo del revalidate del home (300s). */
export const ROTATION_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Productos visibles por estantería de categoría. */
export const CATEGORY_SHELF_SIZE = 18;

/** Slots fijos en cabecera con los más nuevos; los demás rotan. */
export const CATEGORY_SHELF_ANCHOR = 6;

/** Rango de una consulta paginada (skip/take de Prisma). */
export type ShelfRange = { skip: number; take: number };

export type CategoryShelfRotation = {
  /** Cuántas filas tomar de la consulta de cabecera (los más nuevos). */
  anchor: number;
  /** Rangos para los slots rotativos. Vacío si no hay nada que rotar. */
  windows: ShelfRange[];
};

/**
 * Ventana temporal vigente. Determinista y compartida por todas las
 * estanterías, de modo que el home rota entero de una vez.
 */
export function currentRotationBucket(
  now: number = Date.now(),
  windowMs: number = ROTATION_WINDOW_MS,
): number {
  if (!Number.isFinite(now) || !Number.isFinite(windowMs) || windowMs <= 0) {
    return 0;
  }
  return Math.floor(now / windowMs);
}

/**
 * Reparte los `size` slots de una estantería entre el ancla de novedades y una
 * ventana circular sobre el resto del catálogo.
 *
 * - `total <= size`: cabe entero, no hay rotación (ni consulta extra).
 * - `total > size`: `anchor` novedades fijas + `size - anchor` rotativos,
 *   con wrap-around cuando la ventana desborda el final del catálogo.
 *
 * Los rangos devueltos nunca se solapan entre sí ni con el ancla.
 */
export function planCategoryShelfRotation({
  total,
  bucket,
  size = CATEGORY_SHELF_SIZE,
  anchor = CATEGORY_SHELF_ANCHOR,
}: {
  total: number;
  bucket: number;
  size?: number;
  anchor?: number;
}): CategoryShelfRotation {
  const shelfSize = Math.max(0, Math.trunc(size));
  const safeTotal = Math.max(0, Math.trunc(total));

  if (shelfSize === 0) return { anchor: 0, windows: [] };
  if (safeTotal <= shelfSize) return { anchor: shelfSize, windows: [] };

  const anchorCount = Math.min(Math.max(0, Math.trunc(anchor)), shelfSize);
  const rotateCount = shelfSize - anchorCount;
  if (rotateCount === 0) return { anchor: anchorCount, windows: [] };

  // total > shelfSize ⇒ rest > rotateCount, la ventana siempre cabe.
  const rest = safeTotal - anchorCount;
  const safeBucket = Number.isFinite(bucket) ? Math.trunc(bucket) : 0;
  const offset = ((((safeBucket % rest) * rotateCount) % rest) + rest) % rest;

  const head = Math.min(rotateCount, rest - offset);
  const windows: ShelfRange[] = [{ skip: anchorCount + offset, take: head }];
  if (head < rotateCount) {
    windows.push({ skip: anchorCount, take: rotateCount - head });
  }

  return { anchor: anchorCount, windows };
}
