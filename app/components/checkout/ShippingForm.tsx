'use client';

import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { useSession } from 'next-auth/react';
import { Store, Building2, ChevronRight, BookUser, Check, LogIn } from 'lucide-react';
import Link from 'next/link';
import { mrwOffices } from '@/lib/mrw-offices';
import { zoomOffices, type ZoomOffice } from '@/lib/zoom-offices';
import { tealcaOffices, type TealcaOffice } from '@/lib/tealca-offices';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { getSavedAddresses } from '@/app/actions/addressActions';
import type { SavedAddress, ShippingMethod } from '@/lib/definitions';
import { estimateFor, type ShippingEstimates } from '@/lib/shipping-estimates';
import OfficeSelect from '@/app/components/checkout/OfficeSelect';
import type { OfficeOption } from '@/app/components/checkout/OfficeSelect';
import { resolveShippingChargeType, shippingChargeLabel } from '@/lib/shipping-charge';
import { PackageCheck } from 'lucide-react';

export type ShippingFormData = {
  firstName:   string;
  lastName:    string;
  email:       string;
  idType:      string;
  idNumber:    string;
  phoneNumber: string;
  shippingMethod: ShippingMethod;
  mrwState?:  string;
  mrwOffice?: string;
  mrwOfficeManual?: string;
  zoomState?: string;
  zoomOfficeIndex?: string;
  zoomOfficeName?: string;
  zoomOfficeAddress?: string;
  zoomOfficeCity?: string;
  zoomOfficeManual?: string;
  tealcaState?: string;
  tealcaOfficeIndex?: string;
  tealcaOfficeName?: string;
  tealcaOfficeAddress?: string;
  tealcaOfficeCity?: string;
  tealcaOfficeManual?: string;
};

// ── Helpers de validación venezolana ──

const VE_PHONE_PREFIXES = [
  '0412','0422','0414','0416','0424','0426','0212','0235','0238','0240','0241','0242','0243','0244','0247','0248',
  '0251','0252','0253','0254','0255','0256','0257','0261','0262','0263','0264','0265','0266','0267','0268','0269',
  '0271','0272','0273','0274','0275','0276','0277','0278','0281','0282','0283','0285','0286','0287','0288',
  '0293','0294','0295',
];

export function normalizeVePhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('58')) d = '0' + d.slice(2);
  return d;
}

export function isValidVePhone(raw: string): boolean {
  const d = normalizeVePhone(raw);
  return d.length === 11 && VE_PHONE_PREFIXES.includes(d.slice(0, 4));
}

const VE_ID_TYPES = [
  { v: 'V', label: 'V — Venezolano' },
  { v: 'E', label: 'E — Extranjero' },
  { v: 'J', label: 'J — RIF (Jurídico)' },
  { v: 'G', label: 'G — Gobierno' },
  { v: 'P', label: 'P — Pasaporte' },
];

/**
 * Normaliza y combina idType + idNumber al formato que esperan los consumidores (ej. "V-12345678").
 * También normaliza el teléfono a 11 dígitos.
 */
export function finalizeShipping(data: ShippingFormData): ShippingFormData {
  const phoneNumber = normalizeVePhone(data.phoneNumber);
  const idPrefix = data.idType || 'V';
  const idDigits = (data.idNumber || '').replace(/\D/g, '');
  const idNumber = `${idPrefix}-${idDigits}`;
  return { ...data, phoneNumber, idNumber };
}

/** Extrae la letra del tipo de documento (V/E/J/G/P) de un idNumber combinado como "V-12345678". */
function extractIdType(raw: string | undefined): string {
  if (!raw) return 'V';
  const match = raw.match(/^([VEJGJP])\s*-?\s*/);
  if (match && VE_ID_TYPES.some(t => t.v === match[1])) return match[1];
  return 'V';
}

/** Extrae solo los dígitos de un idNumber combinado como "V-12345678". */
function extractIdDigits(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/^[VEJGJP]\s*-?\s*/, '').replace(/\D/g, '');
}

export type ShippingFormHandle = {
  submit: () => Promise<ShippingFormData | null>;
};

interface ShippingFormProps {
  onFormSubmit: (data: ShippingFormData) => void;
  /** Datos ya capturados: al volver desde el paso de pago el formulario se remonta y sin esto se perdía lo escrito. */
  initialData?: ShippingFormData | null;
  /** MEJORA 2.3: estimados de envío editables desde el admin (R1). */
  estimates?: ShippingEstimates;
  /** Modo WhatsApp: oculta cédula y email, añade campo de dirección. */
  whatsappMode?: boolean;
  /** Si es true, oculta el botón "Continuar al pago" (modo embebido). */
  embedded?: boolean;
  /**
   * Flags de "envío gratis" de cada producto del carrito (vista PRELIMINAR:
   * el servidor recalcula desde la BD al confirmar el pedido — este valor
   * nunca es autoritativo). Vacío = sin productos, se asume cobro a destino.
   */
  productFreeShippingFlags?: readonly boolean[];
}

const ShippingForm = forwardRef<ShippingFormHandle, ShippingFormProps>(({ onFormSubmit, initialData, estimates, whatsappMode = false, embedded = false, productFreeShippingFlags = [] }, ref) => {
  const { data: session } = useSession();
  const {
    register, handleSubmit, formState: { errors }, watch, setValue, setError, clearErrors,
  } = useForm<ShippingFormData>({
    defaultValues: initialData
      ? { ...initialData, idType: extractIdType(initialData.idNumber), idNumber: extractIdDigits(initialData.idNumber) }
      : { shippingMethod: 'tienda', email: '', idType: 'V' },
  });

  const [mrwManual, setMrwManual] = useState(false);
  const [zoomManual, setZoomManual] = useState(false);
  const [tealcaManual, setTealcaManual] = useState(false);

  const MANUAL_OFFICE: OfficeOption = { name: 'Mi oficina no está en la lista', address: 'Escribir dirección manualmente' };

  const mrwStateOptions: OfficeOption[] = Object.keys(mrwOffices).sort().map(s => ({ name: s }));
  const zoomStateOptions: OfficeOption[] = Object.keys(zoomOffices).sort().map(s => ({ name: s }));
  const tealcaStateOptions: OfficeOption[] = Object.keys(tealcaOffices).sort().map(s => ({ name: s }));

  const idTypeOptions: OfficeOption[] = VE_ID_TYPES.map(t => ({ name: t.label }));

  const [savedAddresses, setSavedAddresses]   = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId]   = useState<string | null>(null);
  const [showAddrPicker, setShowAddrPicker]   = useState(false);
  const [loadingAddrs,   setLoadingAddrs]      = useState(false);

  useEffect(() => {
    if (initialData?.email) return;
    const e = session?.user?.email?.trim();
    if (e) setValue('email', e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email, setValue]);

  useEffect(() => {
    if (!session?.user?.id) return;
    setLoadingAddrs(true);
    getSavedAddresses()
      .then((addrs) => {
        setSavedAddresses(addrs);
        // Solo auto-aplicar la dirección por defecto en la primera visita:
        // si venimos "de vuelta" desde el pago, respetar lo que ya escribió.
        if (initialData) return;
        const def = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (def) applyAddress(def);
      })
      .finally(() => setLoadingAddrs(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  function applyAddress(addr: SavedAddress) {
    setValue('firstName',      addr.firstName);
    setValue('lastName',       addr.lastName);
    setValue('idType',         extractIdType(addr.idNumber));
    setValue('idNumber',       extractIdDigits(addr.idNumber));
    setValue('phoneNumber',    addr.phoneNumber);
    setValue('shippingMethod', addr.shippingMethod as ShippingMethod);
    if (addr.shippingMethod === 'mrw') {
      setValue('mrwState',  addr.mrwState  ?? '');
      setValue('mrwOffice', addr.mrwOffice ?? '');
      setValue('zoomState', '');
      setValue('zoomOfficeIndex', '');
      setValue('zoomOfficeName', '');
      setValue('zoomOfficeAddress', '');
      setValue('zoomOfficeCity', '');
      setValue('tealcaState', '');
      setValue('tealcaOfficeIndex', '');
      setValue('tealcaOfficeName', '');
      setValue('tealcaOfficeAddress', '');
      setValue('tealcaOfficeCity', '');
    } else if (addr.shippingMethod === 'zoom') {
      setValue('mrwState', '');
      setValue('mrwOffice', '');
      setValue('zoomState', addr.mrwState ?? '');
      setValue('zoomOfficeName',    addr.mrwOffice ?? '');
      setValue('zoomOfficeAddress', addr.officeAddress ?? '');
      setValue('zoomOfficeCity',    addr.officeCity ?? '');
      if (addr.mrwState && addr.mrwOffice) {
        const offices = (zoomOffices as Record<string, ZoomOffice[]>)[addr.mrwState] ?? [];
        const idx = offices.findIndex(o => o.name === addr.mrwOffice);
        setValue('zoomOfficeIndex', idx >= 0 ? String(idx) : '');
      } else {
        setValue('zoomOfficeIndex', '');
      }
      setValue('tealcaState', '');
      setValue('tealcaOfficeIndex', '');
      setValue('tealcaOfficeName', '');
      setValue('tealcaOfficeAddress', '');
      setValue('tealcaOfficeCity', '');
    } else if (addr.shippingMethod === 'tealca') {
      setValue('mrwState', '');
      setValue('mrwOffice', '');
      setValue('tealcaState', addr.mrwState ?? '');
      setValue('tealcaOfficeName',    addr.mrwOffice ?? '');
      setValue('tealcaOfficeAddress', addr.officeAddress ?? '');
      setValue('tealcaOfficeCity',    addr.officeCity ?? '');
      if (addr.mrwState && addr.mrwOffice) {
        const offices = (tealcaOffices as Record<string, TealcaOffice[]>)[addr.mrwState] ?? [];
        const idx = offices.findIndex(o => o.name === addr.mrwOffice);
        setValue('tealcaOfficeIndex', idx >= 0 ? String(idx) : '');
      } else {
        setValue('tealcaOfficeIndex', '');
      }
      setValue('zoomState', '');
      setValue('zoomOfficeIndex', '');
      setValue('zoomOfficeName', '');
      setValue('zoomOfficeAddress', '');
      setValue('zoomOfficeCity', '');
    } else {
      setValue('mrwState',  '');
      setValue('mrwOffice', '');
      setValue('zoomState', '');
      setValue('zoomOfficeIndex', '');
      setValue('zoomOfficeName', '');
      setValue('zoomOfficeAddress', '');
      setValue('zoomOfficeCity', '');
      setValue('tealcaState', '');
      setValue('tealcaOfficeIndex', '');
      setValue('tealcaOfficeName', '');
      setValue('tealcaOfficeAddress', '');
      setValue('tealcaOfficeCity', '');
    }
    setSelectedAddrId(addr.id);
    setShowAddrPicker(false);
  }

  const shippingMethod = watch('shippingMethod');
  const selectedMrwState  = watch('mrwState');
  const selectedZoomState = watch('zoomState');
  const selectedTealcaState = watch('tealcaState');

  // MEJORA 2.3: estimado a mostrar bajo la selección de método/estado.
  const estimateNote = estimates
    ? estimateFor(
        estimates,
        shippingMethod,
        shippingMethod === 'mrw' ? selectedMrwState : shippingMethod === 'zoom' ? selectedZoomState : shippingMethod === 'tealca' ? selectedTealcaState : null,
      )
    : '';

  // ─── Validación de estado/oficina según método de envío ───
  function validateShippingFields(data: ShippingFormData): boolean {
    let valid = true;
    if (data.shippingMethod === 'mrw') {
      if (!data.mrwState) {
        setError('mrwState', { type: 'manual', message: 'Selecciona un estado' });
        valid = false;
      }
      if (!data.mrwOfficeManual?.trim() && !data.mrwOffice?.trim()) {
        setError('mrwOffice', { type: 'manual', message: 'Selecciona o escribe una oficina MRW' });
        valid = false;
      }
    } else if (data.shippingMethod === 'zoom') {
      if (!data.zoomState) {
        setError('zoomState', { type: 'manual', message: 'Selecciona un estado' });
        valid = false;
      }
      if (!data.zoomOfficeManual?.trim() && !data.zoomOfficeIndex) {
        setError('zoomOfficeIndex', { type: 'manual', message: 'Selecciona o escribe una oficina ZOOM' });
        valid = false;
      }
    } else if (data.shippingMethod === 'tealca') {
      if (!data.tealcaState) {
        setError('tealcaState', { type: 'manual', message: 'Selecciona un estado' });
        valid = false;
      }
      if (!data.tealcaOfficeManual?.trim() && !data.tealcaOfficeIndex) {
        setError('tealcaOfficeIndex', { type: 'manual', message: 'Selecciona o escribe una oficina TEALCA' });
        valid = false;
      }
    }
    return valid;
  }

  useImperativeHandle(ref, () => ({
    submit: () => new Promise<ShippingFormData | null>((resolve) => {
      handleSubmit((data) => {
        if (!validateShippingFields(data)) { resolve(null); return; }
        resolve(finalizeShipping(data));
      }, () => resolve(null))();
    }),
  }));

  const onSubmit: SubmitHandler<ShippingFormData> = (data) => {
    if (!validateShippingFields(data)) return;
    onFormSubmit(finalizeShipping(data));
  };

  const selectedAddr = savedAddresses.find((a) => a.id === selectedAddrId);

  // Zoom: las oficinas filtradas por estado seleccionado
  const zoomOfficesForState: ZoomOffice[] = selectedZoomState
    ? (zoomOffices as Record<string, ZoomOffice[]>)[selectedZoomState] ?? []
    : [];

  // Tealca: las oficinas filtradas por estado seleccionado
  const tealcaOfficesForState: TealcaOffice[] = selectedTealcaState
    ? (tealcaOffices as Record<string, TealcaOffice[]>)[selectedTealcaState] ?? []
    : [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-7">
      <div>
        <h2
          data-testid="checkout-shipping-heading"
          className="text-xl font-semibold text-navy tracking-tight"
        >
          Información de entrega
        </h2>
        <p className="text-sm text-slate-500 mt-1">Selecciona cómo quieres recibir tu pedido.</p>
      </div>

      {/* FASE 4.1: banner sutil de invitado — no bloquea, enlace opcional a login */}
      {!session?.user?.id && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
          <LogIn size={14} className="text-navy/40 flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-[12.5px] text-slate-500 leading-snug">
            Estás comprando como invitado. ¿Ya tienes cuenta?{' '}
            <Link
              href="/login?next=checkout"
              className="font-semibold text-navy underline decoration-navy/20 hover:decoration-navy/60 underline-offset-2 transition-colors"
            >
              Inicia sesión
            </Link>{' '}
            para usar tus direcciones guardadas.
          </p>
        </div>
      )}

      {/* Selector de direcciones guardadas */}
      {session?.user?.id && (
        <div>
          {loadingAddrs ? (
            <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
          ) : savedAddresses.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAddrPicker((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <BookUser size={16} className="text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {selectedAddr ? (
                    <>
                      <span className="text-sm font-semibold text-navy">{selectedAddr.alias}</span>
                      <span className="text-xs text-slate-500 ml-2">
                        {selectedAddr.firstName} {selectedAddr.lastName} · {selectedAddr.phoneNumber}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-slate-500">Usar una dirección guardada</span>
                  )}
                </div>
                <ChevronRight
                  size={15}
                  className={`text-slate-400 flex-shrink-0 transition-transform ${showAddrPicker ? 'rotate-90' : ''}`}
                />
              </button>

              {showAddrPicker && (
                <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {savedAddresses.map((addr) => (
                    <li key={addr.id}>
                      <button
                        type="button"
                        onClick={() => applyAddress(addr)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy">
                            {addr.alias}
                            {addr.isDefault && (
                              <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                                Principal
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {addr.firstName} {addr.lastName} · {addr.phoneNumber}
                            {addr.shippingMethod === 'mrw' && addr.mrwOffice
                              ? ` · ${addr.mrwOffice}, ${addr.mrwState}`
                              : (addr.shippingMethod === 'zoom' || addr.shippingMethod === 'tealca') && addr.mrwOffice
                                ? ` · ${addr.mrwOffice}, ${addr.mrwState}`
                                : ' · Retiro en tienda'}
                          </p>
                        </div>
                        {selectedAddrId === addr.id && (
                          <Check size={15} className="text-navy flex-shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Método */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { id: 'tienda' as const, icon: Store,     label: 'Retirar en tienda', sub: 'Recoge tu pedido en nuestra tienda física' },
          { id: 'mrw' as const,    icon: Building2, label: 'Envío MRW',        sub: 'Retira en la oficina de MRW más cercana'      },
          { id: 'zoom' as const,   icon: Building2, label: 'Envío ZOOM',        sub: 'Retira en la oficina de ZOOM más cercana'      },
          { id: 'tealca' as const, icon: Building2, label: 'Envío TEALCA',      sub: 'Retira en la oficina de TEALCA más cercana'    },
        ]).map((opt) => {
          const active = shippingMethod === opt.id;
          return (
            <label
              key={opt.id}
              className={`cursor-pointer rounded-2xl p-4 flex items-start gap-3 transition-all ${
                active
                  ? 'border-2 border-navy bg-slate-50 shadow-soft'
                  : 'border border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                value={opt.id}
                {...register('shippingMethod')}
                className="sr-only"
                onChange={() => {
                  setValue('shippingMethod', opt.id);
                  setValue('mrwState', '');
                  setValue('mrwOffice', '');
                  setValue('zoomState', '');
                  setValue('zoomOfficeIndex', '');
                  setValue('zoomOfficeName', '');
                  setValue('zoomOfficeAddress', '');
                  setValue('zoomOfficeCity', '');
                  setValue('tealcaState', '');
                  setValue('tealcaOfficeIndex', '');
                  setValue('tealcaOfficeName', '');
                  setValue('tealcaOfficeAddress', '');
                  setValue('tealcaOfficeCity', '');
                }}
              />
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                active ? 'bg-navy text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                <opt.icon size={17} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-navy">{opt.label}</p>
                <p className="text-[12px] text-slate-500 mt-0.5">{opt.sub}</p>
              </div>
            </label>
          );
        })}
      </div>

      {/* MEJORA 2.3: estimado de tiempo/costo del método elegido (editable en admin) */}
      {estimateNote ? (
        <p
          aria-live="polite"
          className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] font-medium text-slate-600"
        >
          <Check size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden />
          <span>{estimateNote}</span>
        </p>
      ) : null}

      {/* Beneficio MRW / cobro — vista PRELIMINAR (el servidor recalcula al confirmar). */}
      {(() => {
        const chargeType = resolveShippingChargeType(shippingMethod, productFreeShippingFlags);
        // En WhatsApp no se paga en la web: omitir el aviso de retiro en tienda.
        if (whatsappMode && chargeType === 'STORE_PICKUP') return null;
        const label = shippingChargeLabel(chargeType);
        const isFreeOrPickup = chargeType !== 'DESTINATION_CHARGE';
        const description =
          chargeType === 'STORE_PICKUP'
            ? 'No aplica envío. Pagas en la web y retiras tu pedido en nuestro negocio.'
            : 'El costo del envío se paga al transportista al recibir o retirar el pedido.';
        return (
          <div
            aria-live="polite"
            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] ${
              isFreeOrPickup
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            <PackageCheck size={16} className={`flex-shrink-0 mt-0.5 ${isFreeOrPickup ? 'text-emerald-600' : 'text-slate-400'}`} aria-hidden />
            <span>
              <strong className="font-semibold">{label}</strong>
              <span className="block mt-0.5">{description}</span>
            </span>
          </div>
        );
      })()}

      {/* Datos personales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field id="firstName" label="Nombre" error={errors.firstName?.message}>
          <Input id="firstName" autoComplete="given-name" {...register('firstName', { required: 'Requerido' })} invalid={!!errors.firstName} />
        </Field>
        <Field id="lastName" label="Apellido" error={errors.lastName?.message}>
          <Input id="lastName" autoComplete="family-name" {...register('lastName', { required: 'Requerido' })} invalid={!!errors.lastName} />
        </Field>
        {/* Cédula / RIF con selector de tipo de documento */}
        <Field id="idNumber" label="Cédula / RIF" error={errors.idNumber?.message}>
          <div className="flex gap-0">
            <OfficeSelect
              options={idTypeOptions}
              selectedIndex={(() => {
                const i = idTypeOptions.findIndex(o => o.name.startsWith(watch('idType')));
                return i >= 0 ? i : null;
              })()}
              buttonClassName="w-24 rounded-r-none border-r-0 rounded-l-xl"
              renderButtonLabel={(o) => o.name.charAt(0)}
              onSelect={(_, o) => {
                const letter = o.name.charAt(0);
                setValue('idType', letter, { shouldValidate: true });
              }}
            />
            <Input
              id="idNumber"
              placeholder="12345678"
              inputMode="numeric"
              autoComplete="off"
              className="rounded-l-none border-l-0 flex-1 min-w-0"
              {...register('idNumber', { required: 'Requerido' })}
              invalid={!!errors.idNumber}
            />
          </div>
        </Field>
        <Field id="phoneNumber" label="Número de celular" error={errors.phoneNumber?.message}>
          <Input
            id="phoneNumber"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0412-1234567"
            {...register('phoneNumber', {
              required: 'Ingresa tu número de celular.',
              validate: (v) => {
                const raw = (v ?? '').trim();
                if (!raw) return 'Ingresa tu número de celular.';
                if (/[a-zA-Z]/.test(raw)) return 'El teléfono no puede contener letras, solo números.';
                if (/[^\d\s()+-]/.test(raw)) return 'El teléfono solo puede contener números.';
                const digits = normalizeVePhone(raw); // convierte 58… → 0… y quita separadores
                if (digits.length !== 11) {
                  return digits.length < 11
                    ? `El teléfono debe tener 11 dígitos; te faltan ${11 - digits.length}. Ej: 0412-1234567.`
                    : `El teléfono debe tener 11 dígitos; tiene ${digits.length}. Ej: 0412-1234567.`;
                }
                if (!VE_PHONE_PREFIXES.includes(digits.slice(0, 4))) {
                  return 'El código de operadora no es válido (ej. 0412, 0414, 0416, 0424, 0426…).';
                }
                return true;
              },
            })}
            invalid={!!errors.phoneNumber}
          />
        </Field>
        {!whatsappMode && (
          <Field
            id="email"
            label="Correo electrónico"
            error={errors.email?.message}
            className="sm:col-span-2"
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Correo electrónico"
              {...register('email', {
                required: 'Requerido para enviarte la confirmación del pedido',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Correo no válido',
                },
              })}
              invalid={!!errors.email}
            />
          </Field>
        )}
      </div>

      {/* Solo para MRW: estado y oficina */}
      {shippingMethod === 'mrw' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field id="mrwState" label="Estado" error={errors.mrwState?.message}>
            <OfficeSelect
              options={mrwStateOptions}
              selectedIndex={(() => {
                const i = mrwStateOptions.findIndex(o => o.name === watch('mrwState'));
                return i >= 0 ? i : null;
              })()}
              error={!!errors.mrwState}
              onSelect={(_, o) => {
                clearErrors('mrwState');
                setValue('mrwState', o.name, { shouldValidate: true });
                setValue('mrwOffice', '');
                setMrwManual(false);
                setValue('mrwOfficeManual', '');
              }}
            />
          </Field>
          {(() => {
            if (mrwManual) {
              return (
                <Field id="mrwOfficeManual" label="Dirección de oficina MRW" error={errors.mrwOfficeManual?.message}>
                  <textarea
                    {...register('mrwOfficeManual', {
                      required: mrwManual ? 'Describe la dirección de tu oficina MRW' : false,
                      minLength: mrwManual ? { value: 10, message: 'Escribe al menos 10 caracteres' } : undefined,
                    })}
                    className="block w-full min-h-[80px] px-3.5 py-2.5 text-base bg-slate-50/70 border border-slate-200 rounded-xl text-navy placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-navy focus:shadow-ring-navy resize-none"
                    placeholder="Describe la dirección de tu oficina MRW (ciudad, urbanización, punto de referencia…)"
                  />
                  <button
                    type="button"
                    onClick={() => { clearErrors('mrwOffice'); setMrwManual(false); setValue('mrwOfficeManual', ''); }}
                    className="mt-2 text-xs font-medium text-slate-500 hover:text-navy underline underline-offset-2 transition-colors"
                  >
                    Volver a la lista de oficinas
                  </button>
                </Field>
              );
            }
            const mrwOptions: OfficeOption[] = selectedMrwState
              ? ((mrwOffices as Record<string, string[]>)[selectedMrwState] ?? []).map((nombre) => ({ name: nombre }))
              : [];
            const mrwOptionsWithManual = [...mrwOptions, MANUAL_OFFICE];
            return (
              <Field id="mrwOffice" label="Oficina MRW" error={errors.mrwOffice?.message}>
                <OfficeSelect
                  options={mrwOptionsWithManual}
                  selectedIndex={(() => {
                    const i = mrwOptionsWithManual.findIndex((o) => o.name === watch('mrwOffice'));
                    return i >= 0 ? i : null;
                  })()}
                  disabled={!selectedMrwState}
                  error={!!errors.mrwOffice}
                  onSelect={(idx, o) => {
                    clearErrors('mrwOffice');
                    if (idx === mrwOptionsWithManual.length - 1) {
                      setMrwManual(true);
                      setValue('mrwOffice', '');
                    } else {
                      setValue('mrwOffice', o.name, { shouldValidate: true });
                    }
                  }}
                />
              </Field>
            );
          })()}
        </div>
      )}

      {/* Solo para ZOOM: estado y oficina */}
      {shippingMethod === 'zoom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field id="zoomState" label="Estado" error={errors.zoomState?.message}>
            <OfficeSelect
              options={zoomStateOptions}
              selectedIndex={(() => {
                const i = zoomStateOptions.findIndex(o => o.name === watch('zoomState'));
                return i >= 0 ? i : null;
              })()}
              error={!!errors.zoomState}
              onSelect={(_, o) => {
                clearErrors('zoomState');
                setValue('zoomState', o.name, { shouldValidate: true });
                setValue('zoomOfficeIndex', '');
                setValue('zoomOfficeName', '');
                setValue('zoomOfficeAddress', '');
                setValue('zoomOfficeCity', '');
                setZoomManual(false);
                setValue('zoomOfficeManual', '');
              }}
            />
          </Field>
          {(() => {
            if (zoomManual) {
              return (
                <Field id="zoomOfficeManual" label="Dirección de oficina ZOOM" error={errors.zoomOfficeManual?.message}>
                  <textarea
                    {...register('zoomOfficeManual', {
                      required: zoomManual ? 'Describe la dirección de tu oficina ZOOM' : false,
                      minLength: zoomManual ? { value: 10, message: 'Escribe al menos 10 caracteres' } : undefined,
                    })}
                    className="block w-full min-h-[80px] px-3.5 py-2.5 text-base bg-slate-50/70 border border-slate-200 rounded-xl text-navy placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-navy focus:shadow-ring-navy resize-none"
                    placeholder="Describe la dirección de tu oficina ZOOM (ciudad, urbanización, punto de referencia…)"
                  />
                  <button
                    type="button"
                    onClick={() => { clearErrors('zoomOfficeIndex'); setZoomManual(false); setValue('zoomOfficeManual', ''); }}
                    className="mt-2 text-xs font-medium text-slate-500 hover:text-navy underline underline-offset-2 transition-colors"
                  >
                    Volver a la lista de oficinas
                  </button>
                </Field>
              );
            }
            const zoomOptionsWithManual = [...zoomOfficesForState, MANUAL_OFFICE];
            return (
              <Field id="zoomOfficeIndex" label="Oficina ZOOM" error={errors.zoomOfficeIndex?.message}>
                <OfficeSelect
                  options={zoomOptionsWithManual}
                  selectedIndex={watch('zoomOfficeIndex') ? Number(watch('zoomOfficeIndex')) : null}
                  disabled={!selectedZoomState}
                  error={!!errors.zoomOfficeIndex}
                  onSelect={(idx, o) => {
                    clearErrors('zoomOfficeIndex');
                    if (idx === zoomOptionsWithManual.length - 1) {
                      setZoomManual(true);
                      setValue('zoomOfficeIndex', '');
                      setValue('zoomOfficeName', '');
                      setValue('zoomOfficeAddress', '');
                      setValue('zoomOfficeCity', '');
                    } else {
                      setValue('zoomOfficeIndex', String(idx), { shouldValidate: true });
                      setValue('zoomOfficeName', o.name);
                      setValue('zoomOfficeAddress', o.address ?? '');
                      setValue('zoomOfficeCity', o.city ?? '');
                    }
                  }}
                />
              </Field>
            );
          })()}
        </div>
      )}

      {/* Solo para TEALCA: estado y oficina */}
      {shippingMethod === 'tealca' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field id="tealcaState" label="Estado" error={errors.tealcaState?.message}>
            <OfficeSelect
              options={tealcaStateOptions}
              selectedIndex={(() => {
                const i = tealcaStateOptions.findIndex(o => o.name === watch('tealcaState'));
                return i >= 0 ? i : null;
              })()}
              error={!!errors.tealcaState}
              onSelect={(_, o) => {
                clearErrors('tealcaState');
                setValue('tealcaState', o.name, { shouldValidate: true });
                setValue('tealcaOfficeIndex', '');
                setValue('tealcaOfficeName', '');
                setValue('tealcaOfficeAddress', '');
                setValue('tealcaOfficeCity', '');
                setTealcaManual(false);
                setValue('tealcaOfficeManual', '');
              }}
            />
          </Field>
          {(() => {
            if (tealcaManual) {
              return (
                <Field id="tealcaOfficeManual" label="Dirección de oficina TEALCA" error={errors.tealcaOfficeManual?.message}>
                  <textarea
                    {...register('tealcaOfficeManual', {
                      required: tealcaManual ? 'Describe la dirección de tu oficina TEALCA' : false,
                      minLength: tealcaManual ? { value: 10, message: 'Escribe al menos 10 caracteres' } : undefined,
                    })}
                    className="block w-full min-h-[80px] px-3.5 py-2.5 text-base bg-slate-50/70 border border-slate-200 rounded-xl text-navy placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-navy focus:shadow-ring-navy resize-none"
                    placeholder="Describe la dirección de tu oficina TEALCA (ciudad, urbanización, punto de referencia…)"
                  />
                  <button
                    type="button"
                    onClick={() => { clearErrors('tealcaOfficeIndex'); setTealcaManual(false); setValue('tealcaOfficeManual', ''); }}
                    className="mt-2 text-xs font-medium text-slate-500 hover:text-navy underline underline-offset-2 transition-colors"
                  >
                    Volver a la lista de oficinas
                  </button>
                </Field>
              );
            }
            const tealcaOptionsWithManual = [...tealcaOfficesForState, MANUAL_OFFICE];
            return (
              <Field id="tealcaOfficeIndex" label="Oficina TEALCA" error={errors.tealcaOfficeIndex?.message}>
                <OfficeSelect
                  options={tealcaOptionsWithManual}
                  selectedIndex={watch('tealcaOfficeIndex') ? Number(watch('tealcaOfficeIndex')) : null}
                  disabled={!selectedTealcaState}
                  error={!!errors.tealcaOfficeIndex}
                  onSelect={(idx, o) => {
                    clearErrors('tealcaOfficeIndex');
                    if (idx === tealcaOptionsWithManual.length - 1) {
                      setTealcaManual(true);
                      setValue('tealcaOfficeIndex', '');
                      setValue('tealcaOfficeName', '');
                      setValue('tealcaOfficeAddress', '');
                      setValue('tealcaOfficeCity', '');
                    } else {
                      setValue('tealcaOfficeIndex', String(idx), { shouldValidate: true });
                      setValue('tealcaOfficeName', o.name);
                      setValue('tealcaOfficeAddress', o.address ?? '');
                      setValue('tealcaOfficeCity', o.city ?? '');
                    }
                  }}
                />
              </Field>
            );
          })()}
        </div>
      )}

      {!embedded && (
        <div
          className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 bg-white/95 backdrop-blur-sm border-t border-slate-100 sm:static sm:mx-0 sm:px-0 sm:pb-0 sm:pt-0 sm:border-0 sm:bg-transparent sm:backdrop-blur-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 bg-brand-yellow text-navy font-bold text-sm min-h-[52px] rounded-2xl hover:bg-[#FFE03A] active:scale-[0.98] shadow-soft hover:shadow-card transition-all"
          >
            Continuar al pago <ChevronRight size={16} />
          </button>
        </div>
      )}
    </form>
  );
});

ShippingForm.displayName = 'ShippingForm';
export default ShippingForm;
