'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_HOMEPAGE_SHELVES,
  HOME_SHELF_KEYS,
  MAX_CATEGORY_SHELVES,
  type HomeCategoryShelf,
  type HomeShelfKey,
  type HomepageShelvesConfig,
} from '@/lib/homepage-config';

type AdminProductHit = {
  id: string;
  sku: string | null;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
  image: string;
};

type AdminCategoryHit = {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
};

const SHELF_LABELS: Record<HomeShelfKey, string> = {
  offers: 'Ofertas',
  newest: 'Recién llegados',
  featured: 'Destacados',
};

function shelvesEqual(
  a: HomepageShelvesConfig,
  b: HomepageShelvesConfig,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateShelves(config: HomepageShelvesConfig): string | null {
  for (const key of HOME_SHELF_KEYS) {
    const title = config.shelves[key].title.trim();
    if (!title) return `El título de «${SHELF_LABELS[key]}» no puede estar vacío.`;
    if (title.length > 80) return `El título de «${SHELF_LABELS[key]}» supera 80 caracteres.`;
    if (config.shelves[key].badge.length > 40) {
      return `El badge de «${SHELF_LABELS[key]}» supera 40 caracteres.`;
    }
    if (config.shelves[key].subtitle.length > 160) {
      return `El subtítulo de «${SHELF_LABELS[key]}» supera 160 caracteres.`;
    }
  }
  if (config.featuredProductIds.length > 8) {
    return 'Máximo 8 productos destacados.';
  }
  const seen = new Set<string>();
  for (const id of config.featuredProductIds) {
    if (seen.has(id)) return 'Hay productos destacados duplicados.';
    seen.add(id);
  }
  if (config.categoryShelves.length > MAX_CATEGORY_SHELVES) {
    return `Máximo ${MAX_CATEGORY_SHELVES} estanterías por categoría.`;
  }
  const seenCats = new Set<string>();
  for (const shelf of config.categoryShelves) {
    if (!shelf.title.trim()) {
      return 'Cada estantería de categoría necesita un título.';
    }
    if (shelf.title.length > 80) {
      return 'El título de una estantería de categoría supera 80 caracteres.';
    }
    if (shelf.badge.length > 40) {
      return 'El badge de una estantería de categoría supera 40 caracteres.';
    }
    if (shelf.subtitle.length > 160) {
      return 'El subtítulo de una estantería de categoría supera 160 caracteres.';
    }
    if (seenCats.has(shelf.categoryId)) {
      return 'Hay categorías duplicadas en las estanterías.';
    }
    seenCats.add(shelf.categoryId);
  }
  const orderSeen = new Set<HomeShelfKey>();
  for (const key of config.order) {
    if (orderSeen.has(key)) return 'El orden de estanterías tiene claves duplicadas.';
    orderSeen.add(key);
  }
  return null;
}

function cloneShelves(config: HomepageShelvesConfig): HomepageShelvesConfig {
  const cloned = structuredClone(config);
  if (!Array.isArray(cloned.categoryShelves)) {
    cloned.categoryShelves = [];
  }
  return cloned;
}

export default function ShelvesEditor({
  initial,
  loading,
  onSaved,
}: {
  initial: HomepageShelvesConfig | null;
  loading: boolean;
  onSaved?: (config: HomepageShelvesConfig) => void;
}) {
  const [draft, setDraft] = useState<HomepageShelvesConfig>(() =>
    cloneShelves(initial ?? DEFAULT_HOMEPAGE_SHELVES),
  );
  const [saved, setSaved] = useState<HomepageShelvesConfig>(() =>
    cloneShelves(initial ?? DEFAULT_HOMEPAGE_SHELVES),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<AdminProductHit[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<AdminProductHit[]>([]);

  const [categories, setCategories] = useState<AdminCategoryHit[]>([]);
  const [categoryQuery, setCategoryQuery] = useState('');

  useEffect(() => {
    if (!initial) return;
    setDraft(cloneShelves(initial));
    setSaved(cloneShelves(initial));
  }, [initial]);

  const dirty = useMemo(() => !shelvesEqual(draft, saved), [draft, saved]);

  const loadSelectedDetails = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setSelectedDetails([]);
      return;
    }
    try {
      const r = await fetch(
        `/api/admin/products/search?ids=${encodeURIComponent(ids.join(','))}`,
      );
      const d = await r.json();
      setSelectedDetails(Array.isArray(d.products) ? d.products : []);
    } catch {
      setSelectedDetails([]);
    }
  }, []);

  useEffect(() => {
    void loadSelectedDetails(draft.featuredProductIds);
  }, [draft.featuredProductIds, loadSelectedDetails]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/categories');
        const d = await r.json();
        if (!cancelled) {
          setCategories(Array.isArray(d) ? d : []);
        }
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(
          `/api/admin/products/search?q=${encodeURIComponent(query.trim())}&limit=12`,
        );
        const d = await r.json();
        setHits(Array.isArray(d.products) ? d.products : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(handle);
  }, [query]);

  const moveShelf = (key: HomeShelfKey, direction: -1 | 1) => {
    setDraft((prev) => {
      const order = [...prev.order];
      const idx = order.indexOf(key);
      const next = idx + direction;
      if (idx < 0 || next < 0 || next >= order.length) return prev;
      [order[idx], order[next]] = [order[next]!, order[idx]!];
      return { ...prev, order };
    });
    setStatus('idle');
    setStatusMsg('');
  };

  const updateShelf = (
    key: HomeShelfKey,
    patch: Partial<HomepageShelvesConfig['shelves'][HomeShelfKey]>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      shelves: {
        ...prev.shelves,
        [key]: { ...prev.shelves[key], ...patch },
      },
    }));
    setStatus('idle');
    setStatusMsg('');
  };

  const moveFeatured = (id: string, direction: -1 | 1) => {
    setDraft((prev) => {
      const ids = [...prev.featuredProductIds];
      const idx = ids.indexOf(id);
      const next = idx + direction;
      if (idx < 0 || next < 0 || next >= ids.length) return prev;
      [ids[idx], ids[next]] = [ids[next]!, ids[idx]!];
      return { ...prev, featuredProductIds: ids };
    });
    setStatus('idle');
  };

  const addFeatured = (product: AdminProductHit) => {
    if (!product.isActive) return;
    setDraft((prev) => {
      if (prev.featuredProductIds.includes(product.id)) return prev;
      if (prev.featuredProductIds.length >= 8) return prev;
      return {
        ...prev,
        featuredProductIds: [...prev.featuredProductIds, product.id],
      };
    });
    setStatus('idle');
  };

  const removeFeatured = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      featuredProductIds: prev.featuredProductIds.filter((x) => x !== id),
    }));
    setStatus('idle');
  };

  const addCategoryShelf = (category: AdminCategoryHit) => {
    setDraft((prev) => {
      if (prev.categoryShelves.some((s) => s.categoryId === category.id)) {
        return prev;
      }
      if (prev.categoryShelves.length >= MAX_CATEGORY_SHELVES) return prev;
      const next: HomeCategoryShelf = {
        categoryId: category.id,
        enabled: true,
        title: category.name,
        badge: category.name,
        subtitle: '',
      };
      return {
        ...prev,
        categoryShelves: [...prev.categoryShelves, next],
      };
    });
    setStatus('idle');
    setStatusMsg('');
  };

  const updateCategoryShelf = (
    categoryId: string,
    patch: Partial<HomeCategoryShelf>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      categoryShelves: prev.categoryShelves.map((shelf) =>
        shelf.categoryId === categoryId ? { ...shelf, ...patch } : shelf,
      ),
    }));
    setStatus('idle');
    setStatusMsg('');
  };

  const moveCategoryShelf = (categoryId: string, direction: -1 | 1) => {
    setDraft((prev) => {
      const shelves = [...prev.categoryShelves];
      const idx = shelves.findIndex((s) => s.categoryId === categoryId);
      const next = idx + direction;
      if (idx < 0 || next < 0 || next >= shelves.length) return prev;
      [shelves[idx], shelves[next]] = [shelves[next]!, shelves[idx]!];
      return { ...prev, categoryShelves: shelves };
    });
    setStatus('idle');
  };

  const removeCategoryShelf = (categoryId: string) => {
    setDraft((prev) => ({
      ...prev,
      categoryShelves: prev.categoryShelves.filter(
        (s) => s.categoryId !== categoryId,
      ),
    }));
    setStatus('idle');
  };

  const availableCategories = useMemo(() => {
    const selected = new Set(draft.categoryShelves.map((s) => s.categoryId));
    const q = categoryQuery.trim().toLowerCase();
    return categories.filter((c) => {
      if (selected.has(c.id)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
    });
  }, [categories, categoryQuery, draft.categoryShelves]);

  const save = async () => {
    const error = validateShelves(draft);
    setInlineError(error);
    if (error) {
      setStatus('error');
      setStatusMsg(error);
      return;
    }

    setSaving(true);
    setStatus('idle');
    setStatusMsg('');
    try {
      const r = await fetch('/api/config/homepage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'homepage_shelves', value: draft }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setStatus('error');
        setStatusMsg(d.error ?? 'Error al guardar.');
        return;
      }
      const snapshot = cloneShelves(draft);
      setDraft(cloneShelves(snapshot));
      setSaved(cloneShelves(snapshot));
      onSaved?.(cloneShelves(snapshot));
      setStatus('saved');
      setStatusMsg('Estanterías guardadas correctamente.');
    } catch {
      setStatus('error');
      setStatusMsg('Error de red al guardar.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start gap-3 mb-1 bg-purple-50 border border-purple-100 rounded-xl p-4">
        <Sparkles size={18} className="text-purple-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-purple-800">Estanterías de productos</p>
          <p className="text-xs text-purple-600 mt-0.5">
            Activa, reordena y edita Ofertas, Recién llegados y Destacados.
            También puedes elegir categorías para mostrar sus productos como
            estanterías en el home. Ofertas, Recién llegados y Destacados
            muestran hasta 8 productos; las estanterías de categoría muestran
            hasta 18.
          </p>
        </div>
      </div>

      {draft.order.map((key, index) => {
        const shelf = draft.shelves[key];
        return (
          <div key={key} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-black text-navy">
                  {index + 1}. {SHELF_LABELS[key]}
                </p>
                <p className="text-[11px] text-gray-500">Orden #{index + 1}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveShelf(key, -1)}
                  disabled={index === 0}
                  aria-label={`Subir estantería ${SHELF_LABELS[key]}`}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => moveShelf(key, 1)}
                  disabled={index === draft.order.length - 1}
                  aria-label={`Bajar estantería ${SHELF_LABELS[key]}`}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shelf.enabled}
                  aria-label={`${shelf.enabled ? 'Desactivar' : 'Activar'} estantería ${SHELF_LABELS[key]}`}
                  onClick={() => updateShelf(key, { enabled: !shelf.enabled })}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold ${
                    shelf.enabled
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {shelf.enabled ? 'Activa' : 'Inactiva'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor={`shelf-title-${key}`}
                  className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
                >
                  Título
                </label>
                <input
                  id={`shelf-title-${key}`}
                  type="text"
                  maxLength={80}
                  value={shelf.title}
                  onChange={(e) => updateShelf(key, { title: e.target.value })}
                  aria-invalid={!shelf.title.trim()}
                  aria-describedby={
                    !shelf.title.trim() ? `shelf-title-error-${key}` : undefined
                  }
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
                {!shelf.title.trim() ? (
                  <p
                    id={`shelf-title-error-${key}`}
                    className="text-xs text-red-600 mt-1"
                  >
                    El título es obligatorio.
                  </p>
                ) : null}
              </div>
              <div>
                <label
                  htmlFor={`shelf-badge-${key}`}
                  className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
                >
                  Badge
                </label>
                <input
                  id={`shelf-badge-${key}`}
                  type="text"
                  maxLength={40}
                  value={shelf.badge}
                  onChange={(e) => updateShelf(key, { badge: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
              </div>
              <div>
                <label
                  htmlFor={`shelf-subtitle-${key}`}
                  className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
                >
                  Subtítulo
                </label>
                <input
                  id={`shelf-subtitle-${key}`}
                  type="text"
                  maxLength={160}
                  value={shelf.subtitle}
                  onChange={(e) =>
                    updateShelf(key, { subtitle: e.target.value })
                  }
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
              </div>
            </div>
          </div>
        );
      })}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-navy">
              Estanterías por categoría
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {draft.categoryShelves.length} de {MAX_CATEGORY_SHELVES}{' '}
              seleccionadas. Cada una aparece en el home como Novedades, con
              los productos de esa categoría.
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="category-shelf-search"
            className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
          >
            Buscar categoría
          </label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <input
              id="category-shelf-search"
              type="search"
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
              placeholder="Ej. cocina, gadgets…"
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
          </div>
          {availableCategories.length > 0 ? (
            <ul className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {availableCategories.slice(0, 12).map((cat) => {
                const disabled =
                  draft.categoryShelves.length >= MAX_CATEGORY_SHELVES;
                return (
                  <li
                    key={cat.id}
                    className="flex items-center gap-3 p-2.5 bg-white"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy truncate">
                        {cat.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {typeof cat.productCount === 'number'
                          ? `${cat.productCount} productos`
                          : `/${cat.slug}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => addCategoryShelf(cat)}
                      className="min-h-[44px] px-3 rounded-lg text-xs font-bold bg-navy text-white disabled:opacity-40"
                    >
                      Agregar
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : categoryQuery.trim() ? (
            <p className="text-xs text-gray-500 mt-2">
              No hay categorías disponibles con ese nombre.
            </p>
          ) : null}
        </div>

        {draft.categoryShelves.length > 0 ? (
          <ul className="space-y-3" data-testid="category-shelves-list">
            {draft.categoryShelves.map((shelf, index) => {
              const category = categories.find((c) => c.id === shelf.categoryId);
              const label = category?.name ?? 'Categoría no disponible';
              return (
                <li
                  key={shelf.categoryId}
                  className="border border-gray-100 rounded-xl p-3 space-y-3"
                  data-testid={`category-shelf-${shelf.categoryId}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-400 w-5 text-center">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy truncate">
                        {label}
                      </p>
                      {category ? (
                        <p className="text-[11px] text-gray-500">
                          {typeof category.productCount === 'number'
                            ? `${category.productCount} productos · `
                            : ''}
                          /categoria/{category.slug}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-500">
                          Ya no existe en el catálogo (oculta en home)
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shelf.enabled}
                      aria-label={`${shelf.enabled ? 'Desactivar' : 'Activar'} estantería ${label}`}
                      onClick={() =>
                        updateCategoryShelf(shelf.categoryId, {
                          enabled: !shelf.enabled,
                        })
                      }
                      className={`min-h-[44px] px-3 rounded-lg text-xs font-bold ${
                        shelf.enabled
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {shelf.enabled ? 'Activa' : 'Inactiva'}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategoryShelf(shelf.categoryId, -1)}
                      disabled={index === 0}
                      aria-label={`Subir estantería ${label}`}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategoryShelf(shelf.categoryId, 1)}
                      disabled={index === draft.categoryShelves.length - 1}
                      aria-label={`Bajar estantería ${label}`}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCategoryShelf(shelf.categoryId)}
                      aria-label={`Quitar estantería ${label}`}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-red-100 text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`cat-shelf-title-${shelf.categoryId}`}
                        className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
                      >
                        Título
                      </label>
                      <input
                        id={`cat-shelf-title-${shelf.categoryId}`}
                        type="text"
                        maxLength={80}
                        value={shelf.title}
                        onChange={(e) =>
                          updateCategoryShelf(shelf.categoryId, {
                            title: e.target.value,
                          })
                        }
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`cat-shelf-badge-${shelf.categoryId}`}
                        className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
                      >
                        Badge
                      </label>
                      <input
                        id={`cat-shelf-badge-${shelf.categoryId}`}
                        type="text"
                        maxLength={40}
                        value={shelf.badge}
                        onChange={(e) =>
                          updateCategoryShelf(shelf.categoryId, {
                            badge: e.target.value,
                          })
                        }
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`cat-shelf-subtitle-${shelf.categoryId}`}
                        className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
                      >
                        Subtítulo
                      </label>
                      <input
                        id={`cat-shelf-subtitle-${shelf.categoryId}`}
                        type="text"
                        maxLength={160}
                        value={shelf.subtitle}
                        onChange={(e) =>
                          updateCategoryShelf(shelf.categoryId, {
                            subtitle: e.target.value,
                          })
                        }
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">
            Aún no hay categorías seleccionadas. Elige una para que sus
            productos aparezcan en el home.
          </p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black text-navy">Productos destacados</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {draft.featuredProductIds.length} de 8 seleccionados
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="featured-search"
            className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
          >
            Buscar por nombre, SKU o ID
          </label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <input
              id="featured-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej. auriculares o SKU…"
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
          </div>
          {searching ? (
            <p className="text-xs text-gray-400 mt-2">Buscando…</p>
          ) : null}
          {hits.length > 0 ? (
            <ul className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {hits.map((hit) => {
                const selected = draft.featuredProductIds.includes(hit.id);
                const disabled =
                  !hit.isActive ||
                  selected ||
                  draft.featuredProductIds.length >= 8;
                return (
                  <li
                    key={hit.id}
                    className="flex items-center gap-3 p-2.5 bg-white"
                  >
                    <div className="relative h-11 w-11 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
                      {hit.image ? (
                        <Image
                          src={hit.image}
                          alt=""
                          fill
                          className="object-contain p-1"
                          sizes="44px"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy truncate">
                        {hit.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        ${hit.price.toFixed(2)} · Stock {hit.stock}
                        {!hit.isActive ? ' · Inactivo' : ''}
                        {hit.sku ? ` · ${hit.sku}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => addFeatured(hit)}
                      className="min-h-[44px] px-3 rounded-lg text-xs font-bold bg-navy text-white disabled:opacity-40"
                    >
                      {selected ? 'Ya está' : 'Agregar'}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {draft.featuredProductIds.length > 0 ? (
          <ul className="space-y-2" data-testid="featured-selected-list">
            {draft.featuredProductIds.map((id, index) => {
              const product = selectedDetails.find((p) => p.id === id);
              const label = product?.name ?? 'Producto no disponible';
              const truncatedId =
                id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 border border-gray-100 rounded-xl p-2"
                  data-testid={`featured-selected-${id}`}
                >
                  <span className="text-xs font-bold text-gray-400 w-5 text-center">
                    {index + 1}
                  </span>
                  <div className="relative h-10 w-10 flex-shrink-0 rounded-lg overflow-hidden bg-gray-50">
                    {product?.image ? (
                      <Image
                        src={product.image}
                        alt=""
                        fill
                        className="object-contain p-1"
                        sizes="40px"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {product ? (
                      <>
                        <p className="text-sm font-semibold text-navy truncate">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          Stock {product.stock}
                          {!product.isActive
                            ? ' · Inactivo (oculto en home)'
                            : ''}
                          {product.stock <= 0
                            ? ' · Agotado (oculto en home)'
                            : ''}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-navy truncate">
                          Producto no disponible
                        </p>
                        <p className="text-[11px] text-gray-500 font-mono truncate">
                          {truncatedId}
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => moveFeatured(id, -1)}
                    disabled={index === 0}
                    aria-label={`Subir producto ${label}`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFeatured(id, 1)}
                    disabled={index === draft.featuredProductIds.length - 1}
                    aria-label={`Bajar producto ${label}`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFeatured(id)}
                    aria-label={`Quitar producto ${label}`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-red-100 text-red-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">
            Aún no hay productos destacados seleccionados.
          </p>
        )}
      </div>

      {inlineError ? (
        <p className="text-sm font-semibold text-red-600" role="alert">
          {inlineError}
        </p>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-3"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="flex items-center gap-2 bg-navy text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-navy/90 disabled:opacity-50 transition-colors min-h-[44px]"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          Guardar estanterías
        </button>
        {dirty ? (
          <span className="text-xs font-semibold text-amber-700">
            Cambios sin guardar
          </span>
        ) : null}
        {status === 'saved' ? (
          <span className="text-sm font-semibold text-green-600">{statusMsg}</span>
        ) : null}
        {status === 'error' ? (
          <span className="text-sm font-semibold text-red-600 flex items-center gap-1">
            <X size={14} /> {statusMsg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
