'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  LayoutDashboard, Star, StarOff, Upload, Loader2,
  Save, RefreshCw, X, ImageIcon, Tag, Zap, ShieldCheck,
  Eye, EyeOff, Palette, ListChecks, Clock,
} from 'lucide-react';
import ShelvesEditor from './ShelvesEditor';
import FreeShippingEditor from './FreeShippingEditor';
import {
  DEFAULT_HOMEPAGE_FREE_SHIPPING,
  DEFAULT_HOMEPAGE_SHELVES,
  type HomepageFreeShippingConfig,
  type HomepageShelvesConfig,
} from '@/lib/homepage-config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string; name: string; slug: string;
  imageUrl: string | null; isFeatured: boolean; order: number;
}

interface Promotion {
  id: string; title: string; subtitle: string | null;
  discountText: string | null; imageUrl: string | null;
  bgColor: string; link: string; active: boolean; order: number;
}

interface BenefitItem { title: string; sub: string }
interface FlashConfig  { title: string; endHour: number }

type TabId = 'categories' | 'promotions' | 'benefits' | 'flash' | 'shelves' | 'freeShipping';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'categories',    label: '🗂 Categorías',              icon: null },
  { id: 'promotions',    label: '🏷 Ofertas del Día',         icon: null },
  { id: 'benefits',      label: '✅ Barra de Beneficios',     icon: null },
  { id: 'flash',         label: '⚡ Flash Deals',              icon: null },
  { id: 'shelves',       label: '📚 Estanterías de productos', icon: null },
  { id: 'freeShipping',  label: '🚚 Envío gratis MRW',        icon: null },
];

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_BENEFITS: BenefitItem[] = [
  { title: 'Envíos nacionales', sub: 'MRW, Zoom y Tealca (cobro a destino)' },
  { title: 'Garantía 7 días',   sub: 'En electrónica general, con factura'   },
  { title: 'Soporte 24/7',      sub: 'Atención personalizada'                },
  { title: 'Pago seguro',       sub: 'Pago Móvil · Transferencia'            },
];

const DEFAULT_FLASH: FlashConfig = { title: 'Ofertas MundoTech', endHour: 23 };

const PROMO_DEFAULTS = [
  { order: 1, title: 'Hasta 30%\nde descuento', subtitle: 'En consolas, gadgets y tech seleccionados', discountText: 'Hasta 30%', bgColor: '#FFD700', link: '/productos', active: true, imageUrl: null, subtitle_ph: 'Descripción de la oferta' },
  { order: 2, title: 'Garantía 7 días',           subtitle: 'En electrónica general, con factura y caja',     discountText: '', bgColor: '#1A202C', link: '/productos', active: true, imageUrl: null, subtitle_ph: 'Subtítulo banner navy' },
  { order: 3, title: '¡Nuevos Ingresos!',          subtitle: 'Descubre los últimos productos disponibles',   discountText: '', bgColor: '#48BB78', link: '/productos', active: true, imageUrl: null, subtitle_ph: 'Subtítulo banner verde' },
];

const PROMO_ICONS = [<Zap key={1} size={16} />, <ShieldCheck key={2} size={16} />, <Tag key={3} size={16} />];
const PROMO_LABELS = ['Promo Grande (Amarilla)', 'Promo Pequeña 1 (Navy)', 'Promo Pequeña 2 (Verde)'];

// ─── Helper: subir imagen ─────────────────────────────────────────────────────

/** PRD-248: `purpose` explícito — sin él, todo caía al folder por defecto
 *  `mundotech/banners` de /api/upload (upload/route.ts, dueño 01). Mismo
 *  convenio que PhotoUploader (`category`, `banner`, …). */
async function uploadImage(file: File, purpose: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('purpose', purpose);
  const res  = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Error al subir imagen');
  return data.url as string;
}

// ─── ImagePicker ──────────────────────────────────────────────────────────────

function ImagePicker({ value, onChange, label, purpose }: {
  value: string; onChange: (url: string) => void; label?: string; purpose: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setUploading(true);
    try   { onChange(await uploadImage(file, purpose)); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setUploading(false); }
  };

  return (
    <div>
      {label && <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">{label}</p>}
      {value && (
        <div className="relative h-28 rounded-xl overflow-hidden border border-gray-200 mb-2 group">
          <Image src={value} alt="preview" fill className="object-cover" sizes="300px" />
          <button type="button" onClick={() => onChange('')} className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <X size={11} />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Subiendo...' : 'Subir imagen'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <input type="url" placeholder="O pega URL..." value={value} onChange={e => onChange(e.target.value)}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20" />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HomeManagerPage() {
  const [tab, setTab]             = useState<TabId>('categories');

  // categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [savingCat, setSavingCat]   = useState<string | null>(null);

  // promotions
  const [loadingPro, setLoadingPro] = useState(true);
  const [savingPro, setSavingPro]   = useState<number | null>(null);
  const [promoForms, setPromoForms] = useState<Promotion[]>([]);

  // config tabs
  const [loadingCfg, setLoadingCfg]     = useState(true);
  const [benefits, setBenefits]         = useState<BenefitItem[]>(DEFAULT_BENEFITS);
  const [flash, setFlash]               = useState<FlashConfig>(DEFAULT_FLASH);
  const [shelves, setShelves]           = useState<HomepageShelvesConfig>(DEFAULT_HOMEPAGE_SHELVES);
  const [freeShipping, setFreeShipping] = useState<HomepageFreeShippingConfig>(DEFAULT_HOMEPAGE_FREE_SHIPPING);
  const [savingBenefits, setSavingBenefits] = useState(false);
  const [savingFlash, setSavingFlash]       = useState(false);
  const [cfgMsg, setCfgMsg]               = useState('');

  // ── Fetches ──────────────────────────────────────────────────────────────────

  const fetchCategories = async () => {
    setLoadingCat(true);
    try {
      const r = await fetch('/api/categories');
      const d = await r.json();
      setCategories(Array.isArray(d) ? d : []);
    } finally { setLoadingCat(false); }
  };

  const fetchPromotions = async () => {
    setLoadingPro(true);
    try {
      const r = await fetch('/api/promotions?showAll=true');
      const data = await r.json();
      const list: Promotion[] = Array.isArray(data) ? data : [];
      const forms: Promotion[] = PROMO_DEFAULTS.map(def => {
        const existing = list.find(p => p.order === def.order);
        return existing ?? ({ id: '', ...def, subtitle: def.subtitle, discountText: def.discountText, imageUrl: def.imageUrl } as Promotion);
      });
      setPromoForms(forms);
    } finally { setLoadingPro(false); }
  };

  const fetchConfig = async () => {
    setLoadingCfg(true);
    try {
      const r = await fetch('/api/config/homepage');
      const d = await r.json();
      if (d.homepage_benefits)  setBenefits(d.homepage_benefits);
      if (d.homepage_flashdeals) setFlash(d.homepage_flashdeals);
      if (d.homepage_shelves)   setShelves(d.homepage_shelves);
      if (d.homepage_free_shipping) setFreeShipping(d.homepage_free_shipping);
    } finally { setLoadingCfg(false); }
  };

  useEffect(() => { fetchCategories(); fetchPromotions(); fetchConfig(); }, []);

  // ── Category actions ──────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/categories/sync', { method: 'POST' });
      const d = await r.json();
      setCategories(Array.isArray(d.categories) ? d.categories : []);
    } finally { setSyncing(false); }
  };

  const saveCategory = async (cat: Category) => {
    setSavingCat(cat.id);
    try {
      await fetch(`/api/categories/${cat.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cat),
      });
    } finally { setSavingCat(null); }
  };

  const updateCat = (id: string, patch: Partial<Category>) =>
    setCategories(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));

  // ── Promo actions ─────────────────────────────────────────────────────────────

  const savePromo = async (index: number) => {
    const form = promoForms[index];
    setSavingPro(index);
    try {
      if (form.id) {
        await fetch(`/api/promotions/${form.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        });
      } else {
        const r    = await fetch('/api/promotions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        });
        const data = await r.json();
        setPromoForms(fs => fs.map((f, i) => i === index ? { ...f, id: data.id } : f));
      }
    } finally { setSavingPro(null); }
  };

  const updatePromo = (index: number, patch: Partial<Promotion>) =>
    setPromoForms(fs => fs.map((f, i) => i === index ? { ...f, ...patch } : f));

  // ── Config save ───────────────────────────────────────────────────────────────

  const saveConfig = async (key: string, value: unknown, setSaving: (v: boolean) => void) => {
    setSaving(true);
    setCfgMsg('');
    try {
      const r = await fetch('/api/config/homepage', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }),
      });
      const d = await r.json();
      setCfgMsg(d.success ? '✓ Guardado correctamente' : `Error: ${d.error ?? 'Desconocido'}`);
    } finally { setSaving(false); }
  };

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-brand-yellow rounded-xl flex items-center justify-center">
          <LayoutDashboard size={20} className="text-navy" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">Gestión de la Home</h1>
          <p className="text-sm text-gray-500">Edita absolutamente todo lo que aparece en la página principal</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit flex-wrap">
        {TABS.map(t => (
          <button type="button" key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ CATEGORÍAS ═══════════════════════════════════════════════════════════ */}
      {tab === 'categories' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600">
              Marca categorías como destacadas para la fila de portadas.
              Para mostrar <strong>sus productos</strong> como estantería (igual que Novedades),
              usa la pestaña <strong>Estanterías de productos</strong>.
            </p>
            <button type="button" onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 bg-navy text-white rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-50">
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sincronizar desde productos
            </button>
          </div>
          {loadingCat ? (
            <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
          ) : categories.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
              <ImageIcon size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="font-bold text-gray-500">Sin categorías</p>
              <p className="text-sm text-gray-400 mt-1">Haz clic en &ldquo;Sincronizar&rdquo; para importar las categorías de tus productos</p>
              <button type="button" onClick={handleSync} disabled={syncing}
                className="mt-4 flex items-center gap-2 mx-auto text-xs font-bold px-4 py-2.5 bg-navy text-white rounded-xl hover:bg-navy/90 disabled:opacity-50">
                {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Sincronizar ahora
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map(cat => (
                <div key={cat.id} className={`bg-white border rounded-2xl overflow-hidden shadow-sm ${cat.isFeatured ? 'border-brand-yellow ring-2 ring-brand-yellow/30' : 'border-gray-200'}`}>
                  <div className="relative h-36 bg-gray-100">
                    {cat.imageUrl ? (
                      <Image src={cat.imageUrl} alt={cat.name} fill className="object-cover" sizes="350px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><ImageIcon size={28} className="text-gray-300" /></div>
                    )}
                    {cat.isFeatured && (
                      <span className="absolute top-2 left-2 bg-brand-yellow text-navy text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star size={9} fill="currentColor" /> Destacada
                      </span>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-black text-navy text-sm">{cat.name}</p>
                      <button type="button" onClick={() => updateCat(cat.id, { isFeatured: !cat.isFeatured })}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${cat.isFeatured ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {cat.isFeatured ? <Star size={12} fill="currentColor" /> : <StarOff size={12} />}
                        {cat.isFeatured ? 'Destacada' : 'Destacar'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Orden:</label>
                      <input type="number" min={0} value={cat.order}
                        onChange={e => updateCat(cat.id, { order: Number(e.target.value) })}
                        className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-navy/30" />
                    </div>
                    <ImagePicker label="Imagen de portada" purpose="category" value={cat.imageUrl ?? ''} onChange={url => updateCat(cat.id, { imageUrl: url || null })} />
                    <button type="button" onClick={() => saveCategory(cat)} disabled={savingCat === cat.id}
                      className="w-full flex items-center justify-center gap-2 bg-navy text-white text-xs font-bold py-2.5 rounded-xl hover:bg-navy/90 disabled:opacity-50 transition-colors">
                      {savingCat === cat.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      Guardar cambios
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ PROMOCIONES ══════════════════════════════════════════════════════════ */}
      {tab === 'promotions' && (
        <div>
          <p className="text-sm text-gray-600 mb-5">Edita los <strong>3 banners</strong> de &ldquo;Ofertas del Día&rdquo; que aparecen en la página principal.</p>
          {loadingPro ? (
            <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              {promoForms.map((promo, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2 px-4 py-3 text-sm font-bold"
                    style={{ backgroundColor: promo.bgColor, color: promo.bgColor === '#1A202C' ? 'white' : '#1A202C' }}>
                    {PROMO_ICONS[i]} {PROMO_LABELS[i]}
                  </div>
                  <div className="p-4 space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Estado</span>
                      <button type="button" onClick={() => updatePromo(i, { active: !promo.active })}
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${promo.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {promo.active ? <Eye size={13} /> : <EyeOff size={13} />}
                        {promo.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </label>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Título</label>
                      <textarea rows={2} value={promo.title} onChange={e => updatePromo(i, { title: e.target.value })}
                        placeholder="ej. Hasta 30%\nde descuento"
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20 resize-none" />
                      <p className="text-[10px] text-gray-400 mt-0.5">Usa \n para salto de línea</p>
                    </div>
                    {i === 0 && (
                      <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Texto de descuento</label>
                        <input type="text" value={promo.discountText ?? ''} onChange={e => updatePromo(i, { discountText: e.target.value })}
                          placeholder="ej. Hasta 30%"
                          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Subtítulo</label>
                      <input type="text" value={promo.subtitle ?? ''} onChange={e => updatePromo(i, { subtitle: e.target.value })}
                        placeholder={PROMO_DEFAULTS[i].subtitle_ph}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Palette size={12} /> Color de fondo
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={promo.bgColor} onChange={e => updatePromo(i, { bgColor: e.target.value })}
                          className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                        <input type="text" value={promo.bgColor} onChange={e => updatePromo(i, { bgColor: e.target.value })}
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none font-mono" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Enlace</label>
                      <input type="text" value={promo.link} onChange={e => updatePromo(i, { link: e.target.value })}
                        placeholder="/productos"
                        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </div>
                    <ImagePicker label="Imagen del producto (opcional)" purpose="banner" value={promo.imageUrl ?? ''} onChange={url => updatePromo(i, { imageUrl: url || null })} />
                    <button type="button" onClick={() => savePromo(i)} disabled={savingPro === i}
                      className="w-full flex items-center justify-center gap-2 bg-navy text-white text-xs font-bold py-2.5 rounded-xl hover:bg-navy/90 disabled:opacity-50 transition-colors">
                      {savingPro === i ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      Guardar oferta {i + 1}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ BENEFICIOS ═══════════════════════════════════════════════════════════ */}
      {tab === 'benefits' && (
        <div className="max-w-2xl">
          <div className="flex items-start gap-3 mb-5 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <ListChecks size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-blue-800">Barra de Beneficios</p>
              <p className="text-xs text-blue-600 mt-0.5">Los 4 íconos debajo del Hero (Envío rápido, Garantía, etc.). El ícono se asigna automáticamente por posición.</p>
            </div>
          </div>

          {loadingCfg ? (
            <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="space-y-3">
              {benefits.map((item, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-sm flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Título</label>
                      <input type="text" value={item.title}
                        onChange={e => setBenefits(bs => bs.map((b, j) => j === i ? { ...b, title: e.target.value } : b))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Descripción</label>
                      <input type="text" value={item.sub}
                        onChange={e => setBenefits(bs => bs.map((b, j) => j === i ? { ...b, sub: e.target.value } : b))}
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    </div>
                  </div>
                </div>
              ))}

              {cfgMsg && tab === 'benefits' && (
                <p className={`text-sm font-semibold ${cfgMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cfgMsg}</p>
              )}

              <button type="button"
                onClick={() => saveConfig('homepage_benefits', benefits, setSavingBenefits)}
                disabled={savingBenefits}
                className="flex items-center gap-2 bg-navy text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-navy/90 disabled:opacity-50 transition-colors"
              >
                {savingBenefits ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Guardar barra de beneficios
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ FLASH DEALS ═══════════════════════════════════════════════════════════ */}
      {tab === 'flash' && (
        <div className="max-w-md">
          <div className="flex items-start gap-3 mb-5 bg-amber-50 border border-amber-100 rounded-xl p-4">
            <Clock size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">Sección Flash Deals</p>
              <p className="text-xs text-amber-600 mt-0.5">El título del bloque de ofertas y la hora límite del contador regresivo.</p>
            </div>
          </div>

          {loadingCfg ? (
            <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Título de la sección</label>
                <input type="text" value={flash.title}
                  onChange={e => setFlash(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
                  placeholder="ej. Ofertas MundoTech" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Hora de expiración (0–23)</label>
                <div className="flex items-center gap-3">
                  <input type="number" min={0} max={23} value={flash.endHour}
                    onChange={e => setFlash(f => ({ ...f, endHour: Math.min(23, Math.max(0, Number(e.target.value))) }))}
                    className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 text-center font-bold" />
                  <span className="text-sm text-gray-500">:00 hrs (formato 24h)</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">El contador regresivo termina a las <strong>{flash.endHour}:00</strong> y se reinicia al día siguiente.</p>
              </div>

              {cfgMsg && tab === 'flash' && (
                <p className={`text-sm font-semibold ${cfgMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{cfgMsg}</p>
              )}

              <button type="button"
                onClick={() => saveConfig('homepage_flashdeals', flash, setSavingFlash)}
                disabled={savingFlash}
                className="flex items-center gap-2 bg-navy text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-navy/90 disabled:opacity-50 transition-colors"
              >
                {savingFlash ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                Guardar Flash Deals
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ ESTANTERÍAS DE PRODUCTOS ══════════════════════════════════════════════ */}
      {tab === 'shelves' && (
        <ShelvesEditor
          initial={shelves}
          loading={loadingCfg}
          onSaved={setShelves}
        />
      )}

      {/* ═══ ENVÍO GRATIS MRW ══════════════════════════════════════════════════════ */}
      {tab === 'freeShipping' && (
        <FreeShippingEditor
          initial={freeShipping}
          loading={loadingCfg}
          onSaved={setFreeShipping}
        />
      )}
    </div>
  );
}
