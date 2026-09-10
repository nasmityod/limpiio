'use client';

import { useEffect, useState, useRef, useTransition, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  PlusCircle, Trash2, Edit, Upload, Download, Check, X, Search, ChevronDown,
  ChevronLeft, ChevronRight, RotateCcw, Loader2,
} from 'lucide-react';
import {
  getProductsAdmin,
  getAdminProductCategories,
  getAdminProductById,
  deleteProductAction,
  setProductActiveAction,
  importProductsFromCSV,
  quickUpdateStockAction,
  quickUpdatePriceAction,
  type AdminProductDetail,
} from '@/app/actions/productActions';
import AddProductModal from '@/app/components/AddProductModal';
import { DataTable, type DataTableColumn } from '@/components/admin/DataTable';
import { TouchIconButton } from '@/components/admin/TouchIconButton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  ADMIN_LOW_STOCK_THRESHOLD,
  ADMIN_PRODUCTS_PAGE_SIZE,
  type AdminProductListItem,
  type AdminStatusFilter,
  type AdminStockFilter,
} from '@/lib/products/admin-product-dto';

/**
 * Inventario admin.
 *
 * ANTES (auditoría de rendimiento, RC-01/RC-02): `loadProducts()` llamaba a
 * `getProductsAdmin()` sin paginación y recibía TODOS los productos con
 * descripción, specs, coste, margen y media. El coste de entrar a Inventario,
 * de escribir en el buscador y de guardar un producto crecía linealmente con el
 * catálogo (≈6,4 MB de JSON con 5 000 productos). Además la tabla renderizaba
 * las 5 000 filas en móvil y en escritorio a la vez.
 *
 * AHORA: paginación keyset en servidor con DTO de fila, contadores agregados en
 * PostgreSQL, detalle completo bajo demanda al editar y exportación CSV
 * resuelta en servidor sobre el filtro completo.
 */

type StockFilter = AdminStockFilter;
type StatusFilter = AdminStatusFilter;
type Product = AdminProductListItem;

interface InlineEdit {
  id:    string;
  field: 'stock' | 'price';
  value: string;
}

/** Resultado del import CSV mostrado en panel (PRD-085: detalle por fila, no alert). */
interface ImportResult {
  success:      boolean;
  message:      string;
  createdCount: number;
  updatedCount: number;
  errors:       string[];
}

const LOW_STOCK_THRESHOLD = ADMIN_LOW_STOCK_THRESHOLD;
const PAGE_SIZE = ADMIN_PRODUCTS_PAGE_SIZE;

const STOCK_FILTERS: StockFilter[] = ['all', 'low', 'out'];
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all',      label: 'Todos' },
  { id: 'active',   label: 'Publicados' },
  { id: 'inactive', label: 'Despublicados' },
];

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">Agotado</span>;
  if (stock < LOW_STOCK_THRESHOLD)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">Bajo · {stock}</span>;
  return <span className="text-sm font-semibold text-gray-700 tabular-nums">{stock}</span>;
}

/** Estado de paginación keyset. `stack[i]` es el cursor con el que se pidió la página `i`. */
interface PaginationState {
  /** Huella de los filtros con los que se construyó la pila. */
  key:   string;
  stack: (string | null)[];
  index: number;
}

function AdminProductsContent() {
  const [products, setProducts]           = useState<Product[]>([]);
  const [categories, setCategories]       = useState<string[]>([]);
  const [total, setTotal]                 = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [outCount, setOutCount]           = useState(0);
  const [nextCursor, setNextCursor]       = useState<string | null>(null);
  /** Sólo la primera carga muestra esqueleto completo. */
  const [loading, setLoading]             = useState(true);
  /** Recargas posteriores: los datos actuales siguen visibles. */
  const [refreshing, setRefreshing]       = useState(false);
  const [loadError, setLoadError]         = useState(false);
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState<string | null>(null);
  const [isImporting, startImportTr]      = useTransition();
  const [importResult, setImportResult]   = useState<ImportResult | null>(null);
  const [inlineEdit, setInlineEdit]       = useState<InlineEdit | null>(null);
  const [inlineError, setInlineError]     = useState<string | null>(null);
  const [savingInline, startInlineTr]     = useTransition();
  const [exporting, setExporting]         = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);
  const inlineInputRef                    = useRef<HTMLInputElement>(null);

  const [stockFilter, setStockFilter]     = useState<StockFilter>('all');
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('all');
  const [showFilters, setShowFilters]     = useState(false);

  const searchParams   = useSearchParams();
  const router         = useRouter();
  const pathname       = usePathname();
  const searchTerm     = searchParams.get('search')   ?? '';
  const categoryFilter = searchParams.get('category') ?? '';
  const minPriceFromUrl = searchParams.get('minPrice') ?? '';
  const maxPriceFromUrl = searchParams.get('maxPrice') ?? '';

  const [searchInput, setSearchInput] = useState(searchTerm);
  const [minPrice, setMinPrice] = useState(minPriceFromUrl);
  const [maxPrice, setMaxPrice] = useState(maxPriceFromUrl);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const debouncedMinPrice = useDebouncedValue(minPrice, 300);
  const debouncedMaxPrice = useDebouncedValue(maxPrice, 300);
  const skipDebouncedUrlSync = useRef(true);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    setMinPrice(minPriceFromUrl);
  }, [minPriceFromUrl]);

  useEffect(() => {
    setMaxPrice(maxPriceFromUrl);
  }, [maxPriceFromUrl]);

  useEffect(() => {
    if (skipDebouncedUrlSync.current) {
      skipDebouncedUrlSync.current = false;
      return;
    }
    const searchTrimmed = debouncedSearch.trim();
    const minTrimmed = debouncedMinPrice.trim();
    const maxTrimmed = debouncedMaxPrice.trim();
    const searchCurrent = searchTerm.trim();
    const minCurrent = minPriceFromUrl.trim();
    const maxCurrent = maxPriceFromUrl.trim();
    if (
      searchTrimmed === searchCurrent &&
      minTrimmed === minCurrent &&
      maxTrimmed === maxCurrent
    ) {
      return;
    }
    const params = new URLSearchParams(searchParams);
    if (searchTrimmed) params.set('search', searchTrimmed);
    else params.delete('search');
    if (minTrimmed) params.set('minPrice', minTrimmed);
    else params.delete('minPrice');
    if (maxTrimmed) params.set('maxPrice', maxTrimmed);
    else params.delete('maxPrice');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    debouncedSearch,
    debouncedMinPrice,
    debouncedMaxPrice,
    searchTerm,
    minPriceFromUrl,
    maxPriceFromUrl,
    searchParams,
    router,
    pathname,
  ]);

  const parsedMin = minPriceFromUrl ? Number.parseFloat(minPriceFromUrl) : undefined;
  const parsedMax = maxPriceFromUrl ? Number.parseFloat(maxPriceFromUrl) : undefined;

  const activeFilters = useMemo(() => ({
    search:   searchTerm || undefined,
    category: categoryFilter || undefined,
    minPrice: parsedMin != null && !Number.isNaN(parsedMin) ? parsedMin : undefined,
    maxPrice: parsedMax != null && !Number.isNaN(parsedMax) ? parsedMax : undefined,
    stockFilter,
    status: statusFilter,
  }), [searchTerm, categoryFilter, parsedMin, parsedMax, stockFilter, statusFilter]);

  const filtersKey = JSON.stringify(activeFilters);

  const [pagination, setPagination] = useState<PaginationState>({
    key: filtersKey, stack: [null], index: 0,
  });

  // Cambiar de filtro reinicia la paginación. Ajustar el estado durante el
  // render (patrón soportado por React) evita el doble fetch que provocaría
  // hacerlo en un efecto.
  if (pagination.key !== filtersKey) {
    setPagination({ key: filtersKey, stack: [null], index: 0 });
  }

  const pageIndex = pagination.key === filtersKey ? pagination.index : 0;
  const currentCursor = pagination.key === filtersKey ? pagination.stack[pagination.index] ?? null : null;

  /**
   * Guardia de concurrencia: cada carga incrementa el contador y sólo la
   * respuesta con el número vigente puede escribir en el estado. Sin esto, una
   * búsqueda lenta anterior podía llegar después y pisar los resultados nuevos.
   */
  const requestSeq = useRef(0);
  const hasLoadedOnce = useRef(false);

  const loadProducts = useCallback(async (): Promise<boolean> => {
    const seq = ++requestSeq.current;
    if (hasLoadedOnce.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await getProductsAdmin({
        ...activeFilters,
        lowThreshold: LOW_STOCK_THRESHOLD,
        cursor: currentCursor,
        pageSize: PAGE_SIZE,
      });
      if (seq !== requestSeq.current) return true; // respuesta obsoleta: se descarta
      setProducts(result.products);
      setTotal(result.total);
      setLowStockCount(result.lowStockCount);
      setOutCount(result.outOfStockCount);
      setNextCursor(result.nextCursor);
      setLoadError(false);
      // Si eliminar/despublicar vació la última página, retrocede una.
      if (result.products.length === 0 && pageIndex > 0) {
        setPagination(prev => (prev.index === 0 ? prev : { ...prev, index: prev.index - 1 }));
      }
      return true;
    } catch (err) {
      if (seq !== requestSeq.current) return true;
      // RUN-12/ADM: sin este catch, un fallo de red/sesión dejaba la lista
      // vacía sin ninguna señal para el operador.
      console.error('[admin/products] error cargando inventario:', err);
      setLoadError(true);
      return false;
    } finally {
      if (seq === requestSeq.current) {
        hasLoadedOnce.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeFilters, currentCursor, pageIndex]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  // Las categorías cambian muy poco comparadas con las búsquedas del
  // inventario: se piden UNA vez al montar (y tras guardar), no en cada carga
  // de productos como hacía la versión anterior (RC-04).
  const loadCategories = useCallback(async () => {
    try {
      setCategories(await getAdminProductCategories());
    } catch (err) {
      console.error('[admin/products] error cargando categorías:', err);
    }
  }, []);

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  // Aplica el filtro de stock recibido por query (?stock=low|out), p. ej. desde
  // el enlace «stock bajo» del dashboard. Solo en el montaje inicial para no
  // sobrescribir el filtro que el operador elija después.
  const stockParamApplied = useRef(false);
  useEffect(() => {
    if (stockParamApplied.current) return;
    stockParamApplied.current = true;
    const s = searchParams.get('stock');
    if (s === 'low' || s === 'out') setStockFilter(s);
  }, [searchParams]);

  useEffect(() => {
    if (inlineEdit) inlineInputRef.current?.focus();
  }, [inlineEdit]);

  // ── Exportación CSV ───────────────────────────────────────────────────────
  // Se resuelve en servidor sobre el conjunto filtrado COMPLETO. Antes se
  // generaba con el array cargado en el navegador, lo que con paginación habría
  // exportado en silencio sólo la página visible.
  const handleExportCsv = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeFilters.search) params.set('search', activeFilters.search);
    if (activeFilters.category) params.set('category', activeFilters.category);
    if (activeFilters.minPrice != null) params.set('minPrice', String(activeFilters.minPrice));
    if (activeFilters.maxPrice != null) params.set('maxPrice', String(activeFilters.maxPrice));
    if (activeFilters.stockFilter !== 'all') params.set('stock', activeFilters.stockFilter);
    if (activeFilters.status !== 'all') params.set('status', activeFilters.status);

    setExporting(true);
    try {
      const res = await fetch(`/api/admin/products/export.csv?${params.toString()}`, {
        headers: { Accept: 'application/json, text/csv' },
      });
      if (!res.ok) {
        const message = res.headers.get('content-type')?.includes('application/json')
          ? ((await res.json()) as { message?: string }).message
          : await res.text();
        window.alert(message || 'No se pudo exportar el inventario.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventario-mundotech-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[admin/products] error exportando CSV:', err);
      window.alert('No se pudo exportar el inventario. Revisa tu conexión.');
    } finally {
      setExporting(false);
    }
  }, [activeFilters]);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  };

  // ── Paginación ────────────────────────────────────────────────────────────
  const goToNextPage = useCallback(() => {
    if (!nextCursor) return;
    setPagination(prev => ({
      key: prev.key,
      stack: [...prev.stack.slice(0, prev.index + 1), nextCursor],
      index: prev.index + 1,
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [nextCursor]);

  const goToPrevPage = useCallback(() => {
    setPagination(prev => (prev.index === 0 ? prev : { ...prev, index: prev.index - 1 }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // ── Detalle bajo demanda ──────────────────────────────────────────────────
  const detailSeq = useRef(0);

  const handleEdit = useCallback(async (row: Product) => {
    const seq = ++detailSeq.current;
    setEditingProduct(null);
    setDetailError(null);
    setDetailLoading(true);
    setIsModalOpen(true);
    try {
      const detail = await getAdminProductById(row.id);
      if (seq !== detailSeq.current) return;
      if (!detail) {
        setDetailError('El producto ya no existe. Actualiza la lista.');
        return;
      }
      setEditingProduct(detail);
    } catch (err) {
      if (seq !== detailSeq.current) return;
      console.error('[admin/products] error cargando el producto:', err);
      setDetailError('No se pudo cargar el producto. Cierra e intenta de nuevo.');
    } finally {
      if (seq === detailSeq.current) setDetailLoading(false);
    }
  }, []);

  // Al cerrar se liberan el detalle completo (specs, media, descripción) y el
  // estado asociado: no tiene sentido conservarlos montados.
  const handleClose = useCallback(() => {
    detailSeq.current++;
    setEditingProduct(null);
    setDetailLoading(false);
    setDetailError(null);
    setIsModalOpen(false);
  }, []);

  const handleSaved = useCallback(async () => {
    // Sólo se vuelve a consultar la página actual (≤30 filas), no el catálogo.
    const ok = await loadProducts();
    void loadCategories();
    if (!ok) {
      window.alert(
        'El producto se guardó correctamente, pero no se pudo actualizar la lista. Recarga la página.',
      );
    }
  }, [loadProducts, loadCategories]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return;
    const res = await deleteProductAction(id);
    if (!res?.success) {
      window.alert(res?.message ?? 'No se pudo eliminar el producto.');
      return;
    }
    if (res.softDeleted) {
      window.alert(res.message);
    }
    void loadProducts();
  }, [loadProducts]);

  const handleReactivate = useCallback(async (id: string) => {
    const res = await setProductActiveAction(id, true);
    if (!res?.success) {
      window.alert(res?.message ?? 'No se pudo reactivar el producto.');
      return;
    }
    void loadProducts();
  }, [loadProducts]);

  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange  = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csv = ev.target?.result as string;
      startImportTr(async () => {
        // PRD-085: resultado en panel con detalle por fila (antes: alert sin contexto)
        const res = await importProductsFromCSV(csv);
        setImportResult(res);
        if (res.success) { void loadProducts(); void loadCategories(); }
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
    };
    reader.readAsText(file);
  };

  const productsRef = useRef(products);
  productsRef.current = products;
  // El commit se dispara desde onBlur y desde Enter: leer el borrador de una ref
  // (y limpiarla al instante) evita que un doble disparo envíe dos peticiones.
  const inlineEditRef = useRef<InlineEdit | null>(inlineEdit);
  inlineEditRef.current = inlineEdit;

  const startInlineEdit = useCallback((id: string, field: 'stock' | 'price', current: number) => {
    setInlineEdit({ id, field, value: current.toString() });
  }, []);
  const cancelInlineEdit = useCallback(() => {
    inlineEditRef.current = null;
    setInlineEdit(null);
  }, []);

  const commitInlineEdit = useCallback(() => {
    const current = inlineEditRef.current;
    if (!current) return;
    inlineEditRef.current = null;
    setInlineEdit(null);

    const { id, field, value } = current;
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0) return;

    // PRD-086: la tabla solo refleja el nuevo valor si el servidor confirmó el
    // guardado; en error se conserva el valor real y se avisa al operador.
    startInlineTr(async () => {
      const nextValue = field === 'stock' ? Math.floor(parsed) : parsed;
      const res = field === 'stock'
        ? await quickUpdateStockAction(id, nextValue)
        : await quickUpdatePriceAction(id, nextValue);

      if (res.success) {
        setInlineError(null);
        // Actualización puntual de la fila confirmada por el servidor…
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: nextValue } : p));
        // …y resincronización silenciosa de la página actual para que los
        // contadores agregados (bajo/agotados/total) sigan siendo del servidor.
        void loadProducts();
      } else {
        const target = productsRef.current.find(p => p.id === id);
        setInlineError(
          `No se guardó el ${field === 'stock' ? 'stock' : 'precio'}${target ? ` de «${target.name}»` : ''}: ${('message' in res && res.message) || 'error desconocido'}. El valor mostrado es el actual.`,
        );
      }
    });
  }, [loadProducts]);

  const handleInlineKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitInlineEdit();
    if (e.key === 'Escape') cancelInlineEdit();
  }, [commitInlineEdit, cancelInlineEdit]);

  const renderPriceCell = useCallback((p: Product) => {
    const isEditing = inlineEdit?.id === p.id && inlineEdit.field === 'price';
    if (isEditing) {
      return (
        <span className="inline-flex items-center gap-1">
          <span className="text-gray-400">$</span>
          <input
            ref={inlineInputRef}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={inlineEdit.value}
            onChange={e => setInlineEdit(prev => prev ? { ...prev, value: e.target.value } : null)}
            onKeyDown={handleInlineKeyDown}
            onBlur={commitInlineEdit}
            className="w-24 text-right border border-navy/40 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-navy/50 bg-white"
          />
        </span>
      );
    }
    return (
      <button type="button"
        onDoubleClick={() => startInlineEdit(p.id, 'price', p.price)}
        onClick={(e) => { if (window.matchMedia('(hover: none)').matches) { e.preventDefault(); startInlineEdit(p.id, 'price', p.price); } }}
        title="Doble clic (PC) o tap (celular) para editar"
        className="font-semibold text-green-700 tabular-nums text-sm"
      >
        ${p.price.toFixed(2)}
      </button>
    );
  }, [inlineEdit, handleInlineKeyDown, commitInlineEdit, startInlineEdit]);

  const renderStockCell = useCallback((p: Product) => {
    const isEditing = inlineEdit?.id === p.id && inlineEdit.field === 'stock';
    if (isEditing) {
      return (
        <span className="inline-flex items-center gap-1">
          <input
            ref={inlineInputRef}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={inlineEdit.value}
            onChange={e => setInlineEdit(prev => prev ? { ...prev, value: e.target.value } : null)}
            onKeyDown={handleInlineKeyDown}
            onBlur={commitInlineEdit}
            className="w-16 text-right border border-navy/40 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-navy/50 bg-white"
          />
          <button type="button" onClick={commitInlineEdit} disabled={savingInline} className="text-green-600"><Check size={14} /></button>
          <button type="button" onClick={cancelInlineEdit} className="text-gray-400"><X size={14} /></button>
        </span>
      );
    }
    return (
      <button type="button"
        onDoubleClick={() => startInlineEdit(p.id, 'stock', p.stock)}
        onClick={(e) => { if (window.matchMedia('(hover: none)').matches) { e.preventDefault(); startInlineEdit(p.id, 'stock', p.stock); } }}
        title="Doble clic (PC) o tap (celular) para editar"
      >
        <StockBadge stock={p.stock} />
      </button>
    );
  }, [inlineEdit, savingInline, handleInlineKeyDown, commitInlineEdit, cancelInlineEdit, startInlineEdit]);

  const columns: DataTableColumn<Product>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Producto',
      primary: true,
      cell: p => (
        <span className="block truncate">
          {p.name}
          {p.brand && <span className="text-gray-500 font-normal text-xs ml-1">· {p.brand}</span>}
          {p.isActive === false && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600 align-middle">
              Despublicado
            </span>
          )}
          <span
            className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border align-middle ${
              p.freeShipping
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-slate-600 bg-slate-50 border-slate-200'
            }`}
          >
            {p.freeShipping ? 'Elegible: envío gratis por MRW' : 'Cobro a destino'}
          </span>
        </span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      mobileLabel: 'SKU',
      cell: p => p.sku
        ? <span className="font-mono text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{p.sku}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      key: 'category',
      header: 'Categoría',
      mobileLabel: 'Categoría',
      cell: p => <span className="text-sm text-gray-600 truncate">{p.category}</span>,
    },
    {
      key: 'price',
      header: 'Precio',
      mobileLabel: 'Precio',
      align: 'right',
      cell: renderPriceCell,
    },
    {
      key: 'stock',
      header: 'Stock',
      mobileLabel: 'Stock',
      align: 'right',
      cell: renderStockCell,
    },
  ], [renderPriceCell, renderStockCell]);

  const rowKey = useCallback((p: Product) => p.id, []);
  const rowAccent = useCallback(
    (p: Product) => (p.stock === 0 ? 'danger' as const : p.stock < LOW_STOCK_THRESHOLD ? 'warning' as const : 'default' as const),
    [],
  );
  const mobileLeading = useCallback((p: Product) => (
    <div className="w-12 h-12 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0">
      <Image
        src={p.image || '/placeholder-product.png'}
        alt={p.name}
        width={48}
        height={48}
        className="object-cover w-full h-full"
      />
    </div>
  ), []);
  const rowActions = useCallback((p: Product) => (
    <>
      {p.isActive === false && (
        <TouchIconButton
          variant="primary"
          label="Reactivar"
          icon={<RotateCcw size={18} />}
          onClick={() => handleReactivate(p.id)}
        />
      )}
      <TouchIconButton
        variant="primary"
        label="Editar"
        icon={<Edit size={18} />}
        onClick={() => { void handleEdit(p); }}
      />
      <TouchIconButton
        variant="danger"
        label="Eliminar"
        icon={<Trash2 size={18} />}
        onClick={() => handleDelete(p.id, p.name)}
      />
    </>
  ), [handleReactivate, handleEdit, handleDelete]);

  const firstOnPage = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const lastOnPage  = pageIndex * PAGE_SIZE + products.length;
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".csv" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-navy">Inventario</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {total} productos
            {lowStockCount > 0 && <span className="ml-2 text-orange-600 font-semibold">· {lowStockCount} bajo</span>}
            {outCount > 0 && <span className="ml-2 text-red-600 font-semibold">· {outCount} agotados</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { void handleExportCsv(); }}
            disabled={total === 0 || exporting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[44px] px-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100 disabled:opacity-40"
            title="Exportar el inventario filtrado completo a CSV"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting ? 'Exportando…' : 'Exportar'}
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isImporting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[44px] px-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100 disabled:opacity-50"
          >
            <Upload size={16} /> {isImporting ? 'Importando…' : 'Importar'}
          </button>
          <button
            type="button"
            onClick={() => { setEditingProduct(null); setDetailError(null); setIsModalOpen(true); }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[44px] px-4 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase tracking-wide rounded-xl active:bg-yellow-300"
          >
            <PlusCircle size={16} /> Nuevo
          </button>
        </div>
      </div>

      {/* Búsqueda + filtros */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            type="search"
            placeholder="Buscar nombre, SKU o marca…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="flex-1 text-base sm:text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
          {refreshing && <Loader2 size={14} className="text-gray-400 animate-spin flex-shrink-0" aria-hidden />}
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            aria-label="Mostrar filtros"
            className={`min-w-[40px] min-h-[40px] inline-flex items-center justify-center gap-1 text-xs px-2 rounded-lg border ${showFilters ? 'bg-navy text-white border-navy' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
          >
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        </div>

        {showFilters && (
          <div className="px-3 py-3 space-y-3 bg-gray-50 border-b border-gray-100">
            <div className="flex flex-wrap gap-1.5">
              {STOCK_FILTERS.map(f => (
                <button type="button"
                  key={f}
                  onClick={() => setStockFilter(f)}
                  className={`min-h-[36px] px-3 rounded-full text-xs font-semibold border transition ${
                    stockFilter === f
                      ? f === 'out'   ? 'bg-red-600 text-white border-red-600'
                      : f === 'low'   ? 'bg-orange-500 text-white border-orange-500'
                      :                 'bg-navy text-white border-navy'
                      : 'bg-white text-gray-600 border-gray-200 active:bg-gray-100'
                  }`}
                >
                  {f === 'all' ? 'Todo' : f === 'low' ? `Bajo stock` : 'Agotados'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map(s => (
                <button type="button"
                  key={s.id}
                  onClick={() => setStatusFilter(s.id)}
                  className={`min-h-[36px] px-3 rounded-full text-xs font-semibold border transition ${
                    statusFilter === s.id
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white text-gray-600 border-gray-200 active:bg-gray-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={categoryFilter}
                onChange={e => setParam('category', e.target.value)}
                className="text-base sm:text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none min-h-[40px]"
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1">
                <span className="font-medium ml-1">Precio</span>
                <input
                  type="number" min="0" placeholder="Min" inputMode="numeric"
                  value={minPrice} onChange={e => setMinPrice(e.target.value)}
                  className="w-16 px-1.5 py-1.5 border-0 outline-none text-base sm:text-sm"
                />
                <span>–</span>
                <input
                  type="number" min="0" placeholder="Max" inputMode="numeric"
                  value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
                  className="w-16 px-1.5 py-1.5 border-0 outline-none text-base sm:text-sm"
                />
                <span className="text-gray-400">USD</span>
                {(minPrice || maxPrice) && (
                  <button type="button"
                    onClick={() => {
                      setMinPrice('');
                      setMaxPrice('');
                      const params = new URLSearchParams(searchParams);
                      params.delete('minPrice');
                      params.delete('maxPrice');
                      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
                    }}
                    className="text-gray-400 px-1"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PRD-085: resultado del import con detalle por fila */}
      {importResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          importResult.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">{importResult.message}</p>
            <button
              type="button"
              onClick={() => setImportResult(null)}
              aria-label="Cerrar resultado de importación"
              className="flex-shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full active:bg-black/10"
            >
              <X size={14} />
            </button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 max-h-48 overflow-y-auto space-y-1 text-[12px] font-mono list-disc list-inside">
              {importResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* PRD-086: error de edición inline (el valor en tabla sigue siendo el real) */}
      {inlineError && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{inlineError}</p>
          <button
            type="button"
            onClick={() => setInlineError(null)}
            aria-label="Cerrar aviso"
            className="flex-shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full active:bg-black/10"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loadError && (
        <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          No se pudo cargar el inventario. Revisa tu conexión y recarga la página.
        </div>
      )}

      <DataTable<Product>
        data={products}
        columns={columns}
        rowKey={rowKey}
        loading={loading}
        refreshing={refreshing}
        emptyState="No se encontraron productos con los filtros actuales."
        rowAccent={rowAccent}
        mobileLeading={mobileLeading}
        actions={rowActions}
      />

      {/* Navegación entre páginas — misma disposición en móvil y escritorio */}
      {(total > 0 || pageIndex > 0) && (
        <nav
          aria-label="Paginación del inventario"
          className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-2"
        >
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={pageIndex === 0 || refreshing}
            aria-label="Página anterior"
            className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 active:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <p className="text-[11px] sm:text-xs text-gray-600 text-center tabular-nums" aria-live="polite">
            <span className="font-semibold text-navy">{firstOnPage}–{lastOnPage}</span>
            <span className="mx-1">de</span>
            <span className="font-semibold text-navy">{total}</span>
            <span className="block sm:inline sm:ml-2 text-gray-400">
              Página {pageIndex + 1} de {totalPages}
            </span>
          </p>

          <button
            type="button"
            onClick={goToNextPage}
            disabled={!nextCursor || refreshing}
            aria-label="Página siguiente"
            className="min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 active:bg-gray-100 disabled:opacity-40"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight size={16} />
          </button>
        </nav>
      )}

      <p className="text-[11px] text-gray-600 text-center pt-2">
        Toca el precio o stock para editar rápido. Doble clic en escritorio.
      </p>

      <AddProductModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onSaved={handleSaved}
        product={editingProduct}
        detailLoading={detailLoading}
        detailError={detailError}
        categories={categories}
      />
    </div>
  );
}

function ProductsLoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1.5">
          <div className="h-5 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 w-16 bg-gray-200 rounded-xl" />
          <div className="h-11 w-20 bg-gray-200 rounded-xl" />
        </div>
      </div>
      <div className="h-12 bg-gray-200 rounded-xl" />
      <div className="h-64 bg-gray-200 rounded-2xl" />
    </div>
  );
}

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<ProductsLoadingSkeleton />}>
      <AdminProductsContent />
    </Suspense>
  );
}
