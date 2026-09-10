'use client';

import { Store, Building2, Truck, Star, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { SavedAddress } from '@/lib/definitions';

interface AddressCardProps {
  address: SavedAddress;
  onEdit:       (address: SavedAddress) => void;
  onDelete:     (id: string) => void;
  onSetDefault: (id: string) => void;
  isDeleting:   boolean;
  isSettingDefault: boolean;
}

export default function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  isDeleting,
  isSettingDefault,
}: AddressCardProps) {
  const isMrw   = address.shippingMethod === 'mrw';
  const isZoom  = address.shippingMethod === 'zoom';
  const isTealca = address.shippingMethod === 'tealca';
  const Icon    = isMrw ? Building2 : (isZoom || isTealca) ? Truck : Store;

  return (
    <div
      className={`relative rounded-2xl border p-5 flex flex-col gap-3 transition-all ${
        address.isDefault
          ? 'border-navy/30 bg-navy/[0.03] shadow-soft'
          : 'border-slate-200 bg-white'
      }`}
    >
      {/* Badge predeterminada */}
      {address.isDefault && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[11px] font-semibold text-navy bg-brand-yellow px-2 py-0.5 rounded-full">
          <Star size={10} className="fill-navy" /> Predeterminada
        </span>
      )}

      {/* Header con alias y método */}
      <div className="flex items-start gap-3 pr-20">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-500">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy leading-tight">{address.alias}</p>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {isMrw ? 'Retiro MRW' : isZoom ? 'Retiro ZOOM' : isTealca ? 'Retiro TEALCA' : 'Retiro en tienda'}
          </p>
        </div>
      </div>

      {/* Datos */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
        <div>
          <dt className="text-[11px] text-slate-400 font-medium">Nombre</dt>
          <dd className="text-navy">{address.firstName} {address.lastName}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400 font-medium">Cédula</dt>
          <dd className="text-navy">{address.idNumber}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400 font-medium">Celular</dt>
          <dd className="text-navy">{address.phoneNumber}</dd>
        </div>
        {isMrw && address.mrwState && (
          <div>
            <dt className="text-[11px] text-slate-400 font-medium">Oficina MRW</dt>
            <dd className="text-navy line-clamp-1">
              {address.mrwOffice}{address.mrwState ? `, ${address.mrwState}` : ''}
            </dd>
          </div>
        )}
        {isZoom && address.mrwState && (
          <div>
            <dt className="text-[11px] text-slate-400 font-medium">Oficina ZOOM</dt>
            <dd className="text-navy line-clamp-1">
              {address.mrwOffice}{address.mrwState ? `, ${address.mrwState}` : ''}
            </dd>
          </div>
        )}
        {isTealca && address.mrwState && (
          <div>
            <dt className="text-[11px] text-slate-400 font-medium">Oficina TEALCA</dt>
            <dd className="text-navy line-clamp-1">
              {address.mrwOffice}{address.mrwState ? `, ${address.mrwState}` : ''}
            </dd>
          </div>
        )}
      </dl>

      {/* Acciones */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        {!address.isDefault && (
          <button
            type="button"
            onClick={() => onSetDefault(address.id)}
            disabled={isSettingDefault}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy transition-colors disabled:opacity-50"
          >
            {isSettingDefault ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Star size={13} />
            )}
            Predeterminar
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(address)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Pencil size={13} /> Editar
          </button>
          <button
            type="button"
            onClick={() => onDelete(address.id)}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} />
            )}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
