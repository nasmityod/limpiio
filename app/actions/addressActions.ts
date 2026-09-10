'use server';

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import type { SavedAddress, SavedAddressInput, ShippingMethod } from '@/lib/definitions';
import { mrwOffices } from '@/lib/mrw-offices';
import { zoomOffices, type ZoomOffice } from '@/lib/zoom-offices';
import { tealcaOffices, type TealcaOffice } from '@/lib/tealca-offices';
import { logError } from '@/lib/safe-logger';

interface ActionResult {
  success: boolean;
  message: string;
}

/** PRD-216: tope de direcciones guardadas por usuario (anti-spam de BD). */
const MAX_ADDRESSES_PER_USER = 20;

/**
 * PRD-210: valida estado y oficina MRW contra la lista blanca oficial de
 * lib/mrw-offices.ts — evita oficinas inventadas persistidas en BD.
 * Devuelve un mensaje de error o null si es válido.
 */
function validateMrwSelection(data: SavedAddressInput): string | null {
  if (data.shippingMethod !== 'mrw') return null;
  const offices = (mrwOffices as Record<string, string[]>)[data.mrwState?.trim() ?? ''];
  if (!offices) return 'El estado MRW seleccionado no es válido.';
  if (!offices.includes(data.mrwOffice?.trim() ?? '')) {
    return 'La oficina MRW seleccionada no corresponde a ese estado.';
  }
  return null;
}

/**
 * Valida estado y oficina ZOOM contra la lista blanca de lib/zoom-offices.ts.
 * Devuelve un mensaje de error o null si es válido.
 */
function validateZoomSelection(data: SavedAddressInput): string | null {
  if (data.shippingMethod !== 'zoom') return null;
  const offices = (zoomOffices as Record<string, ZoomOffice[]>)[data.mrwState?.trim() ?? ''];
  if (!offices) return 'El estado ZOOM seleccionado no es válido.';
  const name = data.mrwOffice?.trim() ?? '';
  if (!offices.some((o) => o.name === name)) {
    return 'La oficina ZOOM seleccionada no corresponde a ese estado.';
  }
  return null;
}

/**
 * Valida estado y oficina TEALCA contra la lista blanca de lib/tealca-offices.ts.
 * Devuelve un mensaje de error o null si es válido.
 */
function validateTealcaSelection(data: SavedAddressInput): string | null {
  if (data.shippingMethod !== 'tealca') return null;
  const offices = (tealcaOffices as Record<string, TealcaOffice[]>)[data.mrwState?.trim() ?? ''];
  if (!offices) return 'El estado TEALCA seleccionado no es válido.';
  const name = data.mrwOffice?.trim() ?? '';
  if (!offices.some((o) => o.name === name)) {
    return 'La oficina TEALCA seleccionada no corresponde a ese estado.';
  }
  return null;
}

function toSavedAddress(row: {
  id: string;
  userId: string;
  alias: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  phoneNumber: string;
  shippingMethod: string;
  mrwState: string | null;
  mrwOffice: string | null;
  officeAddress: string | null;
  officeCity: string | null;
  isDefault: boolean;
  createdAt: Date;
}): SavedAddress {
  return {
    id:             row.id,
    userId:         row.userId,
    alias:          row.alias,
    firstName:      row.firstName,
    lastName:       row.lastName,
    idNumber:       row.idNumber,
    phoneNumber:    row.phoneNumber,
    shippingMethod: row.shippingMethod as ShippingMethod,
    mrwState:       row.mrwState,
    mrwOffice:      row.mrwOffice,
    officeAddress:  row.officeAddress,
    officeCity:     row.officeCity,
    isDefault:      row.isDefault,
    createdAt:      row.createdAt.toISOString(),
  };
}

export async function getSavedAddresses(): Promise<SavedAddress[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return [];

  try {
    const rows = await prisma.savedAddress.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toSavedAddress);
  } catch (error) {
    // PRD-137: el [] en error de BD es indistinguible de «sin direcciones».
    // Cambiar el contrato exige actualizar consumidores ajenos a este segmento:
    // // DEPENDENCIA-02: app/components/checkout/ShippingForm.tsx (checkout)
    // // DEPENDENCIA-04: app/account/addresses/page.tsx (cuenta cliente)
    logError('address_get_failed', error, { operation: 'get_saved_addresses' });
    return [];
  }
}

export async function createSavedAddress(
  data: SavedAddressInput,
): Promise<ActionResult & { address?: SavedAddress }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { success: false, message: 'No autorizado.' };
  }

  const userId = session.user.id;

  if (!data.alias?.trim()) return { success: false, message: 'El alias es requerido.' };
  if (!data.firstName?.trim()) return { success: false, message: 'El nombre es requerido.' };
  if (!data.lastName?.trim()) return { success: false, message: 'El apellido es requerido.' };
  if (!data.idNumber?.trim()) return { success: false, message: 'La cédula es requerida.' };
  if (!data.phoneNumber?.trim()) return { success: false, message: 'El teléfono es requerido.' };
  const isCarrierMethod = data.shippingMethod === 'mrw' || data.shippingMethod === 'zoom' || data.shippingMethod === 'tealca';

  if (isCarrierMethod && !data.mrwState?.trim()) {
    const label = { tienda: '', mrw: 'MRW', zoom: 'ZOOM', tealca: 'TEALCA' }[data.shippingMethod] ?? '';
    return { success: false, message: `Selecciona un estado para ${label}.` };
  }
  if (isCarrierMethod && !data.mrwOffice?.trim()) {
    const label = { tienda: '', mrw: 'MRW', zoom: 'ZOOM', tealca: 'TEALCA' }[data.shippingMethod] ?? '';
    return { success: false, message: `Selecciona una oficina ${label}.` };
  }
  const mrwError = validateMrwSelection(data);
  if (mrwError) return { success: false, message: mrwError };
  const zoomError = validateZoomSelection(data);
  if (zoomError) return { success: false, message: zoomError };
  const tealcaError = validateTealcaSelection(data);
  if (tealcaError) return { success: false, message: tealcaError };

  try {
    const count = await prisma.savedAddress.count({ where: { userId } });
    if (count >= MAX_ADDRESSES_PER_USER) {
      return {
        success: false,
        message: `Alcanzaste el límite de ${MAX_ADDRESSES_PER_USER} direcciones guardadas. Elimina alguna para agregar otra.`,
      };
    }
    const isFirst = count === 0;
    const makeDefault = data.isDefault || isFirst;

    if (makeDefault) {
      await prisma.savedAddress.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const created = await prisma.savedAddress.create({
      data: {
        userId,
        alias:          data.alias.trim(),
        firstName:      data.firstName.trim(),
        lastName:       data.lastName.trim(),
        idNumber:       data.idNumber.trim(),
        phoneNumber:    data.phoneNumber.trim(),
        shippingMethod: data.shippingMethod,
        mrwState:       isCarrierMethod ? (data.mrwState?.trim() ?? null) : null,
        mrwOffice:      isCarrierMethod ? (data.mrwOffice?.trim() ?? null) : null,
        officeAddress:  (data.shippingMethod === 'zoom' || data.shippingMethod === 'tealca') ? (data.officeAddress?.trim() || null) : null,
        officeCity:     (data.shippingMethod === 'zoom' || data.shippingMethod === 'tealca') ? (data.officeCity?.trim()    || null) : null,
      },
    });

    revalidatePath('/account/addresses');
    return { success: true, message: 'Dirección guardada.', address: toSavedAddress(created) };
  } catch (error) {
    logError('address_create_failed', error, { operation: 'create_saved_address' });
    return { success: false, message: 'Error al guardar la dirección.' };
  }
}

export async function updateSavedAddress(
  id: string,
  data: SavedAddressInput,
): Promise<ActionResult & { address?: SavedAddress }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, message: 'No autorizado.' };

  const userId = session.user.id;

  if (!data.alias?.trim()) return { success: false, message: 'El alias es requerido.' };
  if (!data.firstName?.trim()) return { success: false, message: 'El nombre es requerido.' };
  if (!data.lastName?.trim()) return { success: false, message: 'El apellido es requerido.' };
  if (!data.idNumber?.trim()) return { success: false, message: 'La cédula es requerida.' };
  if (!data.phoneNumber?.trim()) return { success: false, message: 'El teléfono es requerido.' };

  const isCarrierMethod = data.shippingMethod === 'mrw' || data.shippingMethod === 'zoom' || data.shippingMethod === 'tealca';

  if (isCarrierMethod && !data.mrwState?.trim()) {
    const label = { tienda: '', mrw: 'MRW', zoom: 'ZOOM', tealca: 'TEALCA' }[data.shippingMethod] ?? '';
    return { success: false, message: `Selecciona un estado para ${label}.` };
  }
  if (isCarrierMethod && !data.mrwOffice?.trim()) {
    const label = { tienda: '', mrw: 'MRW', zoom: 'ZOOM', tealca: 'TEALCA' }[data.shippingMethod] ?? '';
    return { success: false, message: `Selecciona una oficina ${label}.` };
  }
  const mrwError = validateMrwSelection(data);
  if (mrwError) return { success: false, message: mrwError };
  const zoomError = validateZoomSelection(data);
  if (zoomError) return { success: false, message: zoomError };
  const tealcaError = validateTealcaSelection(data);
  if (tealcaError) return { success: false, message: tealcaError };

  try {
    const existing = await prisma.savedAddress.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return { success: false, message: 'Dirección no encontrada.' };
    }

    if (data.isDefault) {
      await prisma.savedAddress.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.savedAddress.update({
      where: { id },
      data: {
        alias:          data.alias.trim(),
        firstName:      data.firstName.trim(),
        lastName:       data.lastName.trim(),
        idNumber:       data.idNumber.trim(),
        phoneNumber:    data.phoneNumber.trim(),
        shippingMethod: data.shippingMethod,
        mrwState:       isCarrierMethod ? (data.mrwState?.trim() ?? null) : null,
        mrwOffice:      isCarrierMethod ? (data.mrwOffice?.trim() ?? null) : null,
        officeAddress:  (data.shippingMethod === 'zoom' || data.shippingMethod === 'tealca') ? (data.officeAddress?.trim() || null) : null,
        officeCity:     (data.shippingMethod === 'zoom' || data.shippingMethod === 'tealca') ? (data.officeCity?.trim()    || null) : null,
        isDefault:      data.isDefault ?? existing.isDefault,
      },
    });

    revalidatePath('/account/addresses');
    return { success: true, message: 'Dirección actualizada.', address: toSavedAddress(updated) };
  } catch (error) {
    logError('address_update_failed', error, { operation: 'update_saved_address' });
    return { success: false, message: 'Error al actualizar la dirección.' };
  }
}

export async function deleteSavedAddress(id: string): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, message: 'No autorizado.' };

  const userId = session.user.id;

  try {
    const existing = await prisma.savedAddress.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return { success: false, message: 'Dirección no encontrada.' };
    }

    await prisma.savedAddress.delete({ where: { id } });

    if (existing.isDefault) {
      const next = await prisma.savedAddress.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await prisma.savedAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    revalidatePath('/account/addresses');
    return { success: true, message: 'Dirección eliminada.' };
  } catch (error) {
    logError('address_delete_failed', error, { operation: 'delete_saved_address' });
    return { success: false, message: 'Error al eliminar la dirección.' };
  }
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, message: 'No autorizado.' };

  const userId = session.user.id;

  try {
    const existing = await prisma.savedAddress.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return { success: false, message: 'Dirección no encontrada.' };
    }

    await prisma.savedAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    await prisma.savedAddress.update({ where: { id }, data: { isDefault: true } });

    revalidatePath('/account/addresses');
    return { success: true, message: 'Dirección predeterminada actualizada.' };
  } catch (error) {
    logError('address_set_default_failed', error, { operation: 'set_default_address' });
    return { success: false, message: 'Error al actualizar la dirección predeterminada.' };
  }
}
