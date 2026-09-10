import { describe, expect, it } from 'vitest';
import {
  CATEGORY_SHELF_ANCHOR,
  CATEGORY_SHELF_SIZE,
  ROTATION_WINDOW_MS,
  currentRotationBucket,
  planCategoryShelfRotation,
} from '@/lib/home-shelf-rotation';

/** Catálogo simulado: ids ordenados como los devolvería CATEGORY_SHELF_ORDER. */
function catalog(total: number): string[] {
  return Array.from({ length: total }, (_, i) => `p${i}`);
}

/** Aplica un plan sobre el catálogo simulado, igual que hace home-cache. */
function shelfFor(total: number, bucket: number): string[] {
  const rows = catalog(total);
  const { anchor, windows } = planCategoryShelfRotation({ total, bucket });
  const picked = [
    ...rows.slice(0, anchor),
    ...windows.flatMap((w) => rows.slice(w.skip, w.skip + w.take)),
  ];
  return Array.from(new Set(picked)).slice(0, CATEGORY_SHELF_SIZE);
}

describe('currentRotationBucket', () => {
  it('es constante dentro de la ventana y avanza al cruzarla', () => {
    const base = 5 * ROTATION_WINDOW_MS;
    expect(currentRotationBucket(base)).toBe(5);
    expect(currentRotationBucket(base + ROTATION_WINDOW_MS - 1)).toBe(5);
    expect(currentRotationBucket(base + ROTATION_WINDOW_MS)).toBe(6);
  });

  it('tolera entradas inválidas sin romper la cache key', () => {
    expect(currentRotationBucket(Number.NaN)).toBe(0);
    expect(currentRotationBucket(1_000, 0)).toBe(0);
  });
});

describe('planCategoryShelfRotation — sin rotación', () => {
  it('una categoría que cabe entera no dispara consultas extra', () => {
    for (const total of [0, 1, 17, CATEGORY_SHELF_SIZE]) {
      const plan = planCategoryShelfRotation({ total, bucket: 7 });
      expect(plan.windows).toEqual([]);
      expect(plan.anchor).toBe(CATEGORY_SHELF_SIZE);
    }
  });

  it('el mismo bucket produce siempre la misma estantería', () => {
    expect(shelfFor(50, 3)).toEqual(shelfFor(50, 3));
  });
});

describe('planCategoryShelfRotation — con rotación', () => {
  it('ancla las novedades y rota el resto', () => {
    const shelf = shelfFor(40, 1);
    expect(shelf).toHaveLength(CATEGORY_SHELF_SIZE);
    // Las primeras posiciones son siempre los más nuevos.
    expect(shelf.slice(0, CATEGORY_SHELF_ANCHOR)).toEqual(
      catalog(40).slice(0, CATEGORY_SHELF_ANCHOR),
    );
    // Y el bucket siguiente muestra productos distintos en los slots rotativos.
    expect(shelf.slice(CATEGORY_SHELF_ANCHOR)).not.toEqual(
      shelfFor(40, 2).slice(CATEGORY_SHELF_ANCHOR),
    );
  });

  it('nunca repite un producto dentro de la misma estantería', () => {
    for (let total = CATEGORY_SHELF_SIZE + 1; total <= 60; total++) {
      for (let bucket = 0; bucket < 12; bucket++) {
        const shelf = shelfFor(total, bucket);
        expect(new Set(shelf).size).toBe(shelf.length);
        expect(shelf).toHaveLength(CATEGORY_SHELF_SIZE);
      }
    }
  });

  it('los rangos rotativos no invaden el ancla', () => {
    for (let total = CATEGORY_SHELF_SIZE + 1; total <= 60; total++) {
      for (let bucket = 0; bucket < 12; bucket++) {
        const { windows } = planCategoryShelfRotation({ total, bucket });
        for (const w of windows) {
          expect(w.skip).toBeGreaterThanOrEqual(CATEGORY_SHELF_ANCHOR);
          expect(w.skip + w.take).toBeLessThanOrEqual(total);
          expect(w.take).toBeGreaterThan(0);
        }
      }
    }
  });

  it('cubre todo el catálogo tras suficientes ventanas (cola larga incluida)', () => {
    for (const total of [19, 25, 40, 97]) {
      const seen = new Set<string>();
      for (let bucket = 0; bucket < total; bucket++) {
        for (const id of shelfFor(total, bucket)) seen.add(id);
      }
      expect(seen.size).toBe(total);
    }
  });

  it('hace wrap-around en vez de devolver una estantería corta', () => {
    // total 25, ancla 6 ⇒ resto 19; bucket 1 arranca en offset 12 y desborda.
    const { windows } = planCategoryShelfRotation({ total: 25, bucket: 1 });
    expect(windows).toHaveLength(2);
    expect(windows[0]).toEqual({ skip: 18, take: 7 });
    expect(windows[1]).toEqual({ skip: 6, take: 5 });
  });

  it('un bucket negativo no genera skip negativo', () => {
    const { windows } = planCategoryShelfRotation({ total: 40, bucket: -3 });
    for (const w of windows) expect(w.skip).toBeGreaterThanOrEqual(0);
  });
});

describe('planCategoryShelfRotation — configuraciones límite', () => {
  it('ancla = size deja la estantería fija (rotación desactivada)', () => {
    const plan = planCategoryShelfRotation({
      total: 100,
      bucket: 4,
      size: 18,
      anchor: 18,
    });
    expect(plan).toEqual({ anchor: 18, windows: [] });
  });

  it('ancla = 0 rota la estantería completa', () => {
    const plan = planCategoryShelfRotation({
      total: 100,
      bucket: 1,
      size: 18,
      anchor: 0,
    });
    expect(plan.anchor).toBe(0);
    expect(plan.windows).toEqual([{ skip: 18, take: 18 }]);
  });

  it('size = 0 no consulta nada', () => {
    expect(planCategoryShelfRotation({ total: 100, bucket: 1, size: 0 })).toEqual(
      { anchor: 0, windows: [] },
    );
  });
});
