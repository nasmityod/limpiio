import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildCatalogHref, type ProductSort } from '@/lib/products/filter';

interface Props {
  q:           string;
  cat:         string;
  brand:       string;
  sort:        string;
  minPrice:    string;
  maxPrice:    string;
  disp:        string;
  currentPage: number;
  totalPages:  number;
}

function pageHref(
  q: string,
  cat: string,
  brand: string,
  sort: string,
  minPrice: string,
  maxPrice: string,
  disp: string,
  page: number,
): string {
  return buildCatalogHref('/buscar', {
    q: q || undefined,
    cat: cat || undefined,
    brand: brand || undefined,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    sort: sort as ProductSort,
    disp: disp === 'all' ? 'all' : undefined,
    page,
  });
}

export default function SearchPagination({
  q,
  cat,
  brand,
  sort,
  minPrice,
  maxPrice,
  disp,
  currentPage,
  totalPages,
}: Props) {
  const pages = buildPageWindow(currentPage, totalPages);

  return (
    <nav
      aria-label="Paginación de resultados"
      className="flex items-center justify-center gap-1.5 flex-wrap"
    >
      {currentPage > 1 ? (
        <Link
          href={pageHref(q, cat, brand, sort, minPrice, maxPrice, disp, currentPage - 1)}
          className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white border border-slate-200/80 text-navy hover:bg-slate-50 hover:border-navy/20 shadow-soft transition-all"
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white border border-slate-200/80 text-slate-300 shadow-soft cursor-not-allowed">
          <ChevronLeft size={16} />
        </span>
      )}

      {pages.map((p, i) =>
        p === '...' ? (
          <span
            key={`ellipsis-${i}`}
            className="inline-flex items-center justify-center w-11 h-11 text-slate-400 text-sm"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(q, cat, brand, sort, minPrice, maxPrice, disp, p as number)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={`inline-flex items-center justify-center w-11 h-11 rounded-xl text-sm font-semibold transition-all shadow-soft ${
              p === currentPage
                ? 'bg-navy text-white border border-navy'
                : 'bg-white border border-slate-200/80 text-navy hover:bg-slate-50 hover:border-navy/20'
            }`}
          >
            {p}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link
          href={pageHref(q, cat, brand, sort, minPrice, maxPrice, disp, currentPage + 1)}
          className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white border border-slate-200/80 text-navy hover:bg-slate-50 hover:border-navy/20 shadow-soft transition-all"
          aria-label="Página siguiente"
        >
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white border border-slate-200/80 text-slate-300 shadow-soft cursor-not-allowed">
          <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}

function buildPageWindow(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | '...')[] = [];
  const delta = 2;
  const left  = current - delta;
  const right = current + delta;

  pages.push(1);

  if (left > 2) pages.push('...');

  for (let p = Math.max(2, left); p <= Math.min(total - 1, right); p++) {
    pages.push(p);
  }

  if (right < total - 1) pages.push('...');

  pages.push(total);
  return pages;
}
