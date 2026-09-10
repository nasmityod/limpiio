'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Product } from '../../context/ProductContext';
import ProductCard from '../../components/ProductCard';
import ProductCardSkeleton from '../../components/ProductCardSkeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion, reducedTransition } from '@/lib/motion';
import {
  SlidersHorizontal, ChevronDown, X, SearchX, Search,
  Tag, ArrowUpDown, Cpu, DollarSign, Loader2,
} from 'lucide-react';
import {
  buildCatalogHref,
  type CatalogUrlParams,
  type ProductSort,
} from '@/lib/products/filter';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const DEBOUNCE_MS = 300;

interface ServerCategory {
  name: string;
  slug: string;
  count: number;
}

interface InitialQuery {
  q: string;
  category: string;
  brand: string;
  minPrice: string;
  maxPrice: string;
  sort: ProductSort;
}

interface Props {
  initialProducts: Product[];
  totalCount: number;
  serverCategories: ServerCategory[];
  facetBrands: string[];
  initialQuery: InitialQuery;
}

const SORT_OPTIONS = [
  { value: 'default', label: 'Relevancia / Novedad' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'price-asc', label: 'Menor precio' },
  { value: 'price-desc', label: 'Mayor precio' },
] as const satisfies ReadonlyArray<{ value: ProductSort; label: string }>;

function toUrlParams(state: InitialQuery): CatalogUrlParams {
  return {
    q: state.q.trim() || undefined,
    cat: state.category || undefined,
    brand: state.brand || undefined,
    minPrice: state.minPrice ? parseFloat(state.minPrice) : undefined,
    maxPrice: state.maxPrice ? parseFloat(state.maxPrice) : undefined,
    sort: state.sort,
  };
}

function countActiveFilters(state: InitialQuery): number {
  let n = 0;
  if (state.q.trim()) n++;
  if (state.category) n++;
  if (state.brand) n++;
  if (state.minPrice || state.maxPrice) n++;
  if (state.sort !== 'default' && state.sort !== 'newest') n++;
  return n;
}

// ── Panel de filtros ───────────────────────────────────────────────────────────
interface FilterPanelProps {
  serverCategories: ServerCategory[];
  totalCount: number;
  facetBrands: string[];
  state: InitialQuery;
  onNavigate: (next: Partial<InitialQuery>) => void;
  onApplyPrice: (min: string, max: string) => void;
  onClear: () => void;
}

function FilterPanel({
  serverCategories,
  totalCount,
  facetBrands,
  state,
  onNavigate,
  onApplyPrice,
  onClear,
}: FilterPanelProps) {
  const [catOpen, setCatOpen] = useState(true);
  const [brandOpen, setBrandOpen] = useState(true);
  const [priceOpen, setPriceOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [localMin, setLocalMin] = useState(state.minPrice);
  const [localMax, setLocalMax] = useState(state.maxPrice);

  useEffect(() => {
    setLocalMin(state.minPrice);
    setLocalMax(state.maxPrice);
  }, [state.minPrice, state.maxPrice]);

  const brandsToShow = state.category ? facetBrands : [];

  return (
    <aside className="bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">
      {/* Búsqueda local */}
      <div className="border-b border-slate-100 p-4">
        <label htmlFor="catalog-search" className="sr-only">Buscar en catálogo</label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="catalog-search"
            type="search"
            enterKeyHint="search"
            value={state.q}
            onChange={(e) => onNavigate({ q: e.target.value, brand: state.category ? state.brand : '' })}
            placeholder="Buscar productos..."
            className="w-full pl-9 pr-3 h-11 rounded-xl bg-slate-100 text-base text-navy placeholder:text-slate-400 border border-transparent focus:outline-none focus:bg-white focus:border-navy/20 focus:shadow-ring-navy"
          />
        </div>
      </div>

      {/* Categorías */}
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
          <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${catOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className={`grid transition-all duration-300 ease-out ${catOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <ul className="px-3 pb-4 space-y-0.5">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate({ category: '', brand: '' })}
                  className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                    !state.category
                      ? 'bg-navy text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                  }`}
                >
                  <span>Todos</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${!state.category ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {totalCount}
                  </span>
                </button>
              </li>
              {serverCategories.map((cat) => (
                <li key={cat.slug}>
                  <button
                    type="button"
                    onClick={() => onNavigate({ category: cat.name, brand: '' })}
                    className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                      state.category === cat.name
                        ? 'bg-navy text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                    }`}
                  >
                    <span className="truncate capitalize">{cat.name}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${state.category === cat.name ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {cat.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Marcas (subfiltro dentro de categoría) */}
      {brandsToShow.length > 0 && (
        <div className="border-b border-slate-100">
          <button
            type="button"
            onClick={() => setBrandOpen((v) => !v)}
            className="flex items-center justify-between w-full px-5 h-12 text-left text-navy"
            aria-expanded={brandOpen}
          >
            <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight">
              <Cpu size={14} className="text-slate-400" />
              Marca
            </span>
            <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${brandOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`grid transition-all duration-300 ease-out ${brandOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
              <ul className="px-3 pb-4 space-y-0.5">
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate({ brand: '' })}
                    className={`flex items-center w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                      !state.brand ? 'bg-navy text-white font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                    }`}
                  >
                    Todas las marcas
                  </button>
                </li>
                {brandsToShow.map((brand) => (
                  <li key={brand}>
                    <button
                      type="button"
                      onClick={() => onNavigate({ brand })}
                      className={`flex items-center w-full px-3 h-10 rounded-xl text-[13px] transition-colors truncate ${
                        state.brand === brand
                          ? 'bg-navy text-white font-semibold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                      }`}
                    >
                      {brand}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Rango de precio */}
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
              onClick={() => onApplyPrice(localMin, localMax)}
              className="w-full min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-navy text-xs font-semibold transition-colors"
            >
              Aplicar precio
            </button>
          </div>
        </div>
      </div>

      {/* Ordenar */}
      <div className="border-b border-slate-100">
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
          <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className={`grid transition-all duration-300 ease-out ${sortOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <ul className="px-3 pb-4 space-y-0.5">
              {SORT_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => onNavigate({ sort: opt.value })}
                    className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                      state.sort === opt.value
                        ? 'bg-slate-100 text-navy font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {state.sort === opt.value && (
                      <span className="w-2 h-2 rounded-full bg-brand-yellow" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {countActiveFilters(state) > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={onClear}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 hover:text-navy transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      <div className="px-5 py-4 bg-slate-50">
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <SlidersHorizontal size={13} className="text-slate-400" />
          {totalCount} {totalCount === 1 ? 'producto' : 'productos'}
        </div>
      </div>
    </aside>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
const ProductGridAndFilters = ({
  initialProducts,
  totalCount,
  serverCategories,
  facetBrands,
  initialQuery,
}: Props) => {
  const prefersReduced = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);

  // A11y móvil del drawer de filtros: scroll-lock + focus trap.
  useBodyScrollLock(mobileSidebarOpen);
  useFocusTrap({ containerRef: mobileDrawerRef, enabled: mobileSidebarOpen, onClose: () => setMobileSidebarOpen(false) });

  const [state, setState] = useState<InitialQuery>(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizar estado cuando el servidor re-renderiza tras navegación
  useEffect(() => {
    setState(initialQuery);
  }, [initialQuery]);

  const pushQuery = useCallback(
    (next: InitialQuery, immediate = false) => {
      const href = buildCatalogHref('/productos', toUrlParams(next));
      const navigate = () => startTransition(() => router.push(href));

      if (immediate) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        navigate();
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(navigate, DEBOUNCE_MS);
    },
    [router],
  );

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleNavigate = useCallback(
    (partial: Partial<InitialQuery>, immediate = false) => {
      const next = { ...state, ...partial };
      setState(next);
      if (partial.q !== undefined && !immediate) {
        pushQuery(next, false);
      } else {
        pushQuery(next, true);
      }
    },
    [state, pushQuery],
  );

  const handleApplyPrice = useCallback(
    (min: string, max: string) => {
      handleNavigate({ minPrice: min, maxPrice: max }, true);
    },
    [handleNavigate],
  );

  const handleClear = useCallback(() => {
    const cleared: InitialQuery = {
      q: '',
      category: '',
      brand: '',
      minPrice: '',
      maxPrice: '',
      sort: 'default',
    };
    setState(cleared);
    startTransition(() => router.push('/productos'));
  }, [router]);

  const activeFilterCount = useMemo(() => countActiveFilters(state), [state]);

  const panelProps: FilterPanelProps = {
    serverCategories,
    totalCount,
    facetBrands,
    state,
    onNavigate: (partial) => handleNavigate(partial, partial.q === undefined),
    onApplyPrice: handleApplyPrice,
    onClear: handleClear,
  };

  return (
    <section id="products" className="flex flex-col lg:flex-row gap-5 sm:gap-6 lg:gap-8 w-full max-w-full relative">
      {isPending && (
        <div className="absolute inset-0 z-10 bg-white/50 backdrop-blur-[1px] rounded-2xl flex items-start justify-center pt-24 pointer-events-none">
          <Loader2 size={28} className="animate-spin text-navy" aria-label="Cargando" />
        </div>
      )}

      <div className="hidden lg:block w-[280px] flex-shrink-0">
        <div className="sticky top-[96px]">
          <FilterPanel {...panelProps} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-3 sm:p-4 flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] sm:text-sm font-semibold text-navy capitalize truncate">
              {state.category || 'Productos'}
              {state.q && (
                <span className="text-slate-500 font-normal"> · &ldquo;{state.q}&rdquo;</span>
              )}
            </p>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              <span className="font-semibold text-navy nums">{totalCount}</span>{' '}
              {totalCount === 1 ? 'resultado' : 'resultados'}
              {initialProducts.length < totalCount && (
                <> · {initialProducts.length} en esta página</>
              )}
            </p>
          </div>

          <button
            type="button"
            className="lg:hidden inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-navy text-xs font-semibold px-3 min-h-[44px] rounded-xl transition-colors flex-shrink-0"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Abrir filtros"
          >
            <SlidersHorizontal size={14} />
            <span className="hidden xs:inline">Filtros</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="relative flex-shrink-0">
            <select
              value={state.sort}
              onChange={(e) => handleNavigate({ sort: e.target.value as ProductSort }, true)}
              aria-label="Ordenar productos"
              className="appearance-none bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-navy text-base font-semibold pl-3 pr-8 min-h-[44px] rounded-xl cursor-pointer transition-colors focus:outline-none focus:bg-white focus:shadow-ring-navy max-w-[45vw] xs:max-w-none truncate"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="text-xs text-slate-500">Filtros activos:</span>
            {state.q && (
              <button
                type="button"
                onClick={() => handleNavigate({ q: '' }, true)}
                className="inline-flex items-center gap-1.5 bg-navy text-white text-xs font-semibold px-3 min-h-[44px] sm:min-h-0 sm:h-8 rounded-full hover:bg-navy-700 transition-colors"
              >
                <span className="truncate max-w-[160px]">&ldquo;{state.q}&rdquo;</span>
                <X size={12} />
              </button>
            )}
            {state.category && (
              <button
                type="button"
                onClick={() => handleNavigate({ category: '', brand: '' }, true)}
                className="inline-flex items-center gap-1.5 bg-navy text-white text-xs font-semibold px-3 min-h-[44px] sm:min-h-0 sm:h-8 rounded-full hover:bg-navy-700 transition-colors capitalize"
              >
                {state.category}
                <X size={12} />
              </button>
            )}
            {state.brand && (
              <button
                type="button"
                onClick={() => handleNavigate({ brand: '' }, true)}
                className="inline-flex items-center gap-1.5 bg-navy text-white text-xs font-semibold px-3 min-h-[44px] sm:min-h-0 sm:h-8 rounded-full hover:bg-navy-700 transition-colors"
              >
                {state.brand}
                <X size={12} />
              </button>
            )}
            {(state.minPrice || state.maxPrice) && (
              <button
                type="button"
                onClick={() => handleNavigate({ minPrice: '', maxPrice: '' }, true)}
                className="inline-flex items-center gap-1.5 bg-navy text-white text-xs font-semibold px-3 min-h-[44px] sm:min-h-0 sm:h-8 rounded-full hover:bg-navy-700 transition-colors"
              >
                ${state.minPrice || '0'} — ${state.maxPrice || '∞'}
                <X size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center min-h-[44px] sm:min-h-0 px-1 text-xs text-slate-500 hover:text-navy underline underline-offset-2"
            >
              Limpiar todo
            </button>
          </div>
        )}

        {initialProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft px-5 py-12 sm:py-20 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <SearchX size={28} />
            </div>
            <p className="mt-4 text-lg font-semibold text-navy">No se encontraron productos</p>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              Prueba con otra búsqueda, quita filtros o revisa el rango de precio.
            </p>
            <button
              type="button"
              onClick={handleClear}
              className="mt-5 inline-flex items-center gap-2 bg-navy text-white text-sm font-semibold px-5 min-h-[44px] rounded-xl hover:bg-navy-700 active:bg-navy-800 shadow-soft transition-all"
            >
              Limpiar filtros
            </button>
          </div>
        ) : isPending ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
            {Array.from({ length: Math.min(initialProducts.length, 8) }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <motion.div
            key={`${state.sort}-${state.q}-${state.category}-${state.brand}-${pathname}-${searchParams.toString()}`}
            initial="hidden"
            animate="visible"
            variants={
              prefersReduced
                ? { visible: { transition: { staggerChildren: 0, delayChildren: 0 } } }
                : { visible: { transition: { staggerChildren: 0.04 } } }
            }
            className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5"
          >
            {initialProducts.map((product) => (
              <motion.div
                key={product.id}
                variants={
                  prefersReduced
                    ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.1 } } }
                    : {
                        hidden: { opacity: 0, y: 14 },
                        visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
                      }
                }
                className="h-full"
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <div ref={mobileDrawerRef} className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={prefersReduced ? reducedTransition : undefined}
              className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Filtros del catálogo"
              initial={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
              animate={prefersReduced ? { opacity: 1 } : { x: 0 }}
              exit={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
              transition={prefersReduced ? reducedTransition : { type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-[88vw] max-w-[340px] bg-surface-sunken h-full overflow-y-auto p-5 shadow-lift"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center justify-between mb-5">
                <p className="text-base font-semibold text-navy">Filtros</p>
                <button
                  ref={mobileCloseRef}
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-label="Cerrar filtros"
                  className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-navy hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
              <FilterPanel {...panelProps} />
              <button
                type="button"
                className="mt-5 w-full bg-navy text-white font-semibold text-sm h-12 rounded-xl hover:bg-navy-700 shadow-soft transition-all"
                onClick={() => setMobileSidebarOpen(false)}
              >
                Ver {totalCount} productos
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default ProductGridAndFilters;
