import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildCatalogHref, type CatalogUrlParams } from '@/lib/products/filter';

interface Props {
  /** Página actual (base 1). */
  page: number;
  /** Total de páginas. */
  totalPages: number;
  /**
   * Ruta base sin query params (p. ej. "/productos" o "/categoria/consolas").
   * page=1 → basePath (sin ?page=), page>=2 → basePath?page=N.
   */
  basePath: string;
  /** Filtros activos a preservar al paginar (opcional). */
  catalogQuery?: Omit<CatalogUrlParams, 'page'>;
}

/** Genera el href canónico para una página dada. */
function pageHref(basePath: string, n: number, catalogQuery?: Omit<CatalogUrlParams, 'page'>): string {
  if (catalogQuery) {
    return buildCatalogHref(basePath, { ...catalogQuery, page: n === 1 ? undefined : n });
  }
  return n === 1 ? basePath : `${basePath}?page=${n}`;
}

/**
 * Calcula el rango de números de página a renderizar.
 * Siempre incluye la primera, la última y hasta 2 páginas alrededor de la actual.
 * Inserta `null` como marcador de elipsis entre rangos no contiguos.
 */
function pageRange(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);
  for (let d = -2; d <= 2; d++) {
    const p = current + d;
    if (p >= 1 && p <= total) pages.add(p);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null);
    result.push(sorted[i]);
  }
  return result;
}

/**
 * PaginationBar — componente Server de solo lectura.
 * Renderiza enlaces `<a>` reales (Next Link) para que Google los rastree sin JS.
 * Se muestra solo cuando hay más de una página.
 */
export default function PaginationBar({ page, totalPages, basePath, catalogQuery }: Props) {
  if (totalPages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const items   = pageRange(page, totalPages);

  const baseBtn =
    'inline-flex items-center justify-center h-11 min-w-[44px] px-2 rounded-xl text-[13px] font-semibold transition-colors select-none';
  const activeBtn = `${baseBtn} bg-navy text-white shadow-soft`;
  const normalBtn = `${baseBtn} text-slate-600 hover:bg-slate-100 hover:text-navy`;
  const disabledBtn = `${baseBtn} text-slate-300 pointer-events-none`;

  return (
    <nav
      aria-label="Paginación del catálogo"
      className="flex items-center justify-center gap-1 mt-8 flex-wrap"
    >
      {/* Anterior */}
      {hasPrev ? (
        <Link
          href={pageHref(basePath, page - 1, catalogQuery)}
          rel="prev"
          aria-label="Página anterior"
          className={normalBtn}
        >
          <ChevronLeft size={16} />
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true">
          <ChevronLeft size={16} />
        </span>
      )}

      {/* Números de página */}
      {items.map((p, idx) =>
        p === null ? (
          <span
            key={`ellipsis-${idx}`}
            className="inline-flex items-center justify-center h-10 w-8 text-slate-400 text-sm select-none"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(basePath, p, catalogQuery)}
            aria-label={`Página ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className={p === page ? activeBtn : normalBtn}
          >
            {p}
          </Link>
        ),
      )}

      {/* Siguiente */}
      {hasNext ? (
        <Link
          href={pageHref(basePath, page + 1, catalogQuery)}
          rel="next"
          aria-label="Página siguiente"
          className={normalBtn}
        >
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true">
          <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}
