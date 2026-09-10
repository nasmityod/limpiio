'use client';

import { useState, useTransition } from 'react';
import {
  MapPin, Save, Loader2, Check, AlertCircle, Building2, Clock,
  Crosshair, Tag, Globe2, ExternalLink, Plus, Trash2,
} from 'lucide-react';
import { updateSeoLocal } from '@/app/actions/seoLocalActions';
import type { SeoLocal } from '@/lib/seo-local-schema';
import { SEO_DAYS, DAY_LABEL_ES } from '@/lib/seo-local-schema';

interface SeoLocalEditorProps {
  initial: SeoLocal;
}

const PAYMENT_OPTIONS = [
  'Cash', 'Efectivo USD/Bs.', 'Transferencia', 'Pago Móvil',
  'Binance Pay', 'Tarjeta', 'PayPal',
];

export default function SeoLocalEditor({ initial }: SeoLocalEditorProps) {
  const [data, setData]               = useState<SeoLocal>(initial);
  const [pending, startTransition]    = useTransition();
  const [feedback, setFeedback]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [errors, setErrors]           = useState<Record<string, string[]>>({});
  const [geoStatus, setGeoStatus]     = useState<'idle' | 'loading' | 'denied' | 'unavailable'>('idle');

  const set = <K extends keyof SeoLocal>(key: K, value: SeoLocal[K]) => {
    setData(d => ({ ...d, [key]: value }));
  };

  const handleSave = () => {
    setErrors({});
    startTransition(async () => {
      const res = await updateSeoLocal(data);
      if (res.success) {
        setFeedback({ type: 'success', msg: '✓ Cambios publicados. Datos vivos en la web.' });
        setTimeout(() => setFeedback(null), 3500);
      } else {
        setFeedback({ type: 'error', msg: res.message });
        if (res.errors) setErrors(res.errors);
      }
    });
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('unavailable');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set('geo', {
          latitude:  Number(pos.coords.latitude.toFixed(7)),
          longitude: Number(pos.coords.longitude.toFixed(7)),
        });
        setGeoStatus('idle');
      },
      (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const togglePayment = (method: string) => {
    const list = data.paymentAccepted;
    const next = list.includes(method) ? list.filter(m => m !== method) : [...list, method];
    set('paymentAccepted', next);
  };

  const addOpeningRow = () => {
    set('openingHours', [...data.openingHours, { days: ['Mon'], opens: '09:00', closes: '17:00' }]);
  };

  const removeOpeningRow = (idx: number) => {
    set('openingHours', data.openingHours.filter((_, i) => i !== idx));
  };

  const updateOpeningRow = (idx: number, patch: Partial<SeoLocal['openingHours'][number]>) => {
    set('openingHours', data.openingHours.map((row, i) => i === idx ? { ...row, ...patch } : row));
  };

  const toggleDay = (idx: number, day: typeof SEO_DAYS[number]) => {
    const row = data.openingHours[idx];
    const has = row.days.includes(day);
    const newDays = has ? row.days.filter(d => d !== day) : [...row.days, day];
    if (newDays.length === 0) return;
    updateOpeningRow(idx, { days: newDays });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-amber-50 text-navy flex items-center justify-center">
          <MapPin size={22} />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy">SEO Local</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Datos del negocio físico. Lo que aquí guardes alimenta el JSON-LD, Footer, página de tienda y Google.
          </p>
        </div>
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

      {/* Identidad y eslogan */}
      <Section icon={Tag} title="Identidad pública">
        <Field
          label="Nombre legal"
          value={data.legalName}
          onChange={v => set('legalName', v)}
          placeholder="Mundo Tech, C.A."
          error={errors.legalName}
        />
        <Field
          label="Eslogan"
          value={data.slogan}
          onChange={v => set('slogan', v)}
          placeholder="Conectados Contigo"
          hint="Aparece en el JSON-LD y en la página de la tienda."
          error={errors.slogan}
        />
      </Section>

      {/* Dirección */}
      <Section icon={Building2} title="Dirección física">
        <Field
          label="Dirección de calle"
          value={data.streetAddress}
          onChange={v => set('streetAddress', v)}
          placeholder="Carrera 21 con esquina calle 21, Centro"
          error={errors.streetAddress}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Ciudad"
            value={data.addressLocality}
            onChange={v => set('addressLocality', v)}
          />
          <Field
            label="Estado"
            value={data.addressRegion}
            onChange={v => set('addressRegion', v)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Código postal"
            value={data.postalCode}
            onChange={v => set('postalCode', v)}
          />
          <Field
            label="País (ISO 2 letras)"
            value={data.addressCountry}
            onChange={v => set('addressCountry', v.toUpperCase().slice(0, 2))}
            placeholder="VE"
          />
        </div>
      </Section>

      {/* Geolocalización */}
      <Section icon={Crosshair} title="Coordenadas GPS">
        <p className="text-xs text-gray-500 -mt-1">
          Mejora la precisión del PIN en Google Maps. Si abres este panel desde el celular en la tienda, usa <strong>Detectar mi ubicación</strong>.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Latitud"
            value={String(data.geo.latitude)}
            onChange={v => set('geo', { ...data.geo, latitude: parseFloat(v) || 0 })}
            type="number"
            step="any"
            inputMode="decimal"
          />
          <Field
            label="Longitud"
            value={String(data.geo.longitude)}
            onChange={v => set('geo', { ...data.geo, longitude: parseFloat(v) || 0 })}
            type="number"
            step="any"
            inputMode="decimal"
          />
        </div>
        <button
          type="button"
          onClick={requestGeolocation}
          disabled={geoStatus === 'loading'}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 bg-navy text-white text-sm font-semibold rounded-xl active:bg-navy/80 disabled:opacity-50"
        >
          {geoStatus === 'loading'
            ? <Loader2 size={16} className="animate-spin" />
            : <Crosshair size={16} />}
          Detectar mi ubicación
        </button>
        {geoStatus === 'denied' && (
          <p className="text-xs text-red-600">Permiso denegado. Habilita la geolocalización en el navegador.</p>
        )}
        {geoStatus === 'unavailable' && (
          <p className="text-xs text-red-600">No se pudo obtener la ubicación. Pegá las coordenadas manualmente.</p>
        )}
        <Field
          label="URL de Google Maps (ficha del negocio)"
          value={data.googleMapsUrl ?? ''}
          onChange={v => set('googleMapsUrl', v)}
          placeholder="https://maps.app.goo.gl/..."
          hint="Compartir → Copiar vínculo desde Google Maps."
          type="url"
        />
        <Field
          label="URL del iframe embebido"
          value={data.googleMapsEmbed ?? ''}
          onChange={v => set('googleMapsEmbed', v)}
          placeholder="https://www.google.com/maps/embed?pb=..."
          hint="Compartir → Insertar un mapa → solo el src del iframe."
          type="url"
        />
      </Section>

      {/* Horarios */}
      <Section icon={Clock} title="Horario de atención">
        {data.openingHours.length === 0 && (
          <p className="text-xs text-gray-500">Sin horarios configurados. Toca <strong>Agregar horario</strong>.</p>
        )}
        <div className="space-y-3">
          {data.openingHours.map((row, idx) => (
            <div key={idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
              <div className="flex flex-wrap gap-1">
                {SEO_DAYS.map(d => {
                  const active = row.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(idx, d)}
                      className={`min-w-[44px] min-h-[36px] px-2 rounded-lg text-xs font-bold transition ${
                        active
                          ? 'bg-navy text-white'
                          : 'bg-white border border-gray-200 text-gray-500 active:bg-gray-100'
                      }`}
                    >
                      {DAY_LABEL_ES[d]}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={row.opens}
                  onChange={e => updateOpeningRow(idx, { opens: e.target.value })}
                  className="flex-1 min-h-[44px] px-3 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="time"
                  value={row.closes}
                  onChange={e => updateOpeningRow(idx, { closes: e.target.value })}
                  className="flex-1 min-h-[44px] px-3 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
                />
                <button
                  type="button"
                  onClick={() => removeOpeningRow(idx)}
                  aria-label="Eliminar horario"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-red-600 active:bg-red-50 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addOpeningRow}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 bg-white border border-dashed border-gray-300 text-gray-600 text-sm font-semibold rounded-xl active:bg-gray-50"
        >
          <Plus size={16} /> Agregar horario
        </button>
      </Section>

      {/* Métodos de pago */}
      <Section icon={Globe2} title="Métodos de pago aceptados">
        <p className="text-xs text-gray-500 -mt-1">Toca para activar/desactivar. Aparecerán listados en el rich-snippet de Google.</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_OPTIONS.map(method => {
            const active = data.paymentAccepted.includes(method);
            return (
              <button
                key={method}
                type="button"
                onClick={() => togglePayment(method)}
                className={`min-h-[40px] px-3 text-xs font-bold rounded-full border transition ${
                  active
                    ? 'bg-brand-yellow border-yellow-400 text-navy'
                    : 'bg-white border-gray-200 text-gray-500 active:bg-gray-100'
                }`}
              >
                {method}
              </button>
            );
          })}
        </div>
        <Field
          label="Rango de precios (Google)"
          value={data.priceRange}
          onChange={v => set('priceRange', v)}
          placeholder="$$"
          hint="Símbolos $ ó $$ ó $$$. Indicador de poder adquisitivo."
        />
      </Section>

      {/* Otros */}
      <Section icon={ExternalLink} title="Redes y contacto extra">
        <Field
          label="WhatsApp Business"
          value={data.whatsapp ?? ''}
          onChange={v => set('whatsapp', v)}
          placeholder="+58-412-1471338"
          type="tel"
        />
        <Field
          label="TikTok"
          value={data.tiktok ?? ''}
          onChange={v => set('tiktok', v)}
          placeholder="https://www.tiktok.com/@mundotech"
          type="url"
        />
      </Section>

      {/* Submit sticky */}
      <div className="sticky bottom-20 md:bottom-4 z-20 -mx-3 sm:-mx-5 lg:-mx-8 px-3 sm:px-5 lg:px-8 py-3 bg-gradient-to-t from-white via-white to-transparent">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 bg-brand-yellow border border-yellow-400 text-navy font-black uppercase tracking-wide rounded-2xl shadow-lg active:bg-yellow-300 disabled:opacity-60"
        >
          {pending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {pending ? 'Guardando…' : 'Guardar y publicar'}
        </button>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <header className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
        <Icon size={16} className="text-navy" />
        <h2 className="text-sm font-bold text-navy">{title}</h2>
      </header>
      <div className="p-4 space-y-3.5">{children}</div>
    </section>
  );
}

function Field({
  label, value, onChange, placeholder, hint, type = 'text', step, inputMode, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  step?: string;
  inputMode?: 'numeric' | 'decimal' | 'text' | 'url' | 'tel' | 'email';
  error?: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        step={step}
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full min-h-[48px] px-3.5 py-2 border rounded-xl bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy ${
          error?.length ? 'border-red-300 bg-red-50' : 'border-gray-200'
        }`}
      />
      {hint && !error?.length && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
      {error?.length && <p className="text-[11px] text-red-600 mt-1 font-medium">{error[0]}</p>}
    </div>
  );
}
