'use client'
import { useTransition, useRef, useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createProductAction, updateProductAction } from '@/app/actions/productActions';
import { calcSellingPriceUsd, roundUpToStep, DEFAULT_PROFIT_MARGIN_PCT, DEFAULT_BCV_BINANCE_FACTOR } from '@/lib/pricing-formula';
import { getPricingParams, getMarginPresets, updateMarginPresets } from '@/app/actions/configActions';
import { X, GripVertical, ImagePlus, Star, Camera, Plus, Trash2, Video, Play, ChevronDown, Loader2, AlertCircle, Check } from 'lucide-react';
import { deriveLegacyImagesFromSlots, type ProductGalleryItem } from '@/lib/product-media';
import { parseProductSpecs, type ProductSpec } from '@/lib/definitions';
import {
  completedUrlsInOrder,
  uploadProductImages,
  UPLOAD_CONCURRENCY,
  type UploadItemState,
} from '@/lib/products/upload-product-images';

import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/**
 * Detalle admin del producto. Compatible estructuralmente con
 * `AdminProductDetail` (app/actions/productActions.ts), que es lo que devuelve
 * `getAdminProductById(id)`. `brand` y `description` son nullable en la BD.
 */
interface Product {
  id:          string;
  name:        string;
  category:    string;
  price:       number;
  originalPrice?: number | null;
  cost?:        number | null;
  profitMarginPct?: number | null;
  stock:       number;
  images:      string[];
  brand:       string | null;
  description: string | null;
  sku?:        string | null;
  /** Elegible para envío gratis exclusivamente por MRW (no implica ZOOM/TEALCA gratis). */
  freeShipping?: boolean;
  specs?:      unknown | null;
  media?:      {
    id:         string;
    type:       'IMAGE' | 'VIDEO';
    url:        string;
    posterUrl:  string | null;
    sortOrder:  number;
  }[];
}

type ImageGallerySlot = { type: 'IMAGE'; url: string };
type VideoGallerySlot = {
  type: 'VIDEO';
  url: string;
  posterUrl?: string;
  jobId?: string;
  status?: 'processing' | 'ready' | 'failed';
  error?: string;
};
type GallerySlot = ImageGallerySlot | VideoGallerySlot;

interface AddProductModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  /** Recarga listas tras un guardado exitoso (productos + categorías). */
  onSaved?:    () => void | Promise<void>;
  /**
   * Detalle COMPLETO del producto a editar, o null al crear.
   *
   * El listado ya no lo trae: se pide con `getAdminProductById(id)` al pulsar
   * «Editar». Mientras llega, el modal se abre con `detailLoading` en true y
   * muestra un esqueleto sobre el formulario en lugar de congelar la interfaz.
   */
  product:     Product | null;
  /** true mientras se está cargando el detalle del producto a editar. */
  detailLoading?: boolean;
  /** Mensaje si el detalle no se pudo cargar. */
  detailError?: string | null;
  categories:  string[];
}

const MAX_SLOTS = 6;
const MAX_VIDEO_BYTES = 95 * 1024 * 1024;

const inputCls = "appearance-none border border-gray-200 bg-gray-50 w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-1 focus:ring-navy/30 focus:border-navy rounded-md";
const labelCls = "block text-gray-700 text-sm font-bold mb-1";

function normalizeCategoryLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function CategoryCombobox({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-listbox`;
  const query = normalizeCategoryLabel(value).toLowerCase();
  const filtered = query
    ? options.filter((c) => c.toLowerCase().includes(query))
    : options;
  const exactMatch = options.some(
    (c) => normalizeCategoryLabel(c).toLowerCase() === query,
  );
  const willCreate = normalizeCategoryLabel(value).length > 0 && !exactMatch;

  useEffect(() => {
    const onDocDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        list={undefined}
        name="category"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required
        value={value}
        placeholder="Selecciona una existente o escribe una nueva"
        className={`${inputCls} pr-9`}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Mostrar lista"
        onClick={() => setOpen((prev) => !prev)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-gray-500"
      >
        <ChevronDown size={16} aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          data-testid="category-options"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((c) => (
            <li key={c} role="option" aria-selected={normalizeCategoryLabel(c).toLowerCase() === query}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-navy/5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
              >
                {c}
              </button>
            </li>
          ))}
          {willCreate ? (
            <li role="option" aria-selected>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(normalizeCategoryLabel(value));
                }}
              >
                Crear «{normalizeCategoryLabel(value)}»
              </button>
            </li>
          ) : null}
          {filtered.length === 0 && !willCreate ? (
            <li className="px-3 py-2 text-sm text-gray-400">
              No hay categorías. Escribe un nombre para crear una.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

type SessionVideo = { url: string; posterUrl?: string };

function deleteOrphanVideo(url: string, posterUrl?: string, keepalive = false): void {
  void fetch('/api/upload-video', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, posterUrl }),
    keepalive,
  });
}

/**
 * Estado individual de cada imagen de una selección múltiple.
 *
 * Sustituye al `alert()` que interrumpía toda la operación: aquí se ve qué
 * imagen está procesándose, cuál ya subió y cuál falló y por qué, sin que un
 * fallo borre las que sí funcionaron.
 */
function UploadProgressList({
  items,
  busy,
  onDismiss,
}: {
  items: UploadItemState[];
  busy: boolean;
  onDismiss: () => void;
}) {
  if (items.length === 0) return null;

  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-semibold text-gray-600">
          {busy
            ? `Subiendo imágenes… ${done}/${items.length}`
            : failed > 0
              ? `${done} de ${items.length} subidas · ${failed} con error`
              : `${done} de ${items.length} subidas`}
        </p>
        {!busy && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Ocultar detalle de subida"
            className="w-7 h-7 inline-flex items-center justify-center rounded-full active:bg-black/10 text-gray-400"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={`${item.index}-${item.name}`} className="flex items-start gap-2 text-[11px]">
            <span className="mt-0.5 flex-shrink-0">
              {item.status === 'done' && <Check size={12} className="text-green-600" />}
              {item.status === 'error' && <AlertCircle size={12} className="text-red-600" />}
              {(item.status === 'processing' || item.status === 'uploading') && (
                <Loader2 size={12} className="text-navy animate-spin" />
              )}
              {item.status === 'pending' && <span className="block w-3 h-3 rounded-full bg-gray-300" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-gray-700">{item.name}</span>
              {item.status === 'processing' && <span className="text-gray-500">Optimizando…</span>}
              {item.status === 'uploading' && <span className="text-gray-500">Subiendo…</span>}
              {item.status === 'error' && (
                <span className="text-red-600">{item.error ?? 'No se pudo subir.'}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AddProductModal({ isOpen, onClose, onSaved, product, detailLoading = false, detailError = null, categories }: AddProductModalProps) {
  const [isPending, startTransition] = useTransition();
  const formRef        = useRef<HTMLFormElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoInputRef  = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<GallerySlot[]>([]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const originalProductVideoUrlsRef = useRef<Set<string>>(new Set());
  const sessionUploadedVideosRef = useRef<SessionVideo[]>([]);
  const [serverUploading, setServerUploading] = useState(false);
  /** Estado individual de cada imagen de la última selección múltiple. */
  const [uploadItems, setUploadItems] = useState<UploadItemState[]>([]);
  const [specs, setSpecs] = useState<ProductSpec[]>([]);
  const [cost, setCost] = useState('');
  const [marginPct, setMarginPct] = useState('');
  const [presets, setPresets] = useState<number[]>([30, 50, 80, 100]);
  const [presetDraft, setPresetDraft] = useState<string[]>(['30', '50', '80', '100']);
  const [editingPresets, setEditingPresets] = useState(false);
  const [price, setPrice] = useState('');
  const [freeShipping, setFreeShipping] = useState(false);
  const [onSale, setOnSale] = useState(false);
  const [discountMode, setDiscountMode] = useState<'pct' | 'amount'>('pct');
  const [discountPct, setDiscountPct] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [fetchedCategories, setFetchedCategories] = useState<string[]>([]);
  const [pricing, setPricing] = useState({ marginPct: DEFAULT_PROFIT_MARGIN_PCT, factor: DEFAULT_BCV_BINANCE_FACTOR });
  // Scroll lock y focus trap compartidos
  useBodyScrollLock(isOpen);
  // handleClose se define más abajo, pero usamos una ref para pasarlo al hook
  // sin romper el orden de hooks (handleClose necesita slots, slotsRef, etc.)
  const handleCloseRef = useRef<() => void>(() => onClose());
  useFocusTrap({ containerRef: dialogRef, enabled: isOpen, onClose: () => handleCloseRef.current() });

  useEffect(() => {
    if (!isOpen) return;
    getPricingParams().then(setPricing).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/categories');
        const d = await r.json();
        if (cancelled || !Array.isArray(d)) return;
        setFetchedCategories(
          d
            .map((c: { name?: unknown }) =>
              typeof c.name === 'string' ? c.name : '',
            )
            .filter(Boolean),
        );
      } catch {
        if (!cancelled) setFetchedCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    getMarginPresets()
      .then((p) => { setPresets(p); setPresetDraft(p.map(String)); })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    // Al AGREGAR: siempre en blanco. Al EDITAR: el margen guardado del producto.
    setMarginPct(product?.profitMarginPct != null ? String(product.profitMarginPct) : '');
  }, [isOpen, product]);

  useEffect(() => {
    if (!isOpen) return;
    // Al abrir/cambiar de producto se descarta el estado de la subida anterior.
    setUploadItems([]);
  }, [isOpen, product]);

  useEffect(() => {
    if (!formRef.current) return;
    const el = formRef.current.elements as unknown as Record<string, HTMLInputElement | HTMLTextAreaElement>;
    if (product) {
      el.name.value        = product.name;
      el.description.value = product.description ?? '';
      setCost(product.cost != null ? String(product.cost) : '');
      const onOffer = product.originalPrice != null && product.originalPrice > product.price;
      setOnSale(onOffer);
      setDiscountMode('amount');
      setDiscountPct('');
      setPrice(onOffer ? String(product.originalPrice) : String(product.price));
      setSaleAmount(onOffer ? String(product.price) : '');
      // Al editar: refleja el valor guardado. Nunca arrastra el de otro producto
      // (se reinicializa en cada apertura del modal, ver rama `else` abajo).
      setFreeShipping(product.freeShipping ?? false);
      el.stock.value       = product.stock.toString();
      setCategoryInput(product.category);
      el.brand.value       = product.brand ?? '';
      el.sku.value         = product.sku ?? '';
      setSpecs(parseProductSpecs(product.specs));
      originalProductVideoUrlsRef.current = new Set(
        (product.media ?? [])
          .filter((m) => m.type === 'VIDEO')
          .map((m) => m.url),
      );
      sessionUploadedVideosRef.current = [];
      if (product.media && product.media.length > 0) {
        setSlots(
          [...product.media]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((m) => {
              if (m.type === 'VIDEO') {
                return {
                  type: 'VIDEO' as const,
                  url: m.url,
                  posterUrl: m.posterUrl ?? undefined,
                  status: 'ready' as const,
                };
              }
              return { type: 'IMAGE' as const, url: m.url };
            }),
        );
      } else {
        setSlots(product.images.filter(Boolean).map((url) => ({ type: 'IMAGE' as const, url })));
      }
    } else {
      formRef.current.reset();
      setCost('');
      setPrice(''); setOnSale(false); setDiscountMode('pct'); setDiscountPct(''); setSaleAmount('');
      // Al crear: siempre desmarcado.
      setFreeShipping(false);
      setCategoryInput('');
      setSlots([]);
      setSpecs([]);
      originalProductVideoUrlsRef.current = new Set();
      sessionUploadedVideosRef.current = [];
    }
  }, [product, isOpen]);

  // Polling de trabajos de video en procesamiento
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const poll = async () => {
      const processing = slotsRef.current.filter(
        (s): s is VideoGallerySlot =>
          s.type === 'VIDEO' && s.status === 'processing' && !!s.jobId,
      );
      if (processing.length === 0) return;

      for (const slot of processing) {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/upload-video/status?jobId=${slot.jobId}`);
          const data = (await res.json()) as {
            status?: string;
            url?: string;
            posterUrl?: string;
            error?: string;
          };
          if (data.status === 'ready') {
            setSlots((prev) =>
              prev.map((s) =>
                s.type === 'VIDEO' && s.jobId === slot.jobId
                  ? {
                      type: 'VIDEO',
                      url: data.url ?? s.url,
                      posterUrl: data.posterUrl ?? s.posterUrl,
                      status: 'ready',
                    }
                  : s,
              ),
            );
          } else if (data.status === 'failed') {
            setSlots((prev) =>
              prev.map((s) =>
                s.type === 'VIDEO' && s.jobId === slot.jobId
                  ? {
                      type: 'VIDEO',
                      url: s.url,
                      posterUrl: s.posterUrl,
                      jobId: s.jobId,
                      status: 'failed',
                      error: data.error ?? 'Error al procesar el video.',
                    }
                  : s,
              ),
            );
          }
        } catch {
          /* reintento en el siguiente intervalo */
        }
      }
    };

    const interval = setInterval(poll, 3000);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOpen]);

  const addImages = useCallback((urls: string[]) => {
    setSlots((prev) => {
      const imageSlots: GallerySlot[] = urls
        .filter((u) => !prev.some((s) => s.url === u))
        .map((url) => ({ type: 'IMAGE' as const, url }));
      const combined = [...prev, ...imageSlots];
      return combined.slice(0, MAX_SLOTS);
    });
  }, []);

  const removeSlot = (idx: number) => {
    const slot = slots[idx];
    setSlots((prev) => prev.filter((_, i) => i !== idx));
    if (slot?.type === 'VIDEO') {
      const isOriginal = originalProductVideoUrlsRef.current.has(slot.url);
      const isSessionUpload = sessionUploadedVideosRef.current.some((v) => v.url === slot.url);
      if (isSessionUpload && !isOriginal) {
        deleteOrphanVideo(slot.url, slot.posterUrl);
        sessionUploadedVideosRef.current = sessionUploadedVideosRef.current.filter(
          (v) => v.url !== slot.url,
        );
      }
    }
  };

  /**
   * Subida de la galería: cada imagen se normaliza y se sube por separado.
   *
   * ANTES: bucle secuencial que subía el File original sin normalizar y hacía
   * `alert` + `break` al primer fallo, cancelando el resto de la selección. Con
   * el límite por archivo del servidor, eso se percibía como «no puedo subir
   * varias fotos si juntas pasan de 5 MB».
   *
   * AHORA: `uploadProductImages` normaliza (HEIC→JPEG, EXIF, reescalado,
   * compresión; GIF intactos), sube con concurrencia limitada y reporta el
   * estado de cada archivo. Un error afecta sólo a esa imagen.
   */
  const uploadFilesViaApi = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const currentSlots = slotsRef.current;
    const remaining = Math.max(0, MAX_SLOTS - currentSlots.length);
    if (remaining === 0) return;

    const selected = Array.from(files);
    const list = selected.slice(0, remaining);
    const skipped = selected.length - list.length;

    const title = formRef.current?.elements.namedItem('name') as HTMLInputElement | null;
    const descriptiveName = title?.value?.trim() || undefined;

    // Base sobre la que se reconstruye la galería en cada progreso: garantiza
    // que las nuevas imágenes queden en el orden en que se seleccionaron aunque
    // terminen de subir desordenadas.
    const baseSlots = currentSlots;

    setUploadItems(
      list.map((file, index) => ({
        index,
        name: file.name || `Imagen ${index + 1}`,
        status: 'pending' as const,
      })),
    );
    setServerUploading(true);

    try {
      const { failed } = await uploadProductImages({
        files: list,
        purpose: 'product',
        descriptiveName,
        concurrency: UPLOAD_CONCURRENCY,
        onProgress: (items) => {
          setUploadItems(items);
          const done = completedUrlsInOrder(items);
          if (done.length === 0) return;
          setSlots(() => {
            const existing = new Set(baseSlots.map((s) => s.url));
            const additions = done
              .filter((url) => !existing.has(url))
              .map((url) => ({ type: 'IMAGE' as const, url }));
            return [...baseSlots, ...additions].slice(0, MAX_SLOTS);
          });
        },
      });

      if (skipped > 0) {
        setUploadItems((prev) => [
          ...prev,
          ...Array.from({ length: skipped }, (_, i) => ({
            index: list.length + i,
            name: selected[list.length + i]?.name ?? 'Imagen',
            status: 'error' as const,
            error: `Se alcanzó el límite de ${MAX_SLOTS} elementos en la galería.`,
          })),
        ]);
      }
      // Los fallos quedan visibles en la lista por archivo; no se usa `alert`
      // para no bloquear ni ocultar las imágenes que sí se subieron.
      void failed;
    } finally {
      setServerUploading(false);
    }
  }, []);

  const dismissUploadItems = useCallback(() => setUploadItems([]), []);

  const uploadVideoViaApi = useCallback(async (file: File) => {
    if (slots.length >= MAX_SLOTS) return;
    if (file.size > MAX_VIDEO_BYTES) {
      alert('El video supera el tamaño máximo permitido (95 MB).');
      return;
    }
    setServerUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const title = formRef.current?.elements.namedItem('name') as HTMLInputElement | null;
      const currentTitle = title?.value?.trim();
      if (currentTitle) {
        fd.append('name', currentTitle);
      }
      const res = await fetch('/api/upload-video', { method: 'POST', body: fd });
      const data = (await res.json()) as {
        jobId?: string;
        url?: string;
        posterUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        alert(data.error ?? 'No se pudo subir el video.');
        return;
      }
      setSlots((prev) =>
        [
          ...prev,
          {
            type: 'VIDEO' as const,
            url: data.url!,
            posterUrl: data.posterUrl,
            jobId: data.jobId,
            status: 'processing' as const,
          },
        ].slice(0, MAX_SLOTS),
      );
      sessionUploadedVideosRef.current.push({
        url: data.url!,
        posterUrl: data.posterUrl,
      });
    } finally {
      setServerUploading(false);
    }
  }, [slots.length]);

  const moveLeft = (idx: number) => {
    if (idx === 0) return;
    setSlots((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveRight = (idx: number) => {
    setSlots((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSlots((prev) => {
      const oldIndex = prev.findIndex((s) => s.url === active.id);
      const newIndex = prev.findIndex((s) => s.url === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const hasProcessingVideo = slots.some(
    (s) => s.type === 'VIDEO' && s.status === 'processing',
  );
  const hasFailedVideo = slots.some(
    (s) => s.type === 'VIDEO' && s.status === 'failed',
  );

  const categoryOptions = useMemo(() => {
    const opts: string[] = [];
    const seen = new Set<string>();
    const add = (name: string) => {
      const normalized = normalizeCategoryLabel(name);
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      opts.push(normalized);
    };
    for (const c of fetchedCategories) add(c);
    for (const c of categories) add(c);
    if (product?.category) add(product.category);
    return opts;
  }, [categories, fetchedCategories, product]);

  const normalizedCategoryInput = categoryInput.trim().replace(/\s+/g, ' ');
  const categoryMatchesExisting = categoryOptions.some(
    (c) => c.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedCategoryInput.toLowerCase(),
  );
  const willCreateCategory =
    normalizedCategoryInput.length > 0 && !categoryMatchesExisting;

  const handleClose = useCallback(() => {
    for (const v of sessionUploadedVideosRef.current) {
      if (!originalProductVideoUrlsRef.current.has(v.url)) {
        deleteOrphanVideo(v.url, v.posterUrl, true);
      }
    }
    sessionUploadedVideosRef.current = [];
    onClose();
  }, [onClose]);
  handleCloseRef.current = handleClose;

  const handleSubmitAttempt = useCallback(() => {
    if (hasProcessingVideo) {
      alert('Espera a que el video termine de procesarse antes de guardar.');
      return;
    }
    if (hasFailedVideo) {
      alert('Quita o reemplaza los videos con error antes de guardar.');
      return;
    }
    formRef.current?.requestSubmit();
  }, [hasProcessingVideo, hasFailedVideo]);

  if (!isOpen) return null;

  // Solo el margen escrito para ESTE producto. Sin global.
  const effectiveMargin = Number(marginPct) > 0 ? Number(marginPct) : null;
  const suggestedPrice =
    effectiveMargin != null && Number(cost) > 0
      ? calcSellingPriceUsd(Number(cost), effectiveMargin, pricing.factor)
      : null;

  const normalPriceNum = Number(price) || 0;
  let computedSalePrice: number | null = null;
  if (onSale && normalPriceNum > 0) {
    if (discountMode === 'pct') {
      const p = Number(discountPct);
      if (p > 0 && p < 100) computedSalePrice = roundUpToStep(normalPriceNum * (1 - p / 100));
    } else {
      const a = Number(saleAmount);
      if (a > 0 && a < normalPriceNum) computedSalePrice = roundUpToStep(a);
    }
  }
  const salePct = computedSalePrice != null && normalPriceNum > 0
    ? Math.round((1 - computedSalePrice / normalPriceNum) * 100) : 0;
  // % exacto que escribe el admin en modo porcentaje (puede tener decimales);
  // en modo "precio fijo" usamos el % efectivo redondeado.
  const exactPct =
    discountMode === 'pct' && Number(discountPct) > 0 ? Number(discountPct) : salePct;
  const exactPctLabel = Number.isInteger(exactPct) ? String(exactPct) : exactPct.toFixed(2);

  const onCostChange = (v: string) => {
    setCost(v);
    const n = Number(v);
    const m = Number(marginPct);
    // Solo autocalcula con costo Y margen del producto. Sin global.
    setPrice(n > 0 && m > 0 ? calcSellingPriceUsd(n, m, pricing.factor).toFixed(2) : '');
  };

  const onMarginChange = (v: string) => {
    setMarginPct(v);
    const n = Number(cost);
    const m = Number(v);
    if (n > 0 && m > 0) setPrice(calcSellingPriceUsd(n, m, pricing.factor).toFixed(2));
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={product || detailLoading ? 'Editar producto' : 'Nuevo producto'}
      aria-busy={detailLoading || undefined}
      className="fixed z-50 inset-0 flex sm:items-center sm:justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      <div
        className="relative z-10 bg-white text-left shadow-2xl w-full sm:w-[640px] sm:max-w-[95vw] sm:my-6 sm:rounded-2xl flex flex-col max-h-screen max-h-[100dvh] sm:max-h-[88vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header sticky */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-3.5 border-b bg-white sm:rounded-t-2xl"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}
        >
          <h3 className="text-base sm:text-lg font-black text-navy">
            {product || detailLoading ? 'Editar producto' : 'Nuevo producto'}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar"
            className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="relative flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
          {/*
            Detalle bajo demanda: el formulario permanece MONTADO (sus efectos
            de inicialización necesitan el ref del <form>) y encima se pinta un
            esqueleto. Así el modal se abre al instante en lugar de congelar la
            interfaz mientras viaja la consulta.
          */}
          {detailLoading && (
            <div className="absolute inset-0 z-20 bg-white/95 px-4 sm:px-6 py-4 overflow-hidden">
              <div className="animate-pulse space-y-4" role="status" aria-label="Cargando producto">
                <div className="grid grid-cols-3 gap-2">
                  <div className="aspect-square rounded-xl bg-gray-200" />
                  <div className="aspect-square rounded-xl bg-gray-100" />
                  <div className="aspect-square rounded-xl bg-gray-100" />
                </div>
                <div className="h-10 rounded-lg bg-gray-200" />
                <div className="h-24 rounded-lg bg-gray-100" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-10 rounded-lg bg-gray-200" />
                  <div className="h-10 rounded-lg bg-gray-200" />
                </div>
                <div className="h-10 rounded-lg bg-gray-100" />
              </div>
            </div>
          )}

          {detailError && (
            <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {detailError}
            </div>
          )}

            {/* ── Galería de medios ──────────────────────────────── */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <label className={labelCls}>
                  Galería de medios
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    ({slots.length}/{MAX_SLOTS}) · El primer elemento es el principal en la tienda
                  </span>
                </label>
              </div>

              {slots.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={slots.map((s) => s.url)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {slots.map((slot, idx) => (
                        <SortableSlot
                          key={slot.url}
                          slot={slot}
                          index={idx}
                          total={slots.length}
                          onMoveLeft={moveLeft}
                          onMoveRight={moveRight}
                          onRemove={removeSlot}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {slots.length < MAX_SLOTS && (
                <div className="space-y-3">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={serverUploading}
                    onChange={e => {
                      void uploadFilesViaApi(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={serverUploading}
                    onChange={e => {
                      void uploadFilesViaApi(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
                    className="hidden"
                    disabled={serverUploading}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void uploadVideoViaApi(file);
                      e.target.value = '';
                    }}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={serverUploading}
                      onClick={() => cameraInputRef.current?.click()}
                      className="min-h-[52px] flex items-center justify-center gap-2 bg-navy text-white font-semibold rounded-xl active:bg-navy/80 transition text-sm disabled:opacity-60"
                    >
                      <Camera size={17} /> Tomar foto
                    </button>
                    <button
                      type="button"
                      disabled={serverUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[52px] flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 font-semibold rounded-xl active:bg-gray-100 transition text-sm disabled:opacity-60"
                    >
                      <ImagePlus size={17} /> Galería
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={serverUploading}
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 font-semibold rounded-xl active:bg-gray-100 transition text-sm disabled:opacity-60"
                  >
                    <Video size={17} /> Subir video
                  </button>
                  <p className="text-[11px] text-gray-400 text-center">
                    Video: máx. 95 MB y 3 min. Espera a &ldquo;listo&rdquo; antes de guardar.
                  </p>

                  <UploadProgressList
                    items={uploadItems}
                    busy={serverUploading}
                    onDismiss={dismissUploadItems}
                  />

                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      O pega la URL de una imagen (Enter para añadir):
                    </p>
                    <input
                      type="url"
                      placeholder="https://ejemplo.com/imagen.jpg"
                      className={inputCls}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) { addImages([val]); (e.target as HTMLInputElement).value = ''; }
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {slots.length >= MAX_SLOTS && (
                <>
                  <p className="text-xs text-amber-600 mt-2">
                    Límite de {MAX_SLOTS} elementos. Elimina uno para añadir otro.
                  </p>
                  <UploadProgressList
                    items={uploadItems}
                    busy={serverUploading}
                    onDismiss={dismissUploadItems}
                  />
                </>
              )}
            </div>

            {/* ── Formulario ──────────────────────────────────────── */}
            <form
              ref={formRef}
              onSubmit={(e) => {
                if (hasProcessingVideo) {
                  e.preventDefault();
                  alert('Espera a que el video termine de procesarse antes de guardar.');
                  return;
                }
                if (hasFailedVideo) {
                  e.preventDefault();
                  alert('Quita o reemplaza los videos con error antes de guardar.');
                }
              }}
              action={async (formData) => {
                const currentSlots = slotsRef.current;
                if (currentSlots.some((s) => s.type === 'VIDEO' && s.status === 'processing')) {
                  alert('Espera a que el video termine de procesarse antes de guardar.');
                  return;
                }
                if (currentSlots.some((s) => s.type === 'VIDEO' && s.status === 'failed')) {
                  alert('Quita o reemplaza los videos con error antes de guardar.');
                  return;
                }

                const mediaForSave: ProductGalleryItem[] = currentSlots.map((s) => {
                  if (s.type === 'VIDEO') {
                    return { type: 'VIDEO' as const, url: s.url, posterUrl: s.posterUrl };
                  }
                  return { type: 'IMAGE' as const, url: s.url };
                });
                const legacyImages = deriveLegacyImagesFromSlots(mediaForSave);
                formData.set('imagesJson', JSON.stringify(legacyImages));
                formData.set('mediaJson', JSON.stringify(mediaForSave));
                formData.set('specsJson',  JSON.stringify(specs));
                formData.set('salePrice', computedSalePrice != null ? String(computedSalePrice) : '');
                // No depender de que un checkbox desmarcado desaparezca del FormData.
                formData.set('freeShipping', freeShipping ? 'true' : 'false');
                formData.set('category', categoryInput);
                startTransition(async () => {
                  const action = product
                    ? updateProductAction.bind(null, product.id)
                    : createProductAction;
                  const result = await action(formData);
                  if (result.success) {
                    sessionUploadedVideosRef.current = [];
                    try {
                      await onSaved?.();
                    } catch {
                      alert(
                        'El producto se guardó, pero no se pudo refrescar la lista. Recarga la página.',
                      );
                    }
                    onClose();
                    if (!product) {
                      formRef.current?.reset();
                      setCategoryInput('');
                    }
                  } else {
                    alert(result.message);
                  }
                });
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {/* Nombre */}
                <div className="sm:col-span-2">
                  <label htmlFor="name" className={labelCls}>Nombre <span className="text-red-500">*</span></label>
                  <input type="text" name="name" id="name" required className={inputCls} />
                </div>

                {/* Descripción */}
                <div className="sm:col-span-2">
                  <label htmlFor="description" className={labelCls}>Descripción <span className="text-red-500">*</span></label>
                  <textarea name="description" id="description" required rows={3} className={inputCls} />
                </div>

                {/* Costo */}
                <div>
                  <label htmlFor="cost" className={labelCls}>Costo (USD) <span className="text-red-500">*</span></label>
                  <input type="number" name="cost" id="cost" step="0.01" min="0" className={inputCls}
                    value={cost} onChange={(e) => onCostChange(e.target.value)} />
                  {Number(cost) > 0 && (
                    effectiveMargin != null && suggestedPrice != null ? (
                      <p className="text-xs text-green-600 mt-1">
                        Precio sugerido: <strong>${suggestedPrice.toFixed(2)}</strong>
                        {' '}· costo × {(1 + effectiveMargin / 100).toFixed(2)} × tasa actual {pricing.factor}
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-600 mt-1">
                        Escribe el margen de ganancia (%) para calcular el precio.
                      </p>
                    )
                  )}
                </div>

                {/* Margen por producto */}
                <div>
                  <label htmlFor="marginPct" className={labelCls}>Margen de ganancia (%) <span className="text-red-500">*</span></label>
                  <input type="number" name="marginPct" id="marginPct" step="1" min="0" className={inputCls}
                    value={marginPct} onChange={(e) => onMarginChange(e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-1">Escribe el % de ganancia de este producto (o usa un atajo).</p>
                  {/* Atajos de margen configurables */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {editingPresets ? (
                      <>
                        {presetDraft.map((val, i) => (
                          <input
                            key={i}
                            type="number"
                            min="0"
                            value={val}
                            onChange={(e) =>
                              setPresetDraft((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                            }
                            className="w-12 px-1.5 py-1 text-xs text-center border border-gray-300 rounded-md"
                          />
                        ))}
                        <button
                          type="button"
                          onClick={async () => {
                            const nums = presetDraft.map((v) => Number(v) || 0);
                            const res = await updateMarginPresets(nums);
                            if (res.success) { setPresets(nums); setEditingPresets(false); }
                            else alert(res.message);
                          }}
                          className="px-2 py-1 text-xs font-semibold text-white bg-navy rounded-md"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPresetDraft(presets.map(String)); setEditingPresets(false); }}
                          className="px-2 py-1 text-xs text-gray-500"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        {presets.map((preset, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onMarginChange(String(preset))}
                            className="px-2.5 py-1 text-xs font-semibold text-navy bg-gray-100 hover:bg-navy/10 rounded-md transition"
                          >
                            {preset}%
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => { setPresetDraft(presets.map(String)); setEditingPresets(true); }}
                          aria-label="Configurar atajos de margen"
                          title="Configurar atajos"
                          className="px-1.5 py-1 text-gray-400 hover:text-navy"
                        >
                          ✎
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Precio normal */}
                <div className="sm:col-span-2">
                  <label htmlFor="price" className={labelCls}>Precio normal (USD) <span className="text-red-500">*</span></label>
                  <input type="number" name="price" id="price" required step="0.01" min="0" className={inputCls}
                    value={price} onChange={(e) => setPrice(e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-1">Se calcula solo desde el costo. Puedes ajustarlo.</p>
                </div>

                {/* Oferta */}
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={onSale} onChange={(e) => setOnSale(e.target.checked)}
                      className="w-4 h-4 accent-yellow-400" />
                    <span className="text-sm font-bold text-gray-700">Poner en oferta</span>
                  </label>

                  {onSale && (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2.5">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setDiscountMode('pct')}
                          className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold border transition ${discountMode === 'pct' ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
                          % descuento
                        </button>
                        <button type="button" onClick={() => setDiscountMode('amount')}
                          className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold border transition ${discountMode === 'amount' ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200'}`}>
                          Precio fijo
                        </button>
                      </div>

                      {discountMode === 'pct' ? (
                        <input type="number" min="0.01" max="99.99" step="0.01" value={discountPct}
                          onChange={(e) => setDiscountPct(e.target.value)} placeholder="Ej: 7.21 (% de descuento)"
                          className={inputCls} />
                      ) : (
                        <input type="number" min="0" step="0.01" value={saleAmount}
                          onChange={(e) => setSaleAmount(e.target.value)} placeholder="Precio en oferta (USD)"
                          className={inputCls} />
                      )}

                      {computedSalePrice != null ? (
                        <p className="text-sm text-gray-700">
                          Antes <s className="text-gray-400">${normalPriceNum.toFixed(2)}</s> →{' '}
                          <strong className="text-green-700">${computedSalePrice.toFixed(2)}</strong>{' '}
                          <span className="font-bold text-red-600">(-{exactPctLabel}%)</span>
                          {discountMode === 'pct' && Number(discountPct) > 0 && exactPct !== salePct && (
                            <span className="ml-1 text-xs text-gray-400">· el cliente verá -{salePct}%</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-500">
                          {normalPriceNum > 0 ? 'Ingresa un descuento menor al precio normal.' : 'Primero define el costo o el precio normal.'}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Envío gratis por MRW (elegibilidad; no aplica a ZOOM/TEALCA ni retiro) */}
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 cursor-pointer active:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={freeShipping}
                      onChange={(e) => setFreeShipping(e.target.checked)}
                      className="mt-0.5 h-5 w-5 rounded border-gray-300 accent-navy flex-shrink-0"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-bold text-gray-700">Envío gratis por MRW</span>
                      <span className="text-xs text-gray-500 mt-0.5">
                        Marca este producto como elegible para envío gratis exclusivamente por MRW.
                        Si el cliente elige ZOOM o TEALCA, será cobro a destino. En retiro en tienda
                        no aplica envío.
                      </span>
                    </span>
                  </label>
                </div>

                {/* Stock */}
                <div>
                  <label htmlFor="stock" className={labelCls}>Stock <span className="text-red-500">*</span></label>
                  <input type="number" name="stock" id="stock" required min="0" className={inputCls} />
                </div>

                {/* Categoría */}
                <div>
                  <label htmlFor="category" className={labelCls}>Categoría <span className="text-red-500">*</span></label>
                  <CategoryCombobox
                    id="category"
                    value={categoryInput}
                    onChange={setCategoryInput}
                    options={categoryOptions}
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Haz clic para ver las categorías creadas. Si escribes una que no existe, se creará al guardar el producto.
                  </p>
                  {willCreateCategory ? (
                    <p className="text-[11px] text-navy/80 mt-1 font-medium" data-testid="category-will-create">
                      Se creará la categoría: {normalizedCategoryInput}
                    </p>
                  ) : null}
                </div>

                {/* Marca */}
                <div>
                  <label htmlFor="brand" className={labelCls}>Marca</label>
                  <input type="text" name="brand" id="brand" className={inputCls} />
                </div>

                {/* SKU */}
                <div className="sm:col-span-2">
                  <label htmlFor="sku" className={labelCls}>
                    SKU / Referencia
                    <span className="ml-1.5 text-xs font-normal text-gray-400">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    name="sku"
                    id="sku"
                    placeholder="Ej: SEC-REM-001, LH-00001984..."
                    className={inputCls}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Código interno. Si se define, debe ser único.
                  </p>
                </div>
              </div>

              {/* ── Especificaciones técnicas ────────────────────── */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls}>
                    Especificaciones técnicas
                    <span className="ml-1.5 text-xs font-normal text-gray-400">(opcional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSpecs(prev => [...prev, { name: '', value: '' }])}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-navy border border-navy/30 rounded-lg px-2.5 py-1.5 hover:bg-navy/5 transition"
                  >
                    <Plus size={13} /> Añadir fila
                  </button>
                </div>

                {specs.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    Sin especificaciones. Añade filas como &ldquo;RAM / 8 GB&rdquo;, &ldquo;Pantalla / 6.7 pulgadas&rdquo;, etc.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {specs.map((spec, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Nombre (ej: RAM)"
                          value={spec.name}
                          onChange={e => setSpecs(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                          className={`${inputCls} flex-1`}
                        />
                        <input
                          type="text"
                          placeholder="Valor (ej: 8 GB)"
                          value={spec.value}
                          onChange={e => setSpecs(prev => prev.map((s, i) => i === idx ? { ...s, value: e.target.value } : s))}
                          className={`${inputCls} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => setSpecs(prev => prev.filter((_, i) => i !== idx))}
                          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition"
                          aria-label="Eliminar fila"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </form>
        </div>

        {/* Footer sticky */}
        <div
          className="sticky bottom-0 z-10 flex gap-2 px-4 sm:px-6 py-3 border-t border-gray-100 bg-white sm:rounded-b-2xl"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="flex-1 min-h-[52px] rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-semibold active:bg-gray-100 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmitAttempt}
            disabled={isPending || hasProcessingVideo}
            className="flex-[2] min-h-[52px] rounded-xl bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase tracking-wide active:bg-yellow-300 transition disabled:opacity-60 inline-flex items-center justify-center"
          >
            {isPending
              ? 'Guardando…'
              : hasProcessingVideo
                ? 'Procesando video…'
                : product
                  ? 'Guardar cambios'
                  : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableSlot({
  slot, index, total, onMoveLeft, onMoveRight, onRemove,
}: {
  slot: GallerySlot;
  index: number;
  total: number;
  onMoveLeft: (i: number) => void;
  onMoveRight: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.url });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  const previewSrc = slot.type === 'VIDEO' ? (slot.posterUrl ?? '/placeholder-product.png') : slot.url;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-square"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewSrc} alt={`Medio ${index + 1}`} loading="lazy" decoding="async" className="w-full h-full object-contain p-1" />

      {slot.type === 'VIDEO' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/40 rounded-full p-1.5"><Play size={14} className="text-white fill-white" /></div>
        </div>
      )}
      {slot.type === 'VIDEO' && slot.status === 'processing' && (
        <div className="absolute bottom-1 left-1 right-1 z-[1] bg-amber-500/95 text-white text-[9px] font-bold px-1.5 py-0.5 rounded text-center">Procesando…</div>
      )}
      {slot.type === 'VIDEO' && slot.status === 'failed' && (
        <div className="absolute bottom-1 left-1 right-1 z-[1] bg-red-500/95 text-white text-[9px] font-bold px-1.5 py-0.5 rounded text-center truncate">{slot.error ?? 'Error'}</div>
      )}

      {index === 0 && (
        <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-brand-yellow/90 text-navy text-[9px] font-black px-1.5 py-0.5 rounded z-[2]">
          <Star size={8} className="fill-navy" /> Principal
        </div>
      )}

      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastrar para reordenar"
        className="absolute top-1 right-1 z-[3] bg-white/90 hover:bg-white text-gray-600 rounded-full p-1.5 shadow-sm cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={13} />
      </button>

      <div className="absolute bottom-1 left-1 right-1 z-[2] flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => onMoveLeft(index)}
          disabled={index === 0}
          title="Mover antes"
          className="bg-white/90 hover:bg-white text-gray-700 rounded-full px-2 py-1 text-xs font-bold shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
        >◀</button>
        <button
          type="button"
          onClick={() => onMoveRight(index)}
          disabled={index === total - 1}
          title="Mover después"
          className="bg-white/90 hover:bg-white text-gray-700 rounded-full px-2 py-1 text-xs font-bold shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
        >▶</button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          title="Quitar"
          className="bg-white/90 hover:bg-white text-red-600 rounded-full p-1.5 shadow-sm"
        ><Trash2 size={13} /></button>
      </div>
    </div>
  );
}
