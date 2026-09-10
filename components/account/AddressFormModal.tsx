'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Store, Building2, Truck, Loader2, X } from 'lucide-react';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { mrwOffices } from '@/lib/mrw-offices';
import { zoomOffices, type ZoomOffice } from '@/lib/zoom-offices';
import { tealcaOffices, type TealcaOffice } from '@/lib/tealca-offices';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { SavedAddress, SavedAddressInput, ShippingMethod } from '@/lib/definitions';
import OfficeSelect from '@/app/components/checkout/OfficeSelect';
import type { OfficeOption } from '@/app/components/checkout/OfficeSelect';

type FormValues = {
  alias:           string;
  firstName:       string;
  lastName:        string;
  idNumber:        string;
  phoneNumber:     string;
  shippingMethod:  ShippingMethod;
  mrwState:        string;
  mrwOffice:       string;
  zoomOfficeIndex: string;
  tealcaOfficeIndex: string;
  isDefault:       boolean;
};

interface AddressFormModalProps {
  editAddress?: SavedAddress | null;
  onClose:  () => void;
  onSubmit: (data: SavedAddressInput) => Promise<void>;
  isSubmitting: boolean;
}

export default function AddressFormModal({
  editAddress,
  onClose,
  onSubmit,
  isSubmitting,
}: AddressFormModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const formDirtyRef = useRef(false);

  const initialZoomIndex = (() => {
    if (editAddress?.shippingMethod === 'zoom' && editAddress.mrwState && editAddress.mrwOffice) {
      const offices = (zoomOffices as Record<string, ZoomOffice[]>)[editAddress.mrwState] ?? [];
      const idx = offices.findIndex((o) => o.name === editAddress.mrwOffice);
      return idx >= 0 ? String(idx) : '';
    }
    return '';
  })();

  const initialTealcaIndex = (() => {
    if (editAddress?.shippingMethod === 'tealca' && editAddress.mrwState && editAddress.mrwOffice) {
      const offices = (tealcaOffices as Record<string, TealcaOffice[]>)[editAddress.mrwState] ?? [];
      const idx = offices.findIndex((o) => o.name === editAddress.mrwOffice);
      return idx >= 0 ? String(idx) : '';
    }
    return '';
  })();

  const { register, handleSubmit, watch, setValue, formState: { errors, dirtyFields } } =
    useForm<FormValues>({
      defaultValues: {
        alias:           editAddress?.alias          ?? '',
        firstName:       editAddress?.firstName      ?? '',
        lastName:        editAddress?.lastName       ?? '',
        idNumber:        editAddress?.idNumber       ?? '',
        phoneNumber:    editAddress?.phoneNumber    ?? '',
        shippingMethod:  (editAddress?.shippingMethod ?? 'tienda') as ShippingMethod,
        mrwState:        editAddress?.mrwState       ?? '',
        mrwOffice:       editAddress?.mrwOffice      ?? '',
        zoomOfficeIndex: initialZoomIndex,
        tealcaOfficeIndex: initialTealcaIndex,
        isDefault:       editAddress?.isDefault      ?? false,
      },
    });

  const method       = watch('shippingMethod');
  const selectedState = watch('mrwState');

  // Track form dirty state for close guard
  useEffect(() => {
    formDirtyRef.current = Object.keys(dirtyFields).length > 0;
  }, [dirtyFields]);

  const mrwStateOptions: OfficeOption[] = Object.keys(mrwOffices).sort().map(s => ({ name: s }));
  const zoomStateOptions: OfficeOption[] = Object.keys(zoomOffices).sort().map(s => ({ name: s }));
  const tealcaStateOptions: OfficeOption[] = Object.keys(tealcaOffices).sort().map(s => ({ name: s }));

  const didMountRef = useRef(false);
  useEffect(() => {
    // No resetear en el montaje: preserva la preselección al editar.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (method === 'zoom') {
      setValue('zoomOfficeIndex', '');
    } else if (method === 'tealca') {
      setValue('tealcaOfficeIndex', '');
    } else {
      setValue('mrwOffice', '');
    }
  }, [selectedState, method, setValue]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      // Form dirty guard: no cerrar si hay cambios sin guardar
      if (formDirtyRef.current) {
        if (!window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) return;
      }
      onClose();
    }
  };

  // Scroll lock
  useBodyScrollLock(true);

  // Focus trap: el hook maneja foco inicial, Tab/Shift+Tab, y Escape.
  // onClose se pasa para manejar Escape.
  const handleCloseGuard = () => {
    if (formDirtyRef.current) {
      if (!window.confirm('Hay cambios sin guardar. ¿Deseas descartarlos?')) return;
    }
    onClose();
  };
  useFocusTrap({ containerRef: dialogRef, enabled: true, onClose: handleCloseGuard });

  const submit = handleSubmit(async (values) => {
    let officeLabel: string | null = null;
    let officeState: string | null = null;
    let officeAddr:  string | null = null;
    let officeCityVal: string | null = null;

    if (values.shippingMethod === 'zoom') {
      const offices = (zoomOffices as Record<string, ZoomOffice[]>)[values.mrwState] ?? [];
      const office = values.zoomOfficeIndex !== '' ? offices[Number(values.zoomOfficeIndex)] : undefined;
      if (office) {
        officeLabel   = office.name;
        officeState   = values.mrwState || null;
        officeAddr    = office.address || null;
        officeCityVal = office.city || null;
      }
    } else if (values.shippingMethod === 'tealca') {
      const offices = (tealcaOffices as Record<string, TealcaOffice[]>)[values.mrwState] ?? [];
      const office = values.tealcaOfficeIndex !== '' ? offices[Number(values.tealcaOfficeIndex)] : undefined;
      if (office) {
        officeLabel   = office.name;
        officeState   = values.mrwState || null;
        officeAddr    = office.address || null;
        officeCityVal = office.city || null;
      }
    } else if (values.shippingMethod === 'mrw') {
      officeLabel = values.mrwOffice || null;
      officeState = values.mrwState || null;
    }

    await onSubmit({
      alias:          values.alias,
      firstName:      values.firstName,
      lastName:       values.lastName,
      idNumber:       values.idNumber,
      phoneNumber:    values.phoneNumber,
      shippingMethod: values.shippingMethod,
      mrwState:       officeState,
      mrwOffice:      officeLabel,
      officeAddress:  officeAddr,
      officeCity:     officeCityVal,
      isDefault:      values.isDefault,
    });
    formDirtyRef.current = false;
  });

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Formulario de dirección"
        className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-h-screen max-h-[90dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-navy">
            {editAddress ? 'Editar dirección' : 'Nueva dirección'}
          </h2>
          <button
            type="button"
            onClick={handleCloseGuard}
            className="w-11 h-11 -my-1.5 -mr-2 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-navy transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-5">
          {/* Alias */}
          <Field id="alias" label="Nombre de esta dirección" error={errors.alias?.message}>
            <Input
              id="alias"
              placeholder='Ej: "Casa", "Trabajo", "Oficina MRW Caracas"'
              {...register('alias', { required: 'El alias es requerido.' })}
              invalid={!!errors.alias}
            />
          </Field>

          {/* Método de retiro */}
          <div>
            <p className="text-[12px] font-semibold text-navy tracking-tight mb-2">Método de entrega</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: 'tienda', icon: Store,     label: 'Retirar en tienda' },
                { id: 'mrw',    icon: Building2, label: 'Retiro MRW'        },
                { id: 'zoom',   icon: Truck,     label: 'Retiro ZOOM'       },
                { id: 'tealca', icon: Truck,     label: 'Retiro TEALCA'     },
              ] as const).map((opt) => {
                const active = method === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={`cursor-pointer rounded-xl p-3 flex items-center gap-2.5 transition-all ${
                      active
                        ? 'border-2 border-navy bg-slate-50'
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
                        setValue('zoomOfficeIndex', '');
                        setValue('tealcaOfficeIndex', '');
                      }}
                    />
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      active ? 'bg-navy text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <opt.icon size={14} />
                    </div>
                    <span className="text-sm font-medium text-navy">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* MRW: estado y oficina */}
          {method === 'mrw' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="mrwState" label="Estado" error={errors.mrwState?.message}>
                <OfficeSelect
                  options={mrwStateOptions}
                  selectedIndex={(() => {
                    const i = mrwStateOptions.findIndex(o => o.name === watch('mrwState'));
                    return i >= 0 ? i : null;
                  })()}
                  error={!!errors.mrwState}
                  onSelect={(_, o) => {
                    setValue('mrwState', o.name);
                    setValue('mrwOffice', '');
                  }}
                />
              </Field>
              <Field id="mrwOffice" label="Oficina MRW" error={errors.mrwOffice?.message}>
                {(() => {
                  const mrwOptions: OfficeOption[] = selectedState
                    ? ((mrwOffices as Record<string, string[]>)[selectedState] ?? []).map((nombre) => ({ name: nombre }))
                    : [];
                  return (
                    <OfficeSelect
                      options={mrwOptions}
                      selectedIndex={(() => {
                        const i = mrwOptions.findIndex((o) => o.name === watch('mrwOffice'));
                        return i >= 0 ? i : null;
                      })()}
                      disabled={!selectedState}
                      error={!!errors.mrwOffice}
                      onSelect={(_, o) => setValue('mrwOffice', o.name)}
                    />
                  );
                })()}
              </Field>
            </div>
          )}

          {/* ZOOM: estado y oficina */}
          {method === 'zoom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="mrwState" label="Estado" error={errors.mrwState?.message}>
                <OfficeSelect
                  options={zoomStateOptions}
                  selectedIndex={(() => {
                    const i = zoomStateOptions.findIndex(o => o.name === watch('mrwState'));
                    return i >= 0 ? i : null;
                  })()}
                  error={!!errors.mrwState}
                  onSelect={(_, o) => {
                    setValue('mrwState', o.name);
                    setValue('zoomOfficeIndex', '');
                  }}
                />
              </Field>
              <Field id="zoomOfficeIndex" label="Oficina ZOOM" error={errors.zoomOfficeIndex?.message}>
                {(() => {
                  const zoomOptions: ZoomOffice[] = selectedState
                    ? (zoomOffices as Record<string, ZoomOffice[]>)[selectedState] ?? []
                    : [];
                  return (
                    <OfficeSelect
                      options={zoomOptions}
                      selectedIndex={watch('zoomOfficeIndex') ? Number(watch('zoomOfficeIndex')) : null}
                      disabled={!selectedState}
                      error={!!errors.zoomOfficeIndex}
                      onSelect={(idx) => setValue('zoomOfficeIndex', String(idx))}
                    />
                  );
                })()}
              </Field>
            </div>
          )}

          {/* TEALCA: estado y oficina */}
          {method === 'tealca' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="mrwState" label="Estado" error={errors.mrwState?.message}>
                <OfficeSelect
                  options={tealcaStateOptions}
                  selectedIndex={(() => {
                    const i = tealcaStateOptions.findIndex(o => o.name === watch('mrwState'));
                    return i >= 0 ? i : null;
                  })()}
                  error={!!errors.mrwState}
                  onSelect={(_, o) => {
                    setValue('mrwState', o.name);
                    setValue('tealcaOfficeIndex', '');
                  }}
                />
              </Field>
              <Field id="tealcaOfficeIndex" label="Oficina TEALCA" error={errors.tealcaOfficeIndex?.message}>
                {(() => {
                  const tealcaOptions: TealcaOffice[] = selectedState
                    ? (tealcaOffices as Record<string, TealcaOffice[]>)[selectedState] ?? []
                    : [];
                  return (
                    <OfficeSelect
                      options={tealcaOptions}
                      selectedIndex={watch('tealcaOfficeIndex') ? Number(watch('tealcaOfficeIndex')) : null}
                      disabled={!selectedState}
                      error={!!errors.tealcaOfficeIndex}
                      onSelect={(idx) => setValue('tealcaOfficeIndex', String(idx))}
                    />
                  );
                })()}
              </Field>
            </div>
          )}

          {/* Datos personales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="firstName" label="Nombre" error={errors.firstName?.message}>
              <Input
                id="firstName"
                {...register('firstName', { required: 'El nombre es requerido.' })}
                invalid={!!errors.firstName}
              />
            </Field>
            <Field id="lastName" label="Apellido" error={errors.lastName?.message}>
              <Input
                id="lastName"
                {...register('lastName', { required: 'El apellido es requerido.' })}
                invalid={!!errors.lastName}
              />
            </Field>
            <Field id="idNumber" label="Cédula de identidad" error={errors.idNumber?.message}>
              <Input
                id="idNumber"
                placeholder="V-12345678"
                {...register('idNumber', { required: 'La cédula es requerida.' })}
                invalid={!!errors.idNumber}
              />
            </Field>
            <Field id="phoneNumber" label="Celular" error={errors.phoneNumber?.message}>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="+58 412-0000000"
                {...register('phoneNumber', { required: 'El teléfono es requerido.' })}
                invalid={!!errors.phoneNumber}
              />
            </Field>
          </div>

          {/* Predeterminada */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              {...register('isDefault')}
              className="w-4 h-4 rounded accent-navy cursor-pointer"
            />
            <span className="text-sm text-slate-700">Usar como dirección predeterminada</span>
          </label>

          {/* CTA */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-navy text-white font-bold text-sm min-h-[52px] rounded-2xl hover:bg-navy-700 shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Guardando…</>
              ) : editAddress ? (
                'Guardar cambios'
              ) : (
                'Agregar dirección'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
