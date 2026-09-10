'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Palette, Check, AlertCircle, Loader2, Power, Plus, Trash2,
  ShieldCheck, Truck, Wallet, Store, Clock, MessageCircle, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { getSiteContent, updateSiteContent } from '@/app/actions/siteContentActions';
import { DEFAULT_SITE_CONTENT, type SiteContent, type TrustIcon } from '@/lib/site-content-schema';
import { whatsappHref } from '@/lib/mundotech-social';
import PhotoUploader from '@/components/admin/PhotoUploader';

const ICON_OPTIONS: { value: TrustIcon; label: string; icon: LucideIcon }[] = [
  { value: 'shield',   label: 'Escudo (garantía)',  icon: ShieldCheck },
  { value: 'truck',    label: 'Camión (envíos)',    icon: Truck },
  { value: 'wallet',   label: 'Pagos',              icon: Wallet },
  { value: 'store',    label: 'Tienda física',      icon: Store },
  { value: 'clock',    label: 'Horario / rapidez',  icon: Clock },
  { value: 'whatsapp', label: 'WhatsApp / chat',    icon: MessageCircle },
  { value: 'sparkles', label: 'Novedad',            icon: Sparkles },
];

const inputClass =
  'w-full min-h-[48px] px-3.5 py-2 border border-gray-200 rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy';
const labelClass = 'block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5';

function SectionCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <header className="px-4 sm:px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
        <h2 className="text-sm font-black text-navy">{title}</h2>
        <p className="text-[11.5px] text-gray-500 mt-0.5">{desc}</p>
      </header>
      <div className="p-4 sm:p-5 space-y-4">{children}</div>
    </section>
  );
}

function Toggle({
  on,
  onLabel,
  offLabel,
  onClick,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-[48px] rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 ${
        on
          ? 'bg-green-50 border-green-300 text-green-800'
          : 'bg-white border-gray-200 text-gray-500 active:bg-gray-100'
      }`}
    >
      <Power size={14} /> {on ? onLabel : offLabel}
    </button>
  );
}

export default function AdminPersonalizarPage() {
  const [data, setData] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    getSiteContent().then((c) => {
      setData(c);
      setLoading(false);
    });
  }, []);

  const flash = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const save = () => {
    startTransition(async () => {
      const res = await updateSiteContent(data);
      if (res.success) flash('success', 'Personalización guardada. El sitio ya muestra los cambios.');
      else flash('error', res.message);
    });
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-400 text-sm">Cargando…</div>;
  }

  const { heroFallback, brandStrip, whatsapp, productTrust, popup } = data;

  return (
    <div className="space-y-4 max-w-3xl pb-24">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-amber-50 text-navy flex items-center justify-center">
          <Palette size={22} />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy">Personalizar el sitio</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Los textos y elementos de marca que ven tus clientes — sin tocar código.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? <Check size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* ── Hero de respaldo ─────────────────────────────────────────────── */}
      <SectionCard
        title="Hero de respaldo"
        desc="Se muestra en la portada cuando no tienes banners activos en Banners → hero. Si subes banners, ellos mandan."
      >
        {/* Vista previa */}
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <div className="relative bg-black px-5 py-7">
            {heroFallback.badge.trim() ? (
              <span className="inline-block rounded-md bg-brand-yellow px-2 py-0.5 text-[10px] font-bold text-navy mb-2">
                {heroFallback.badge}
              </span>
            ) : null}
            <p className="text-xl font-black text-white leading-tight">
              {heroFallback.title || 'Título del hero'}
            </p>
            {heroFallback.subtitle.trim() ? (
              <p className="mt-1.5 text-[12px] text-white/75 max-w-md">{heroFallback.subtitle}</p>
            ) : null}
            <span className="mt-3 inline-block rounded-lg bg-brand-yellow px-3 py-1.5 text-[11px] font-black text-navy">
              {heroFallback.ctaText || 'Explorar todo el catálogo'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Etiqueta (badge)</label>
            <input
              type="text" maxLength={60} className={inputClass}
              value={heroFallback.badge}
              onChange={(e) => setData((d) => ({ ...d, heroFallback: { ...d.heroFallback, badge: e.target.value } }))}
            />
          </div>
          <div>
            <label className={labelClass}>Título</label>
            <input
              type="text" maxLength={90} className={inputClass}
              value={heroFallback.title}
              onChange={(e) => setData((d) => ({ ...d, heroFallback: { ...d.heroFallback, title: e.target.value } }))}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Subtítulo</label>
          <textarea
            rows={3} maxLength={240}
            className={`${inputClass} resize-none`}
            value={heroFallback.subtitle}
            onChange={(e) => setData((d) => ({ ...d, heroFallback: { ...d.heroFallback, subtitle: e.target.value } }))}
          />
          <p className="text-[11px] text-gray-400 mt-1">{heroFallback.subtitle.length}/240</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Texto del botón</label>
            <input
              type="text" maxLength={40} className={inputClass}
              value={heroFallback.ctaText}
              onChange={(e) => setData((d) => ({ ...d, heroFallback: { ...d.heroFallback, ctaText: e.target.value } }))}
            />
          </div>
          <div>
            <label className={labelClass}>Enlace del botón</label>
            <input
              type="text" maxLength={300} className={inputClass} placeholder="/productos"
              value={heroFallback.ctaLink}
              onChange={(e) => setData((d) => ({ ...d, heroFallback: { ...d.heroFallback, ctaLink: e.target.value } }))}
            />
          </div>
        </div>
        <PhotoUploader
          value={heroFallback.imageUrl || null}
          onChange={(url) => setData((d) => ({ ...d, heroFallback: { ...d.heroFallback, imageUrl: url ?? '' } }))}
          purpose="banner"
          label="Foto de fondo (opcional)"
          hint="Ideal: una foto real de la tienda o de productos. Sin foto, se usa el panel negro con las trazas del logo."
        />
      </SectionCard>

      {/* ── Franja de marca ─────────────────────────────────────────────── */}
      <SectionCard
        title="Franja de marca"
        desc="La línea con tu slogan que aparece pegada al hero, siempre visible."
      >
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <div className="bg-black border-t-2 border-brand-yellow/60 px-4 py-2.5 text-center">
            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-yellow">
              {brandStrip.slogan || 'CONECTADOS CONTIGO'}
            </span>
            {brandStrip.note.trim() ? (
              <span className="ml-2 text-[11px] text-white/60">· {brandStrip.note}</span>
            ) : null}
          </div>
        </div>
        <Toggle
          on={brandStrip.enabled}
          onLabel="Visible en el sitio"
          offLabel="Oculta"
          onClick={() => setData((d) => ({ ...d, brandStrip: { ...d.brandStrip, enabled: !d.brandStrip.enabled } }))}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Slogan</label>
            <input
              type="text" maxLength={60} className={inputClass}
              value={brandStrip.slogan}
              onChange={(e) => setData((d) => ({ ...d, brandStrip: { ...d.brandStrip, slogan: e.target.value } }))}
            />
          </div>
          <div>
            <label className={labelClass}>Nota (dirección, teléfono…)</label>
            <input
              type="text" maxLength={140} className={inputClass}
              value={brandStrip.note}
              onChange={(e) => setData((d) => ({ ...d, brandStrip: { ...d.brandStrip, note: e.target.value } }))}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── WhatsApp ─────────────────────────────────────────────────────── */}
      <SectionCard
        title="Botón flotante de WhatsApp"
        desc="El botón verde que acompaña al cliente en todas las páginas (excepto checkout y admin)."
      >
        <Toggle
          on={whatsapp.enabled}
          onLabel="Activo en el sitio"
          offLabel="Apagado"
          onClick={() => setData((d) => ({ ...d, whatsapp: { ...d.whatsapp, enabled: !d.whatsapp.enabled } }))}
        />
        <div>
          <label className={labelClass}>Número (formato local)</label>
          <input
            type="text" maxLength={20} className={inputClass} placeholder="0412-1471338"
            value={whatsapp.phone}
            onChange={(e) => setData((d) => ({ ...d, whatsapp: { ...d.whatsapp, phone: e.target.value } }))}
          />
        </div>
        <div>
          <label className={labelClass}>Mensaje precargado</label>
          <textarea
            rows={2} maxLength={300}
            className={`${inputClass} resize-none`}
            value={whatsapp.message}
            onChange={(e) => setData((d) => ({ ...d, whatsapp: { ...d.whatsapp, message: e.target.value } }))}
          />
        </div>
        {whatsapp.phone.trim() ? (
          <a
            href={whatsappHref(whatsapp.phone, whatsapp.message)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-green-700 underline underline-offset-2"
          >
            <MessageCircle size={14} /> Probar el enlace tal como lo verá el cliente
          </a>
        ) : null}
      </SectionCard>

      {/* ── Badges de confianza ──────────────────────────────────────────── */}
      <SectionCard
        title="Badges de confianza (ficha de producto)"
        desc="Los 3 sellos bajo el botón de compra. Usa datos concretos: tiempos, métodos de pago, garantía."
      >
        <div className="space-y-3">
          {productTrust.map((item, i) => {
            const IconPreview = ICON_OPTIONS.find((o) => o.value === item.icon)?.icon ?? ShieldCheck;
            return (
              <div key={i} className="rounded-xl border border-gray-200 p-3.5 space-y-3 bg-gray-50/40">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-navy">
                    <span className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                      <IconPreview size={15} />
                    </span>
                    Badge {i + 1}
                  </span>
                  {productTrust.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Eliminar badge ${i + 1}`}
                      onClick={() =>
                        setData((d) => ({ ...d, productTrust: d.productTrust.filter((_, idx) => idx !== i) }))
                      }
                      className="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Icono</label>
                    <select
                      className={inputClass}
                      value={item.icon}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          productTrust: d.productTrust.map((t, idx) =>
                            idx === i ? { ...t, icon: e.target.value as TrustIcon } : t,
                          ),
                        }))
                      }
                    >
                      {ICON_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Título</label>
                    <input
                      type="text" maxLength={60} className={inputClass}
                      value={item.title}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          productTrust: d.productTrust.map((t, idx) =>
                            idx === i ? { ...t, title: e.target.value } : t,
                          ),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Detalle</label>
                    <input
                      type="text" maxLength={120} className={inputClass}
                      value={item.sub}
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          productTrust: d.productTrust.map((t, idx) =>
                            idx === i ? { ...t, sub: e.target.value } : t,
                          ),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {productTrust.length < 4 && (
          <button
            type="button"
            onClick={() =>
              setData((d) => ({
                ...d,
                productTrust: [...d.productTrust, { icon: 'sparkles', title: '', sub: '' }],
              }))
            }
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-navy hover:underline"
          >
            <Plus size={14} /> Añadir badge
          </button>
        )}
      </SectionCard>

      {/* ── Popup promocional ────────────────────────────────────────────── */}
      <SectionCard
        title="Popup promocional"
        desc="Una tarjeta discreta en la esquina para anunciar ofertas. Respeta al cliente: no reaparece hasta pasar los días configurados."
      >
        <Toggle
          on={popup.enabled}
          onLabel="Activo en el sitio"
          offLabel="Apagado"
          onClick={() => setData((d) => ({ ...d, popup: { ...d.popup, enabled: !d.popup.enabled } }))}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Etiqueta</label>
            <input
              type="text" maxLength={40} className={inputClass} placeholder="Solo esta semana"
              value={popup.badge}
              onChange={(e) => setData((d) => ({ ...d, popup: { ...d.popup, badge: e.target.value } }))}
            />
          </div>
          <div>
            <label className={labelClass}>Título</label>
            <input
              type="text" maxLength={90} className={inputClass}
              value={popup.title}
              onChange={(e) => setData((d) => ({ ...d, popup: { ...d.popup, title: e.target.value } }))}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Texto</label>
          <textarea
            rows={2} maxLength={240}
            className={`${inputClass} resize-none`}
            value={popup.text}
            onChange={(e) => setData((d) => ({ ...d, popup: { ...d.popup, text: e.target.value } }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Texto del botón</label>
            <input
              type="text" maxLength={40} className={inputClass}
              value={popup.ctaText}
              onChange={(e) => setData((d) => ({ ...d, popup: { ...d.popup, ctaText: e.target.value } }))}
            />
          </div>
          <div>
            <label className={labelClass}>Enlace del botón</label>
            <input
              type="text" maxLength={300} className={inputClass} placeholder="/productos"
              value={popup.ctaLink}
              onChange={(e) => setData((d) => ({ ...d, popup: { ...d.popup, ctaLink: e.target.value } }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Aparece a los (segundos)</label>
            <input
              type="number" min={0} max={120} className={inputClass}
              value={popup.delaySeconds}
              onChange={(e) =>
                setData((d) => ({ ...d, popup: { ...d.popup, delaySeconds: Math.max(0, Math.min(120, Number(e.target.value) || 0)) } }))
              }
            />
          </div>
          <div>
            <label className={labelClass}>No repetir por (días)</label>
            <input
              type="number" min={1} max={90} className={inputClass}
              value={popup.frequencyDays}
              onChange={(e) =>
                setData((d) => ({ ...d, popup: { ...d.popup, frequencyDays: Math.max(1, Math.min(90, Number(e.target.value) || 1)) } }))
              }
            />
          </div>
        </div>
        {/* FASE 3: solo ofertas reales con fecha de fin — vencida, el popup se oculta solo. */}
        <div>
          <label className={labelClass}>La promo termina el (opcional)</label>
          <input
            type="date" className={inputClass}
            value={popup.endsAt ?? ''}
            onChange={(e) =>
              setData((d) => ({ ...d, popup: { ...d.popup, endsAt: e.target.value } }))
            }
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Al pasar esta fecha el popup deja de mostrarse automáticamente. Déjalo vacío si la promo no vence.
          </p>
        </div>
        <PhotoUploader
          value={popup.imageUrl || null}
          onChange={(url) => setData((d) => ({ ...d, popup: { ...d.popup, imageUrl: url ?? '' } }))}
          purpose="banner"
          label="Imagen superior (opcional)"
          hint="Foto del producto en oferta. Sin imagen, el popup es solo texto — también funciona bien."
        />
      </SectionCard>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 bg-brand-yellow border border-yellow-400 text-navy text-sm font-black uppercase rounded-xl active:bg-yellow-300 disabled:opacity-60"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : null}
        Guardar personalización
      </button>
    </div>
  );
}
