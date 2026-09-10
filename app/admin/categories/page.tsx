'use client';

import { useEffect, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  Tag, Plus, Edit, Trash2, Check, X, Loader2, Star, AlertCircle, Package,
} from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/admin/DataTable';
import { TouchIconButton } from '@/components/admin/TouchIconButton';
import PhotoUploader from '@/components/admin/PhotoUploader';

interface Category {
  id:               string;
  name:             string;
  slug:             string;
  imageUrl:         string | null;
  isFeatured:       boolean;
  order:            number;
  description:      string | null;
  seoTitle:         string | null;
  googleCategoryId: number | null;
  productCount?:    number;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState<Category | null>(null);
  const [creating, setCreating]     = useState(false);
  const [feedback, setFeedback]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const flash = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3500);
  };

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/categories?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCategories(data); // productCount ya viene del servidor
      } else {
        // RUN-12: un fallo HTTP parecía "0 categorías" sin ninguna señal.
        flash('error', 'No se pudieron cargar las categorías. Recarga la página.');
      }
    } catch (err) {
      console.error('[admin/categories] error cargando:', err);
      flash('error', 'Error de conexión al cargar categorías.');
    }
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleDelete = async (cat: Category) => {
    if (cat.productCount && cat.productCount > 0) {
      if (!confirm(`Esta categoría tiene ${cat.productCount} productos asociados. ¿Eliminar de todas formas?`)) return;
    } else if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) {
      return;
    }
    const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
    if (res.ok) {
      flash('success', 'Categoría eliminada.');
      fetchCategories();
    } else {
      flash('error', 'No se pudo eliminar.');
    }
  };

  const columns: DataTableColumn<Category>[] = [
    {
      key: 'name', header: 'Nombre', primary: true,
      cell: c => (
        <span className="block truncate">
          {c.name}
          {c.isFeatured && <Star size={12} className="inline-block ml-1.5 text-amber-500 fill-amber-400" />}
        </span>
      ),
    },
    {
      key: 'slug', header: 'Slug', secondary: true, mobileLabel: 'Slug',
      cell: c => <span className="font-mono text-[12px] text-gray-500 truncate">/{c.slug}</span>,
    },
    {
      key: 'order', header: 'Orden', mobileLabel: 'Orden', align: 'right',
      cell: c => <span className="font-mono text-sm text-gray-600">{c.order}</span>,
    },
    {
      key: 'productCount', header: 'Productos', mobileLabel: 'Productos', align: 'right',
      cell: c => <span className="font-mono text-sm text-gray-600">{c.productCount ?? '—'}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-amber-50 text-navy flex items-center justify-center">
            <Tag size={22} />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-navy">Categorías</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading ? '…' : `${categories.length} categorías. El slug controla la URL pública (SEO).`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="min-h-[48px] inline-flex items-center justify-center gap-1.5 px-4 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase tracking-wide rounded-xl active:bg-yellow-300"
        >
          <Plus size={16} /> Nueva
        </button>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          feedback.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? <Check size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      <DataTable<Category>
        data={categories}
        columns={columns}
        rowKey={c => c.id}
        loading={loading}
        emptyState="Aún no hay categorías. Crea la primera con el botón 'Nueva'."
        mobileLeading={c => (
          <span className="w-12 h-12 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0 flex items-center justify-center">
            {c.imageUrl ? (
              <Image src={c.imageUrl} alt={c.name} width={48} height={48} className="object-cover w-full h-full" />
            ) : (
              <Package size={20} className="text-gray-400" />
            )}
          </span>
        )}
        actions={c => (
          <>
            <TouchIconButton
              variant="primary"
              label="Editar"
              icon={<Edit size={18} />}
              onClick={() => setEditing(c)}
            />
            <TouchIconButton
              variant="danger"
              label="Eliminar"
              icon={<Trash2 size={18} />}
              onClick={() => handleDelete(c)}
            />
          </>
        )}
      />

      {(creating || editing) && (
        <CategoryDialog
          category={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(msg) => {
            setCreating(false);
            setEditing(null);
            flash('success', msg);
            fetchCategories();
          }}
          onError={(msg) => flash('error', msg)}
        />
      )}
    </div>
  );
}

function CategoryDialog({
  category, onClose, onSaved, onError,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName]                         = useState(category?.name ?? '');
  const [slug, setSlug]                         = useState(category?.slug ?? '');
  const [slugTouched, setSlugTouched]           = useState(!!category);
  const [imageUrl, setImageUrl]                 = useState<string | null>(category?.imageUrl ?? null);
  const [isFeatured, setIsFeatured]             = useState(category?.isFeatured ?? false);
  const [order, setOrder]                       = useState(category?.order ?? 0);
  const [description, setDescription]           = useState(category?.description ?? '');
  const [seoTitle, setSeoTitle]                 = useState(category?.seoTitle ?? '');
  const [googleCategoryId, setGoogleCategoryId] = useState<string>(
    category?.googleCategoryId != null ? String(category.googleCategoryId) : ''
  );
  const [pending, startTransition]              = useTransition();

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const submit = () => {
    if (!name.trim() || !slug.trim()) {
      onError('Nombre y slug son obligatorios.');
      return;
    }
    startTransition(async () => {
      const url = category ? `/api/categories/${category.id}` : '/api/categories';
      const method = category ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          imageUrl,
          isFeatured,
          order:            Number(order),
          description:      description.trim() || null,
          seoTitle:         seoTitle.trim()    || null,
          googleCategoryId: googleCategoryId.trim() !== ''
            ? parseInt(googleCategoryId.trim(), 10)
            : null,
        }),
      });
      if (res.ok) onSaved(category ? 'Categoría actualizada.' : 'Categoría creada.');
      else {
        const err = await res.json().catch(() => ({}));
        onError(err.error ?? 'No se pudo guardar la categoría.');
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full sm:w-[460px] sm:max-w-[92vw] sm:my-6 bg-white sm:rounded-2xl shadow-2xl flex flex-col max-h-screen max-h-[100dvh] sm:max-h-[88vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="sticky top-0 bg-white sm:rounded-t-2xl border-b border-gray-100 px-4 py-3.5 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}>
          <h2 className="text-base font-black text-navy truncate">
            {category ? 'Editar categoría' : 'Nueva categoría'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
              Slug <span className="text-[10px] font-medium text-gray-400 normal-case">— se usa en la URL pública</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 font-mono">/categoria/</span>
              <input
                type="text"
                value={slug}
                onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                className="flex-1 min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base font-mono focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Sin acentos, espacios o mayúsculas. Se autogenera, pero puedes editarlo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">Orden</label>
              <input
                type="number"
                value={order}
                onChange={e => setOrder(Number(e.target.value))}
                className="w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">Destacada</label>
              <button
                type="button"
                onClick={() => setIsFeatured(v => !v)}
                className={`w-full min-h-[48px] rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 ${
                  isFeatured
                    ? 'bg-amber-100 border-amber-300 text-amber-800'
                    : 'bg-white border-gray-200 text-gray-500 active:bg-gray-100'
                }`}
              >
                <Star size={14} className={isFeatured ? 'fill-amber-400' : ''} />
                {isFeatured ? 'Destacada' : 'Normal'}
              </button>
            </div>
          </div>

          <PhotoUploader
            value={imageUrl}
            onChange={setImageUrl}
            purpose="category"
            label="Imagen de la categoría"
            hint="Recomendado 800×800. Aparece en el grid de Categorías destacadas del home."
            previewHeight="h-40"
          />

          {/* P85: campos SEO ─────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
              Título SEO{' '}
              <span className="text-[10px] font-medium text-gray-400 normal-case">
                — reemplaza el título automático (opcional, máx. 70 chars)
              </span>
            </label>
            <input
              type="text"
              value={seoTitle}
              onChange={e => setSeoTitle(e.target.value)}
              maxLength={70}
              placeholder={`${name} - Tecnología`}
              className="w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
            />
            <p className={`text-[11px] mt-1 ${seoTitle.length > 60 ? 'text-amber-600' : 'text-gray-400'}`}>
              {seoTitle.length}/70 chars
              {seoTitle.length > 60 && ' — los buscadores truncan títulos largos'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
              Descripción SEO{' '}
              <span className="text-[10px] font-medium text-gray-400 normal-case">
                — meta description y hero de la página (opcional, máx. 300 chars)
              </span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Describe brevemente esta categoría: qué productos incluye, para qué sirven y por qué comprar en MundoTech."
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-base resize-none focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
            />
            <p className={`text-[11px] mt-1 ${description.length > 260 ? 'text-amber-600' : 'text-gray-400'}`}>
              {description.length}/300 chars
              {description.length > 260 && ' — idealmente ≤ 160 chars para meta description'}
            </p>
          </div>

          {/* Google Product Category ID ─────────────────────────── */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
              ID de categoría Google{' '}
              <span className="text-[10px] font-medium text-gray-400 normal-case">— opcional</span>
            </label>
            <input
              type="number"
              min={1}
              value={googleCategoryId}
              onChange={e => setGoogleCategoryId(e.target.value)}
              placeholder="ej: 267"
              className="w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base font-mono focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Si lo dejas vacío se usa el mapeo automático por nombre.{' '}
              <a
                href="https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-navy"
              >
                Ver taxonomía oficial
              </a>
            </p>
          </div>
        </div>

        <footer className="sticky bottom-0 bg-white sm:rounded-b-2xl border-t border-gray-100 px-4 py-3 flex gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} disabled={pending} className="flex-1 min-h-[52px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100">
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={pending} className="flex-[2] min-h-[52px] inline-flex items-center justify-center gap-2 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase rounded-xl active:bg-yellow-300 disabled:opacity-60">
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            {category ? 'Guardar cambios' : 'Crear categoría'}
          </button>
        </footer>
      </div>
    </div>
  );
}
