/**
 * Ordena bloques del inicio intercalando estanterías con mosaicos editoriales.
 * Una sola pasada, sin ternarios anidados en page.tsx.
 */
import type { ReactNode } from 'react';
export type HomeShelfSlot = {
  key: string;
  node: ReactNode;
  /** true si la estantería tiene productos válidos para renderizar. */
  hasProducts: boolean;
};

/**
 * Tras la 1ª estantería activa → Discover + CategoryRow.
 * Tras la 2ª → Promotions.
 * Si solo hay una (o ninguna) estantería válida, los bloques editoriales
 * se colocan después de esa / al inicio de la zona de estanterías.
 */
export function buildHomeShelfSections(opts: {
  shelves: HomeShelfSlot[];
  discover: ReactNode;
  categories: ReactNode;
  promotions: ReactNode;
}): ReactNode[] {
  const active = opts.shelves.filter((s) => s.hasProducts);
  const sections: ReactNode[] = [];

  if (active.length === 0) {
    sections.push(opts.discover, opts.categories, opts.promotions);
    return sections;
  }

  let editorialAfterFirstDone = false;
  let promotionsDone = false;

  active.forEach((shelf, index) => {
    sections.push(shelf.node);

    if (index === 0 && !editorialAfterFirstDone) {
      sections.push(opts.discover, opts.categories);
      editorialAfterFirstDone = true;
      if (active.length === 1 && !promotionsDone) {
        sections.push(opts.promotions);
        promotionsDone = true;
      }
      return;
    }

    if (index === 1 && !promotionsDone) {
      sections.push(opts.promotions);
      promotionsDone = true;
    }
  });

  if (!editorialAfterFirstDone) {
    sections.push(opts.discover, opts.categories);
  }
  if (!promotionsDone) {
    sections.push(opts.promotions);
  }

  return sections;
}
