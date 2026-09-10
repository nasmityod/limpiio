'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Store, Phone, MessageCircle, Share2, Truck, Printer, Plus, Trash2,
} from 'lucide-react';
import {
  updateGeneralStoreSettings,
  updateShippingEstimates,
} from '@/app/actions/settingsActions';
import type { GeneralSettingsDto } from '@/lib/settings-api-schemas';
import type { ShippingEstimates } from '@/lib/shipping-estimates';
import { mrwOffices } from '@/lib/mrw-offices';
import {
  normalizeWhatsAppPhone,
  isValidWhatsAppPhone,
  WHATSAPP_PHONE_INVALID_MESSAGE,
} from '@/lib/whatsapp-phone';
import {
  SectionCard,
  Field,
  HelpCallout,
  StickySaveBar,
  CollapsibleSection,
  type SaveBarStatus,
} from '@/app/admin/settings/components/SettingsUI';

const VE_STATES = Object.keys(mrwOffices).sort();

const EMPTY_ESTIMATES: ShippingEstimates = {
  tienda: '',
  mrw: '',
  zoom: '',
  tealca: '',
  states: [],
};

const LABEL_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'thermal', label: 'Térmica 100×150 mm (4×6")', w: 100, h: 150 },
  { id: 'letter', label: 'Hoja Carta 216×279 mm', w: 216, h: 279 },
  { id: 'a4', label: 'Hoja A4 210×297 mm', w: 210, h: 297 },
];

function snapshotJson(value: unknown): string {
  return JSON.stringify(value);
}

export function StoreSettingsPanel({
  initialGeneral,
  initialEstimates,
  onDirtyChange,
}: {
  initialGeneral: GeneralSettingsDto;
  initialEstimates: ShippingEstimates;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const [generalSettings, setGeneralSettings] = useState(initialGeneral);
  const [generalSnapshot, setGeneralSnapshot] = useState(snapshotJson(initialGeneral));
  const [estimates, setEstimates] = useState(initialEstimates ?? EMPTY_ESTIMATES);
  const [estimatesSnapshot, setEstimatesSnapshot] = useState(
    snapshotJson(initialEstimates ?? EMPTY_ESTIMATES),
  );

  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savedGeneral, setSavedGeneral] = useState(false);
  const [isSavingEstimates, startEstimatesTransition] = useTransition();
  const [savedEstimates, setSavedEstimates] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [estimatesError, setEstimatesError] = useState<string | null>(null);

  const dirtyGeneral = snapshotJson(generalSettings) !== generalSnapshot;
  const dirtyEstimates = snapshotJson(estimates) !== estimatesSnapshot;
  const dirty = dirtyGeneral || dirtyEstimates;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const whatsappPhoneNormalized = normalizeWhatsAppPhone(generalSettings.whatsappOrderPhone ?? '');
  const whatsappPhoneValid =
    whatsappPhoneNormalized === '' || isValidWhatsAppPhone(whatsappPhoneNormalized);

  const socialsHaveContent = Boolean(
    (generalSettings.instagram ?? '').trim() || (generalSettings.facebook ?? '').trim(),
  );

  const curLabelW = Number(generalSettings.labelWidthMm) || 100;
  const curLabelH = Number(generalSettings.labelHeightMm) || 150;
  const activeLabelPreset =
    LABEL_PRESETS.find((p) => p.w === curLabelW && p.h === curLabelH)?.id ?? 'custom';

  const setGeneral = (path: string[], value: string) => {
    setGeneralSettings((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as GeneralSettingsDto;
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]!] as Record<string, unknown>;
      obj[path[path.length - 1]!] = value;
      return next;
    });
    setSavedGeneral(false);
  };

  const fieldError = (path: string) => fieldErrors[path];

  const focusFirstError = () => {
    const el = panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSaveGeneral = async () => {
    if (!whatsappPhoneValid) {
      setSaveError('Algunos campos no son válidos. Revisa los marcados en rojo.');
      setFieldErrors({ whatsappOrderPhone: WHATSAPP_PHONE_INVALID_MESSAGE });
      queueMicrotask(focusFirstError);
      return;
    }
    setSavingGeneral(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const result = await updateGeneralStoreSettings(generalSettings);
      if (result.success) {
        const next = result.data ?? generalSettings;
        setGeneralSettings(next);
        setGeneralSnapshot(snapshotJson(next));
        setSavedGeneral(true);
        setTimeout(() => setSavedGeneral(false), 3000);
        router.refresh();
      } else {
        setSaveError(result.message);
        if (result.errors) {
          const flat: Record<string, string> = {};
          for (const [path, msgs] of Object.entries(result.errors)) {
            if (msgs[0]) flat[path] = msgs[0];
          }
          setFieldErrors(flat);
          queueMicrotask(focusFirstError);
        }
      }
    } catch (err) {
      console.error('[admin/settings] error guardando general:', err);
      setSaveError('Error de conexión. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSaveEstimates = () => {
    setEstimatesError(null);
    startEstimatesTransition(async () => {
      const cleaned: ShippingEstimates = {
        ...estimates,
        states: estimates.states.filter((s) => s.state.trim() && s.note.trim()),
      };
      const result = await updateShippingEstimates(cleaned);
      if (result.success && result.data) {
        setEstimates(result.data);
        setEstimatesSnapshot(snapshotJson(result.data));
        setSavedEstimates(true);
        setTimeout(() => setSavedEstimates(false), 3000);
        router.refresh();
      } else {
        setEstimatesError(result.message);
      }
    });
  };

  const saveBarStatus: SaveBarStatus = useMemo(() => {
    if (savingGeneral || isSavingEstimates) return 'saving';
    if (saveError || estimatesError) return 'error';
    if (dirty) return 'dirty';
    if (savedGeneral || savedEstimates) return 'saved';
    return 'idle';
  }, [
    savingGeneral,
    isSavingEstimates,
    saveError,
    estimatesError,
    dirty,
    savedGeneral,
    savedEstimates,
  ]);

  const bothDirty = dirtyGeneral && dirtyEstimates;
  const onlyGeneral = dirtyGeneral && !dirtyEstimates;
  const onlyEstimates = dirtyEstimates && !dirtyGeneral;

  return (
    <div ref={panelRef} className="space-y-6 pb-24 max-w-3xl">
      <HelpCallout>
        Configura los datos públicos de MundoTech, el WhatsApp de pedidos, las condiciones de envío
        y el formato de impresión.
      </HelpCallout>

      <SectionCard title="Identidad de la tienda" icon={Store}>
        <Field
          label="Nombre de la tienda"
          value={generalSettings.storeName}
          onChange={(v) => setGeneral(['storeName'], v)}
          placeholder="MundoTech"
          error={fieldError('storeName')}
        />
        <Field
          label="Eslogan"
          value={generalSettings.tagline ?? ''}
          onChange={(v) => setGeneral(['tagline'], v)}
          placeholder="Tu tienda de tecnología en Venezuela."
        />
        <Field
          label="Dirección"
          value={generalSettings.address ?? ''}
          onChange={(v) => setGeneral(['address'], v)}
          placeholder="Barquisimeto, Lara — Venezuela"
        />
      </SectionCard>

      <SectionCard title="Contacto y pedidos" icon={Phone}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Teléfono principal"
            value={generalSettings.phone}
            onChange={(v) => setGeneral(['phone'], v)}
            type="tel"
            placeholder="0412-1471338"
            error={fieldError('phone')}
          />
          <Field
            label="Teléfono secundario"
            value={generalSettings.phone2 ?? ''}
            onChange={(v) => setGeneral(['phone2'], v)}
            type="tel"
            placeholder="0414-5709470"
          />
          <Field
            label="Correo electrónico"
            value={generalSettings.email}
            onChange={(v) => setGeneral(['email'], v)}
            type="email"
            placeholder="ventas@mundotechve.com"
            error={fieldError('email')}
          />
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700">
              <MessageCircle size={15} className="text-green-600" aria-hidden />
              WhatsApp de pedidos
            </div>
            <Field
              label="Número de WhatsApp para pedidos"
              value={generalSettings.whatsappOrderPhone ?? ''}
              onChange={(v) => setGeneral(['whatsappOrderPhone'], v)}
              type="tel"
              placeholder="0426-1234567"
              error={
                fieldError('whatsappOrderPhone') ??
                ((generalSettings.whatsappOrderPhone ?? '').trim() && !whatsappPhoneValid
                  ? WHATSAPP_PHONE_INVALID_MESSAGE
                  : undefined)
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              Formato permitido: 0426-1234567, +58 426-1234567 o 584261234567. Se guarda en formato
              internacional.
            </p>
            {(generalSettings.whatsappOrderPhone ?? '').trim() && whatsappPhoneValid && (
              <p className="text-xs text-gray-500 mt-1">
                Número normalizado: <span className="font-mono">{whatsappPhoneNormalized}</span>
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <CollapsibleSection
        title="Redes sociales"
        defaultOpen={socialsHaveContent}
        summary={
          socialsHaveContent
            ? 'Instagram y/o Facebook configurados'
            : 'Opcional — aparecen en el pie de la tienda'
        }
        badge={
          <span className="inline-flex text-slate-400" aria-hidden>
            <Share2 size={14} />
          </span>
        }
      >
        <Field
          label="Instagram"
          value={generalSettings.instagram ?? ''}
          onChange={(v) => setGeneral(['instagram'], v)}
          type="url"
          placeholder="https://instagram.com/mundotech"
        />
        <Field
          label="Facebook"
          value={generalSettings.facebook ?? ''}
          onChange={(v) => setGeneral(['facebook'], v)}
          type="url"
          placeholder="https://facebook.com/mundotech"
        />
      </CollapsibleSection>

      <SectionCard title="Envíos y retiro" icon={Truck}>
        <HelpCallout>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <strong>Retiro en tienda:</strong> el cliente paga en web y retira en MundoTech.
            </li>
            <li>
              <strong>MRW:</strong> puede ser gratis si todos los productos califican.
            </li>
            <li>
              <strong>ZOOM y TEALCA:</strong> cobro a destino.
            </li>
          </ul>
        </HelpCallout>

        <div>
          <h3 className="text-sm font-semibold text-navy mb-3">Mensajes de tiempo estimado</h3>
          <div className="space-y-3">
            <Field
              label="Retiro en tienda"
              value={estimates.tienda}
              onChange={(v) => {
                setEstimates((p) => ({ ...p, tienda: v }));
                setSavedEstimates(false);
              }}
              placeholder="Listo el mismo día · te avisamos por WhatsApp"
            />
            <Field
              label="MRW"
              value={estimates.mrw}
              onChange={(v) => {
                setEstimates((p) => ({ ...p, mrw: v }));
                setSavedEstimates(false);
              }}
              placeholder="2–4 días hábiles · envío gratis si todos los productos califican; si no, cobro a destino"
            />
            <Field
              label="ZOOM"
              value={estimates.zoom}
              onChange={(v) => {
                setEstimates((p) => ({ ...p, zoom: v }));
                setSavedEstimates(false);
              }}
              placeholder="2–5 días hábiles · cobro a destino"
            />
            <Field
              label="TEALCA"
              value={estimates.tealca}
              onChange={(v) => {
                setEstimates((p) => ({ ...p, tealca: v }));
                setSavedEstimates(false);
              }}
              placeholder="2–5 días hábiles · cobro a destino"
            />
          </div>
        </div>

        <CollapsibleSection
          title="Excepciones por estado"
          defaultOpen={false}
          summary="Usa esta opción solo si un estado tiene un tiempo de entrega diferente."
        >
          <div className="space-y-2">
            {estimates.states.map((row, i) => (
              <div key={i} className="flex gap-2 items-start">
                <select
                  value={row.state}
                  onChange={(e) => {
                    setEstimates((p) => ({
                      ...p,
                      states: p.states.map((s, j) =>
                        j === i ? { ...s, state: e.target.value } : s,
                      ),
                    }));
                    setSavedEstimates(false);
                  }}
                  className="w-[38%] px-2 py-2 min-h-[48px] rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                  aria-label="Estado"
                >
                  <option value="">Estado…</option>
                  {VE_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={row.note}
                  onChange={(e) => {
                    setEstimates((p) => ({
                      ...p,
                      states: p.states.map((s, j) =>
                        j === i ? { ...s, note: e.target.value } : s,
                      ),
                    }));
                    setSavedEstimates(false);
                  }}
                  placeholder="1–2 días hábiles"
                  className="flex-1 px-3 py-2 min-h-[48px] rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
                  aria-label="Estimado para el estado"
                />
                <button
                  type="button"
                  onClick={() => {
                    setEstimates((p) => ({
                      ...p,
                      states: p.states.filter((_, j) => j !== i),
                    }));
                    setSavedEstimates(false);
                  }}
                  className="min-w-[44px] min-h-[48px] flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                  aria-label="Quitar excepción"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setEstimates((p) => ({
                ...p,
                states: [...p.states, { state: '', note: '' }],
              }));
              setSavedEstimates(false);
            }}
            disabled={estimates.states.length >= 30}
            className="mt-2 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-gray-200 text-sm font-semibold text-navy hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus size={15} /> Agregar estado
          </button>
        </CollapsibleSection>
      </SectionCard>

      <CollapsibleSection
        title="Impresión de etiquetas — avanzado"
        defaultOpen={false}
        summary="Tamaño de etiqueta para impresión"
        badge={
          <span className="inline-flex text-slate-400" aria-hidden>
            <Printer size={14} />
          </span>
        }
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tamaño rápido</label>
          <select
            value={activeLabelPreset}
            onChange={(e) => {
              const p = LABEL_PRESETS.find((x) => x.id === e.target.value);
              if (p) {
                setGeneral(['labelWidthMm'], String(p.w));
                setGeneral(['labelHeightMm'], String(p.h));
              }
            }}
            className="w-full px-3 py-2 min-h-[48px] border border-gray-200 bg-gray-50 text-sm rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
          >
            {LABEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Field
            label="Ancho (mm)"
            type="number"
            value={String(generalSettings.labelWidthMm ?? '')}
            onChange={(v) => setGeneral(['labelWidthMm'], v)}
            placeholder="100"
          />
          <Field
            label="Alto (mm)"
            type="number"
            value={String(generalSettings.labelHeightMm ?? '')}
            onChange={(v) => setGeneral(['labelHeightMm'], v)}
            placeholder="150"
          />
        </div>
        <p className="text-xs text-gray-500">
          Presets: Térmica 100×150, Carta, A4 o Personalizado. En hoja normal la etiqueta queda
          compacta arriba a la izquierda.
        </p>
      </CollapsibleSection>

      <StickySaveBar
        status={saveBarStatus}
        error={saveError || estimatesError}
        primaryLabel="Guardar estimados de envío"
        onPrimary={handleSaveEstimates}
        primaryDisabled={!dirtyEstimates || isSavingEstimates}
        primaryHighlighted={onlyEstimates || bothDirty}
        secondaryLabel="Guardar datos de tienda"
        onSecondary={handleSaveGeneral}
        secondaryDisabled={!dirtyGeneral || savingGeneral || !whatsappPhoneValid}
        secondaryHighlighted={onlyGeneral || bothDirty}
      />
    </div>
  );
}
