'use client';

import { useState, useTransition } from 'react';
import { Plus, MapPin } from 'lucide-react';
import AddressCard from '@/components/account/AddressCard';
import AddressFormModal from '@/components/account/AddressFormModal';
import { useToast } from '@/components/ui/use-toast';
import {
  createSavedAddress,
  updateSavedAddress,
  deleteSavedAddress,
  setDefaultAddress,
} from '@/app/actions/addressActions';
import type { SavedAddress, SavedAddressInput } from '@/lib/definitions';

interface AddressListClientProps {
  initialAddresses: SavedAddress[];
}

export default function AddressListClient({ initialAddresses }: AddressListClientProps) {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<SavedAddress[]>(initialAddresses);
  const [showModal, setShowModal]   = useState(false);
  const [editTarget, setEditTarget] = useState<SavedAddress | null>(null);

  const [isSubmitting,      startSubmit]      = useTransition();
  const [deletingId,        setDeletingId]     = useState<string | null>(null);
  const [settingDefaultId,  setSettingDefaultId] = useState<string | null>(null);

  const openCreate = () => { setEditTarget(null); setShowModal(true); };
  const openEdit   = (a: SavedAddress) => { setEditTarget(a); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditTarget(null); };

  const handleSubmit = (data: SavedAddressInput) =>
    new Promise<void>((resolve) => {
      startSubmit(async () => {
        try {
          const result = editTarget
            ? await updateSavedAddress(editTarget.id, data)
            : await createSavedAddress(data);

          if (result.success && result.address) {
            if (editTarget) {
              setAddresses((prev) =>
                prev.map((a) => {
                  if (result.address!.isDefault) return { ...a, isDefault: a.id === result.address!.id };
                  return a.id === result.address!.id ? result.address! : a;
                }),
              );
            } else {
              setAddresses((prev) => {
                const updated = result.address!.isDefault
                  ? prev.map((a) => ({ ...a, isDefault: false }))
                  : prev;
                return [result.address!, ...updated];
              });
            }
            toast({ title: '¡Listo!', description: result.message });
            closeModal();
          } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
          }
        } catch {
          toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la dirección.' });
        }
        resolve();
      });
    });

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const result = await deleteSavedAddress(id);
      if (result.success) {
        setAddresses((prev) => {
          const remaining = prev.filter((a) => a.id !== id);
          const wasDefault = prev.find((a) => a.id === id)?.isDefault;
          if (wasDefault && remaining.length > 0) {
            return remaining.map((a, i) => ({ ...a, isDefault: i === 0 }));
          }
          return remaining;
        });
        toast({ title: 'Eliminada', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setSettingDefaultId(id);
    try {
      const result = await setDefaultAddress(id);
      if (result.success) {
        setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
        toast({ title: '¡Listo!', description: result.message });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar.' });
    } finally {
      setSettingDefaultId(null);
    }
  };

  return (
    <>
      {/* Header de sección */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
        <div>
          <h1 className="text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">
            Mis direcciones
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Guarda tus datos de entrega para agilizar el checkout.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-navy text-white font-semibold text-sm min-h-[44px] px-4 rounded-xl hover:bg-navy-700 shadow-soft transition-all"
        >
          <Plus size={15} /> Nueva
        </button>
      </div>

      {/* Lista vacía */}
      {addresses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
            <MapPin size={22} />
          </div>
          <p className="text-sm font-semibold text-navy">Sin direcciones guardadas</p>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">
            Agrega tu primera dirección para no tener que rellenar los datos de envío en cada compra.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-2 bg-navy text-white font-semibold text-sm h-11 px-6 rounded-xl hover:bg-navy-700 shadow-soft transition-all"
          >
            <Plus size={15} /> Agregar dirección
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={openEdit}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
              isDeleting={deletingId === address.id}
              isSettingDefault={settingDefaultId === address.id}
            />
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <AddressFormModal
          editAddress={editTarget}
          onClose={closeModal}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}
