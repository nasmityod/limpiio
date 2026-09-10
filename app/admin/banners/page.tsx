'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Plus, Pencil, Trash2, Eye, EyeOff,
  X, Save, Loader2, ImageIcon, ExternalLink,
} from 'lucide-react';
import PhotoUploader from '@/components/admin/PhotoUploader';

interface Banner {
  id:        string;
  type:      string;
  imageUrl:  string;
  title:     string | null;
  subtitle:  string | null;
  label:     string | null;
  ctaText:   string | null;
  tagText:   string | null;
  link:      string | null;
  focalPoint: string | null;
  active:    boolean;
  order:     number;
  createdAt: string;
}

const BANNER_TYPES = [
  { value: 'hero',        label: 'Hero — Slide de carrusel',   desc: 'Desliza en el banner principal. Añade varios para crear el carrusel.' },
  { value: 'ad_box',      label: 'Caja de Departamento',        desc: '4 cajas debajo de las categorías (posición según Orden).'            },
  { value: 'cta_banner',  label: 'Banner CTA (fondo)',          desc: 'Gran banner al final de la página con título, párrafo y botón.'       },
  { value: 'discover',   label: 'Descubre — Mosaico',  desc: 'Mosaico de banners debajo de Ofertas del Día. Sube tu diseño Canva en 4:3 (rec. 800×600).' },
  { value: 'promo_large', label: 'Promo Grande (legacy)',        desc: 'Banner amarillo de oferta del día (antiguo).'                        },
  { value: 'promo_small_1', label: 'Promo Pequeña 1 (legacy)', desc: 'Banner navy superior derecho (antiguo).'                              },
  { value: 'promo_small_2', label: 'Promo Pequeña 2 (legacy)', desc: 'Banner verde inferior derecho (antiguo).'                             },
];

const TYPE_LABELS: Record<string, string> = {
  hero:          'Hero',
  ad_box:        'Caja Depto.',
  cta_banner:    'CTA Banner',
  discover:      'Descubre',
  promo_large:   'Promo Grande',
  promo_small_1: 'Promo 1',
  promo_small_2: 'Promo 2',
};

const TYPE_COLORS: Record<string, string> = {
  hero:          'bg-navy/80',
  ad_box:        'bg-amber-600/80',
  cta_banner:    'bg-purple-700/80',
  discover:      'bg-pink-600/80',
  promo_large:   'bg-yellow-600/80',
  promo_small_1: 'bg-gray-700/80',
  promo_small_2: 'bg-green-700/80',
};

const EMPTY_FORM = {
  type:     'hero',
  imageUrl: '',
  title:    '',
  subtitle: '',
  label:    '',
  ctaText:  '',
  tagText:  '',
  link:     '/productos',
  focalPoint: 'center',
  active:   true,
  order:    0,
};

const FOCAL_POINT_OPTIONS = [
  { value: 'center',       label: 'Centro' },
  { value: 'top',          label: 'Arriba' },
  { value: 'bottom',       label: 'Abajo' },
  { value: 'left',         label: 'Izquierda' },
  { value: 'right',        label: 'Derecha' },
  { value: 'top-left',     label: 'Arriba izquierda' },
  { value: 'top-right',    label: 'Arriba derecha' },
  { value: 'bottom-left',  label: 'Abajo izquierda' },
  { value: 'bottom-right', label: 'Abajo derecha' },
] as const;

/** Fields shown per banner type */
const TYPE_FIELDS: Record<string, string[]> = {
  hero:          ['imageUrl', 'focalPoint', 'title', 'subtitle', 'label', 'ctaText', 'tagText', 'link', 'order', 'active'],
  ad_box:        ['imageUrl', 'title', 'label', 'ctaText', 'link', 'order', 'active'],
  cta_banner:    ['imageUrl', 'title', 'subtitle', 'label', 'ctaText', 'link', 'order', 'active'],
  discover:      ['imageUrl', 'title', 'link', 'order', 'active'],
  promo_large:   ['imageUrl', 'title', 'subtitle', 'link', 'order', 'active'],
  promo_small_1: ['imageUrl', 'title', 'subtitle', 'link', 'order', 'active'],
  promo_small_2: ['imageUrl', 'title', 'subtitle', 'link', 'order', 'active'],
};

const FIELD_HELP: Record<string, { label: string; placeholder: string; hint?: string }> = {
  title:    { label: 'Título',       placeholder: 'ej. iPhone última generación', hint: 'Usa \\n para salto de línea' },
  subtitle: { label: 'Descripción',  placeholder: 'ej. Desde Barquisimeto para toda Venezuela.' },
  label:    { label: 'Badge / Etiqueta', placeholder: 'ej. Gaming portátil · Nuevo · Zona Apple' },
  ctaText:  { label: 'Texto del botón CTA', placeholder: 'ej. Ver gaming · Ir al catálogo' },
  tagText:  { label: 'Tag flotante',   placeholder: 'ej. Nuevo · Disponible · Destacado' },
  link:     { label: 'Enlace (URL)',   placeholder: '/productos, /categoria/consolas' },
};

export default function AdminBannersPage() {
  const [banners, setBanners]         = useState<Banner[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [saving, setSaving]           = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [filterType, setFilterType]   = useState('all');

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/banners?showAll=true');
      const data = await r.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch {
      setBanners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBanners(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setUploadError('');
    setShowForm(true);
  };

  const openEdit = (b: Banner) => {
    setEditId(b.id);
    setForm({
      type:     b.type,
      imageUrl: b.imageUrl,
      title:    b.title    ?? '',
      subtitle: b.subtitle ?? '',
      label:    b.label    ?? '',
      ctaText:  b.ctaText  ?? '',
      tagText:  b.tagText  ?? '',
      link:     b.link     ?? '/productos',
      focalPoint: b.focalPoint ?? 'center',
      active:   b.active,
      order:    b.order,
    });
    setUploadError('');
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.imageUrl) { setUploadError('Debes seleccionar una imagen'); return; }
    setSaving(true);
    try {
      const url    = editId ? `/api/banners/${editId}` : '/api/banners';
      const method = editId ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          title:    form.title    || null,
          subtitle: form.subtitle || null,
          label:    form.label    || null,
          ctaText:  form.ctaText  || null,
          tagText:  form.tagText  || null,
          order:    Number(form.order),
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      await fetchBanners();
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este banner? Esta acción no se puede deshacer.')) return;
    await fetch(`/api/banners/${id}`, { method: 'DELETE' });
    setBanners(bs => bs.filter(b => b.id !== id));
  };

  const handleToggle = async (b: Banner) => {
    await fetch(`/api/banners/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...b, active: !b.active }),
    });
    setBanners(bs => bs.map(x => x.id === b.id ? { ...x, active: !x.active } : x));
  };

  const visibleBanners = filterType === 'all' ? banners : banners.filter(b => b.type === filterType);
  const showField = (field: string) => (TYPE_FIELDS[form.type] ?? []).includes(field);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Banners & Cajas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Hero, cajas de departamento, CTA final y banners de promo
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 bg-navy text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-navy/90 transition-colors shadow-sm"
        >
          <Plus size={16} /> Nuevo Banner
        </button>
      </div>

      {/* Leyenda de tipos */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        {BANNER_TYPES.slice(0, 4).map(t => (
          <div key={t.value} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <p className="text-xs font-bold text-navy">{t.label}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{t.desc}</p>
          </div>
        ))}
      </div>

      {/* Filtro de tipo */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${filterType === 'all' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Todos ({banners.length})
        </button>
        {BANNER_TYPES.map(t => {
          const count = banners.filter(b => b.type === t.value).length;
          if (count === 0) return null;
          return (
            <button
              type="button"
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${filterType === t.value ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {TYPE_LABELS[t.value]} ({count})
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-gray-400" />
        </div>
      ) : visibleBanners.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center">
          <ImageIcon size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="font-bold text-gray-500">No hay banners todavía</p>
          <p className="text-sm text-gray-400 mt-1">Crea el primer banner para la página principal</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 bg-navy text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-navy/90"
          >
            <Plus size={15} /> Crear banner
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleBanners.map(b => (
            <div
              key={b.id}
              className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition-all ${
                b.active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'
              }`}
            >
              <div className="relative h-40 bg-gray-100">
                {b.imageUrl ? (
                  <Image src={b.imageUrl} alt={b.title ?? b.type} fill className="object-cover" sizes="400px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={32} className="text-gray-300" />
                  </div>
                )}
                <span className={`absolute top-2 left-2 ${TYPE_COLORS[b.type] ?? 'bg-gray-700/80'} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                  {TYPE_LABELS[b.type] ?? b.type}
                </span>
                <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${b.active ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
                  {b.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-bold text-navy text-sm truncate">{b.title || b.label || '(sin título)'}</p>
                  {b.order > 0 && (
                    <span className="flex-shrink-0 text-[10px] bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">
                      Orden {b.order}
                    </span>
                  )}
                </div>
                {b.subtitle && <p className="text-xs text-gray-500 truncate">{b.subtitle}</p>}
                {b.label    && <p className="text-[11px] text-amber-600 font-semibold mt-0.5 truncate">Badge: {b.label}</p>}
                {b.ctaText  && <p className="text-[11px] text-navy/70 font-medium truncate">CTA: {b.ctaText}</p>}
                {b.link && (
                  <a
                    href={b.link} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-navy hover:underline mt-1 font-medium"
                  >
                    <ExternalLink size={10} /> {b.link}
                  </a>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => handleToggle(b)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      b.active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {b.active ? <EyeOff size={13} /> : <Eye size={13} />}
                    {b.active ? 'Ocultar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(b)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-gray-200 bg-gray-50 text-navy hover:bg-gray-100 transition-colors rounded-lg"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(b.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors ml-auto"
                  >
                    <Trash2 size={13} /> Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex sm:items-center sm:justify-center" onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white sm:rounded-2xl shadow-2xl w-full sm:w-[520px] sm:max-w-[92vw] sm:my-6 max-h-screen max-h-[100dvh] sm:max-h-[88vh] flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >

            <div
              className="sticky top-0 bg-white sm:rounded-t-2xl flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-gray-100"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.875rem)' }}
            >
              <h2 className="text-base font-black text-navy">
                {editId ? 'Editar Banner' : 'Nuevo Banner'}
              </h2>
              <button type="button" onClick={closeForm} aria-label="Cerrar" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100 text-gray-500">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">

              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Tipo de Banner *
                </label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full min-h-[48px] border border-gray-200 rounded-xl px-3 py-2.5 text-base text-navy bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/20"
                >
                  {BANNER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  {BANNER_TYPES.find(t => t.value === form.type)?.desc}
                </p>
              </div>

              <PhotoUploader
                value={form.imageUrl}
                onChange={(url) => setForm(f => ({ ...f, imageUrl: url ?? '' }))}
                purpose="banner"
                label="Imagen del banner *"
                hint={
                  form.type === 'hero'
                    ? 'Sube una imagen SIN texto ni logo incrustado (el sistema añade el título, botón y el slogan). Tamaño ideal: 2400×1200 px (2:1), < 500 KB, con lo importante centrado.'
                    : 'Recomendado JPG/PNG/WebP. Para hero usar 1600×600 aprox.'
                }
                optional={false}
                previewHeight="h-44"
              />
              {uploadError && (
                <p className="text-xs text-red-600 -mt-2">
                  {uploadError}
                </p>
              )}

              {showField('focalPoint') && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Punto focal (recorte en móvil)
                  </label>
                  <select
                    value={form.focalPoint}
                    onChange={e => setForm(f => ({ ...f, focalPoint: e.target.value }))}
                    className="w-full min-h-[48px] border border-gray-200 rounded-xl px-3 py-2.5 text-base text-navy bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/20"
                  >
                    {FOCAL_POINT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Controla qué parte de la imagen se mantiene visible al recortar en pantallas estrechas.
                  </p>
                </div>
              )}

              {/* Campos dinámicos según tipo */}
              {(['title', 'subtitle', 'label', 'ctaText', 'tagText'] as const).map(field => {
                if (!showField(field)) return null;
                const help = FIELD_HELP[field];
                return (
                  <div key={field}>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                      {help.label}
                    </label>
                    {field === 'subtitle' ? (
                      <textarea
                        rows={3}
                        placeholder={help.placeholder}
                        value={form[field]}
                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/20 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        placeholder={help.placeholder}
                        value={form[field]}
                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                        className="w-full min-h-[48px] border border-gray-200 rounded-xl px-3 py-2.5 text-base bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/20"
                      />
                    )}
                    {help.hint && <p className="text-[10px] text-gray-400 mt-0.5">{help.hint}</p>}
                  </div>
                );
              })}

              {/* Link */}
              {showField('link') && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Enlace (al hacer clic)
                  </label>
                  <input
                    type="text"
                    placeholder={FIELD_HELP.link.placeholder}
                    value={form.link}
                    onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                    className="w-full min-h-[48px] border border-gray-200 rounded-xl px-3 py-2.5 text-base bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/20"
                  />
                </div>
              )}

              {/* Orden + Activo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Orden {form.type === 'ad_box' ? '(1–4)' : ''}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.order}
                    onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                    className="w-full min-h-[48px] border border-gray-200 rounded-xl px-3 py-2.5 text-base bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Estado</label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                    className={`w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border text-sm font-bold transition ${
                      form.active
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    <span className={`relative w-9 h-5 rounded-full ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
                    </span>
                    {form.active ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              </div>
            </div>

            <div
              className="sticky bottom-0 bg-white border-t border-gray-100 sm:rounded-b-2xl px-4 sm:px-6 py-3 flex gap-2"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="flex-1 min-h-[52px] bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] min-h-[52px] flex items-center justify-center gap-2 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase tracking-wide rounded-xl active:bg-yellow-300 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editId ? 'Guardar cambios' : 'Crear banner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
