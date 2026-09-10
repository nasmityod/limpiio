'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SlidersHorizontal,
  ChevronDown,
  Tag,
  ArrowUpDown,
  Cpu,
  X,
  PackageCheck,
  PackageX,
  DollarSign,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion, reducedTransition } from '@/lib/motion';
import { buildCatalogHref, type ProductSort } from '@/lib/products/filter';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const SORT_OPTIONS = [
  { value: 'default',    label: 'Relevancia'   },
  { value: 'newest',     label: 'Más recientes' },
  { value: 'price-asc',  label: 'Menor precio' },
  { value: 'price-desc', label: 'Mayor precio' },
  { value: 'name-asc',   label: 'Nombre A-Z'   },
  { value: 'name-desc',  label: 'Nombre Z-A'   },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

interface Props {
  q:            string;
  currentCat:   string;
  currentBrand: string;
  currentSort:  string;
  minPrice:     string;
  maxPrice:     string;
  /** PRD-167: true = la URL lleva disp=all (incluye productos agotados). */
  includeOutOfStock: boolean;
  categories:   string[];
  brands:       string[];
  totalCount:   number;
  variant:      'sidebar' | 'toolbar';
  filteredCount?: number;
  activePage?:  number;
}

function buildHref(
  q: string,
  cat: string,
  brand: string,
  sort: string,
  includeOutOfStock: boolean,
  minPrice: string,
  maxPrice: string,
  page?: number,
): string {
  return buildCatalogHref('/buscar', {
    q: q || undefined,
    cat: cat || undefined,
    brand: brand || undefined,
    minPrice: minPrice ? parseFloat(minPrice) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    sort: sort as ProductSort,
    disp: includeOutOfStock ? 'all' : undefined,
    page,
  });
}

// ─────────────────────────────────────────────────────────────
// Panel de filtros reutilizable (sidebar y drawer móvil)
// ─────────────────────────────────────────────────────────────
interface FilterPanelProps {
  q:                 string;
  currentCat:        string;
  currentBrand:      string;
  currentSort:       string;
  minPrice:          string;
  maxPrice:          string;
  includeOutOfStock: boolean;
  categories:        string[];
  brands:            string[];
  totalCount:        number;
  onApply?:          () => void;
}

function FilterPanel({
  q,
  currentCat,
  currentBrand,
  currentSort,
  minPrice,
  maxPrice,
  includeOutOfStock,
  categories,
  brands,
  totalCount,
  onApply,
}: FilterPanelProps) {
  const router = useRouter();
  const [catOpen, setCatOpen] = useState(true);
  const [brandOpen, setBrandOpen] = useState(true);
  const [priceOpen, setPriceOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [localMin, setLocalMin] = useState(minPrice);
  const [localMax, setLocalMax] = useState(maxPrice);

  const navigate = (cat: string, brand: string, sort: string, min = minPrice, max = maxPrice) => {
    router.push(buildHref(q, cat, brand, sort, includeOutOfStock, min, max));
    onApply?.();
  };

  return (
    <aside className="bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">

      {/* Categorías */}
      {categories.length > 0 && (
        <div className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setCatOpen((v) => !v)}
            className="flex items-center justify-between w-full px-5 h-12 text-left text-navy"
            aria-expanded={catOpen}
          >
            <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight">
              <Tag size={14} className="text-slate-400" />
              Categorías
            </span>
            <ChevronDown
              size={15}
              className={`text-slate-400 transition-transform duration-200 ${catOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div
            className={`grid transition-all duration-300 ease-out ${catOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
          >
            <div className="overflow-hidden">
              <ul className="px-3 pb-4 space-y-0.5">
                <li>
                  <button type="button"
                    onClick={() => navigate('', currentBrand, currentSort)}
                    className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                      !currentCat
                        ? 'bg-navy text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                    }`}
                  >
                    <span>Todas las categorías</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        !currentCat ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {totalCount}
                    </span>
                  </button>
                </li>
                {categories.map((cat) => (
                  <li key={cat}>
                    <button type="button"
                      onClick={() => navigate(cat, currentBrand, currentSort)}
                      className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                        currentCat === cat
                          ? 'bg-navy text-white font-semibold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                      }`}
                    >
                      <span className="truncate capitalize">{cat}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Marcas */}
      {brands.length > 0 && (
        <div className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setBrandOpen((v) => !v)}
            className="flex items-center justify-between w-full px-5 h-12 text-left text-navy"
            aria-expanded={brandOpen}
          >
            <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight">
              <Cpu size={14} className="text-slate-400" />
              Marcas
            </span>
            <ChevronDown
              size={15}
              className={`text-slate-400 transition-transform duration-200 ${brandOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div
            className={`grid transition-all duration-300 ease-out ${brandOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
          >
            <div className="overflow-hidden">
              <ul className="px-3 pb-4 space-y-0.5">
                <li>
                  <button type="button"
                    onClick={() => navigate(currentCat, '', currentSort)}
                    className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                      !currentBrand
                        ? 'bg-navy text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                    }`}
                  >
                    <span>Todas las marcas</span>
                  </button>
                </li>
                {brands.map((brand) => (
                  <li key={brand}>
                    <button type="button"
                      onClick={() => navigate(currentCat, brand, currentSort)}
                      className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                        currentBrand === brand
                          ? 'bg-navy text-white font-semibold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                      }`}
                    >
                      <span className="truncate">{brand}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Precio */}
      <div className="border-b border-slate-100">
        <button
          type="button"
          onClick={() => setPriceOpen((v) => !v)}
          className="flex items-center justify-between w-full px-5 h-12 text-left text-navy"
          aria-expanded={priceOpen}
        >
          <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight">
            <DollarSign size={14} className="text-slate-400" />
            Precio (USD)
          </span>
          <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${priceOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className={`grid transition-all duration-300 ease-out ${priceOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden px-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="Mín"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-100 text-base text-navy border border-transparent focus:outline-none focus:bg-white focus:border-navy/20"
                aria-label="Precio mínimo"
              />
              <span className="text-slate-400 text-sm">—</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="Máx"
                value={localMax}
                onChange={(e) => setLocalMax(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-100 text-base text-navy border border-transparent focus:outline-none focus:bg-white focus:border-navy/20"
                aria-label="Precio máximo"
              />
            </div>
            <button
              type="button"
              onClick={() => navigate(currentCat, currentBrand, currentSort, localMin, localMax)}
              className="w-full min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-navy text-xs font-semibold transition-colors"
            >
              Aplicar precio
            </button>
          </div>
        </div>
      </div>

      {/* Ordenar */}
      <div className="border-b border-slate-100 last:border-b-0">
        <button
          type="button"
          onClick={() => setSortOpen((v) => !v)}
          className="flex items-center justify-between w-full px-5 h-12 text-left text-navy"
          aria-expanded={sortOpen}
        >
          <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight">
            <ArrowUpDown size={14} className="text-slate-400" />
            Ordenar
          </span>
          <ChevronDown
            size={15}
            className={`text-slate-400 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <div
          className={`grid transition-all duration-300 ease-out ${sortOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <ul className="px-3 pb-4 space-y-0.5">
              {SORT_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <button type="button"
                    onClick={() => navigate(currentCat, currentBrand, opt.value)}
                    className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                      currentSort === opt.value
                        ? 'bg-slate-100 text-navy font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {currentSort === opt.value && (
                      <span className="w-2 h-2 rounded-full bg-brand-yellow" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* PRD-167: Toggle "incluir agotados" — por defecto solo se muestran
          productos con stock > 0. disp=all incluye los agotados. */}
      <div className="border-b border-slate-100 last:border-b-0">
        <button
          type="button"
          onClick={() =>
            router.push(
              buildHref(q, currentCat, currentBrand, currentSort, !includeOutOfStock, minPrice, maxPrice),
            )
          }
          aria-pressed={includeOutOfStock}
          className="flex items-center justify-between w-full px-5 h-12 text-left text-navy hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight">
            {includeOutOfStock ? (
              <PackageX size={14} className="text-slate-400" />
            ) : (
              <PackageCheck size={14} className="text-slate-400" />
            )}
            Mostrar agotados
          </span>
          <span
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 ${
              includeOutOfStock ? 'bg-navy' : 'bg-slate-200'
            }`}
            aria-hidden
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                includeOutOfStock ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>

      <div className="px-5 py-3.5 bg-slate-50">
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <SlidersHorizontal size={13} className="text-slate-400" />
          {totalCount} {totalCount === 1 ? 'producto' : 'productos'} en total
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────
// Componente principal exportado
// ─────────────────────────────────────────────────────────────
export default function SearchFiltersBar(props: Props) {
  const prefersReduced = useReducedMotion();
  const { variant, q, currentCat, currentBrand, currentSort, minPrice, maxPrice, includeOutOfStock, filteredCount } = props;
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);

  // A11y móvil del drawer de filtros: scroll-lock + focus trap.
  useBodyScrollLock(mobileOpen);
  useFocusTrap({ containerRef: mobileDrawerRef, enabled: mobileOpen, onClose: () => setMobileOpen(false) });

  if (variant === 'sidebar') {
    return <FilterPanel {...props} />;
  }

  // ── Toolbar (móvil + desktop sort select) ──
  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-3 sm:p-4 flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] sm:text-sm font-semibold text-navy truncate">
            {currentCat ? (
              <span className="capitalize">{currentCat}</span>
            ) : (
              'Todos los resultados'
            )}
            {currentBrand && (
              <span className="text-slate-500 font-normal"> · {currentBrand}</span>
            )}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            <span className="font-semibold text-navy nums">{filteredCount ?? 0}</span>{' '}
            {(filteredCount ?? 0) === 1 ? 'resultado' : 'resultados'} en esta página
          </p>
        </div>

        {/* Botón filtros móvil */}
        <button
          type="button"
          className="lg:hidden inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-navy text-xs font-semibold px-3 min-h-[44px] rounded-xl transition-colors flex-shrink-0"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir filtros"
        >
          <SlidersHorizontal size={14} />
          <span className="hidden xs:inline">Filtros</span>
          {(currentCat || currentBrand || minPrice || maxPrice) && (
            <span className="w-5 h-5 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {(currentCat ? 1 : 0) + (currentBrand ? 1 : 0) + (minPrice || maxPrice ? 1 : 0)}
            </span>
          )}
        </button>

        {/* Sort select desktop */}
        <div className="relative flex-shrink-0">
          <select
            value={currentSort}
            onChange={(e) =>
              router.push(buildHref(q, currentCat, currentBrand, e.target.value, includeOutOfStock, minPrice, maxPrice))
            }
            aria-label="Ordenar resultados"
            className="appearance-none bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-navy text-base font-semibold pl-3 pr-8 min-h-[44px] rounded-xl cursor-pointer transition-colors focus:outline-none focus:bg-white focus:shadow-ring-navy max-w-[45vw] xs:max-w-none truncate"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
          />
        </div>
      </div>

      {/* ── Drawer filtros móvil ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div ref={mobileDrawerRef} className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={prefersReduced ? reducedTransition : undefined}
              className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Filtros de búsqueda"
              initial={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
              animate={prefersReduced ? { opacity: 1 } : { x: 0 }}
              exit={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
              transition={prefersReduced ? reducedTransition : { type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-[88vw] max-w-[340px] bg-surface-sunken h-full overflow-y-auto p-5 shadow-lift"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center justify-between mb-5">
                <p className="text-base font-semibold text-navy">Filtros</p>
                <button type="button"
                  ref={mobileCloseRef}
                  onClick={() => setMobileOpen(false)}
                  className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-navy hover:bg-slate-100 active:bg-slate-200"
                  aria-label="Cerrar filtros"
                >
                  <X size={18} />
                </button>
              </div>
              <FilterPanel {...props} onApply={() => setMobileOpen(false)} />
              <button type="button"
                className="mt-5 w-full bg-navy text-white font-semibold text-sm h-12 rounded-xl hover:bg-navy-700 shadow-soft hover:shadow-card transition-all"
                onClick={() => setMobileOpen(false)}
              >
                Ver resultados
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
