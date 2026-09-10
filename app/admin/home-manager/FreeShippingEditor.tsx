'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Truck } from 'lucide-react';
import {
  DEFAULT_HOMEPAGE_FREE_SHIPPING,
  type HomepageFreeShippingConfig,
} from '@/lib/homepage-config';
import HomeFreeShippingStrip from '@/app/components/HomeFreeShippingStrip';

function cloneFreeShipping(
  config: HomepageFreeShippingConfig,
): HomepageFreeShippingConfig {
  return structuredClone(config);
}

export default function FreeShippingEditor({
  initial,
  loading,
  onSaved,
}: {
  initial: HomepageFreeShippingConfig | null;
  loading: boolean;
  onSaved?: (config: HomepageFreeShippingConfig) => void;
}) {
  const [draft, setDraft] = useState<HomepageFreeShippingConfig>(() =>
    cloneFreeShipping(initial ?? DEFAULT_HOMEPAGE_FREE_SHIPPING),
  );
  const [saved, setSaved] = useState<HomepageFreeShippingConfig>(() =>
    cloneFreeShipping(initial ?? DEFAULT_HOMEPAGE_FREE_SHIPPING),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!initial) return;
    setDraft(cloneFreeShipping(initial));
    setSaved(cloneFreeShipping(initial));
  }, [initial]);

  const dirty = useMemo(
    () =>
      draft.enabled !== saved.enabled ||
      draft.text.trim() !== saved.text.trim(),
    [draft, saved],
  );

  const textError =
    draft.text.trim().length === 0
      ? 'El texto no puede estar vacío.'
      : draft.text.trim().length > 80
        ? 'Máximo 80 caracteres.'
        : null;

  const save = async () => {
    if (textError) {
      setStatus('error');
      setStatusMsg(textError);
      return;
    }
    setSaving(true);
    setStatus('idle');
    setStatusMsg('');
    try {
      const payload: HomepageFreeShippingConfig = {
        enabled: draft.enabled,
        text: draft.text.trim(),
      };
      const r = await fetch('/api/config/homepage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'homepage_free_shipping',
          value: payload,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setStatus('error');
        setStatusMsg(d.error ?? 'Error al guardar.');
        return;
      }
      const snapshot = cloneFreeShipping(payload);
      setDraft(cloneFreeShipping(snapshot));
      setSaved(cloneFreeShipping(snapshot));
      onSaved?.(cloneFreeShipping(snapshot));
      setStatus('saved');
      setStatusMsg('Configuración de envío gratis guardada.');
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
    <div className="max-w-xl space-y-5">
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
        <Truck size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold text-amber-900">Envío gratis MRW</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Se aplica únicamente a productos marcados con envío gratis.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          aria-label={
            draft.enabled
              ? 'Desactivar franja de envío gratis MRW'
              : 'Activar franja de envío gratis MRW'
          }
          onClick={() => {
            setDraft((d) => ({ ...d, enabled: !d.enabled }));
            setStatus('idle');
          }}
          className={`min-h-[44px] px-4 rounded-lg text-xs font-bold ${
            draft.enabled
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {draft.enabled ? 'Franja activa' : 'Franja inactiva'}
        </button>

        <div>
          <label
            htmlFor="mrw-text"
            className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide"
          >
            Texto principal
          </label>
          <input
            id="mrw-text"
            type="text"
            maxLength={80}
            value={draft.text}
            onChange={(e) => {
              setDraft((d) => ({ ...d, text: e.target.value }));
              setStatus('idle');
            }}
            aria-invalid={Boolean(textError)}
            aria-describedby={textError ? 'mrw-text-error' : 'mrw-text-help'}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20"
          />
          <p id="mrw-text-help" className="text-[11px] text-gray-500 mt-1">
            Se aplica únicamente a productos marcados con envío gratis.
          </p>
          {textError ? (
            <p id="mrw-text-error" className="text-xs text-red-600 mt-1" role="alert">
              {textError}
            </p>
          ) : null}
        </div>

        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
            Vista previa
          </p>
          {draft.enabled ? (
            <HomeFreeShippingStrip text={draft.text.trim() || 'Envío gratis por MRW'} />
          ) : (
            <p className="text-xs text-gray-500">La franja está desactivada.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty || Boolean(textError)}
            className="flex items-center gap-2 bg-navy text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-navy/90 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Guardar
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
            <span className="text-sm font-semibold text-red-600">{statusMsg}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
