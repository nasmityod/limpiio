'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requirePermissionAction } from '@/lib/admin-access-server';
import { storeSettingsSchema, writeSettings, type StoreSettings } from '@/lib/data-store';
import {
  pickGeneralSettingsDto,
  pickFinancialSettingsDto,
} from '@/lib/settings-api-schemas';
import {
  shippingEstimatesSchema,
  type ShippingEstimates,
} from '@/lib/shipping-estimates';
import { writeShippingEstimates } from '@/lib/shipping-estimates-db';
import { z } from 'zod';
import {
  normalizeWhatsAppPhone,
  isValidWhatsAppPhone,
  WHATSAPP_PHONE_INVALID_MESSAGE,
} from '@/lib/whatsapp-phone';

export type GeneralSettingsActionResult = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  data?: ReturnType<typeof pickGeneralSettingsDto>;
};

export type FinancialSettingsActionResult = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  data?: ReturnType<typeof pickFinancialSettingsDto>;
};

/** @deprecated Usar GeneralSettingsActionResult o FinancialSettingsActionResult según dominio. */
export interface SettingsActionResult {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  data?: StoreSettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas separados por dominio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Campos de configuración general: datos de contacto, redes sociales y envío.
 * `.strict()` garantiza que campos de otro dominio (pagoMovil, binancePayId…)
 * produzcan error en lugar de ser descartados silenciosamente.
 */
const generalSettingsSchema = z.object({
  storeName:          z.string().min(1, 'El nombre de la tienda es requerido.'),
  tagline:            z.string().optional().default(''),
  phone:              z.string().min(1, 'El teléfono es requerido.'),
  phone2:             z.string().optional().default(''),
  email:              z.string().email('Email inválido.'),
  address:            z.string().optional().default(''),
  instagram:          z.string().optional().default(''),
  facebook:           z.string().optional().default(''),
  labelWidthMm:       z.coerce.number().min(40).max(300).default(100),
  labelHeightMm:      z.coerce.number().min(40).max(400).default(150),
  whatsappOrderPhone: z
    .string()
    .trim()
    .optional()
    .default('')
    .transform(normalizeWhatsAppPhone)
    .refine(
      (value) => value === '' || isValidWhatsAppPhone(value),
      WHATSAPP_PHONE_INVALID_MESSAGE,
    ),
}).strict();

/**
 * Campos financieros: cuentas de pago y configuración de Binance.
 * `.strict()` garantiza que campos generales (storeName, phone…)
 * produzcan error en lugar de ser descartados silenciosamente.
 */
const financialSettingsSchema = z.object({
  pagoMovil: z.object({
    bank:     z.string().optional().default(''),
    phone:    z.string().optional().default(''),
    idNumber: z.string().optional().default(''),
  }),
  transferencia: z.object({
    bank:          z.string().optional().default(''),
    accountNumber: z.string().optional().default(''),
    accountHolder: z.string().optional().default(''),
    rif:           z.string().optional().default(''),
  }),
  binancePayId: z.string().optional().default(''),
  binanceQrUrl: z.string().trim().optional().default(''),
  paymentMethods: z.array(z.unknown()).max(20),
  divisaDiscountEnabled: z.boolean().optional().default(false),
  divisaDiscountPercent: z
    .number()
    .min(0)
    .max(100)
    .refine((n) => Math.round(n * 100) / 100 === n, 'Máx 2 decimales')
    .optional()
    .default(0),
}).strict();

// ─────────────────────────────────────────────────────────────────────────────
// Actions separadas por permiso
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Actualiza configuración general de la tienda (contacto, redes, envío).
 * Requiere permiso STORE_SETTINGS.
 */
export async function updateGeneralStoreSettings(input: unknown): Promise<GeneralSettingsActionResult> {
  await requirePermissionAction('STORE_SETTINGS');

  const parsed = generalSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (errors[key] ??= []).push(issue.message);
    }
    return {
      success: false,
      message: 'Algunos campos no son válidos. Revisa los marcados en rojo.',
      errors,
    };
  }

  // Leer settings actuales y mezclar solo los campos generales
  const { readSettings } = await import('@/lib/data-store');
  const current = await readSettings();
  const merged: StoreSettings = {
    ...current,
    storeName:          parsed.data.storeName,
    tagline:            parsed.data.tagline,
    phone:              parsed.data.phone,
    phone2:             parsed.data.phone2,
    email:              parsed.data.email,
    address:            parsed.data.address,
    instagram:          parsed.data.instagram,
    facebook:           parsed.data.facebook,
    labelWidthMm:       parsed.data.labelWidthMm,
    labelHeightMm:      parsed.data.labelHeightMm,
    whatsappOrderPhone: parsed.data.whatsappOrderPhone,
  };

  // Validar el objeto completo antes de guardar
  const fullParsed = storeSettingsSchema.safeParse(merged);
  if (!fullParsed.success) {
    return { success: false, message: 'Error al combinar configuración.' };
  }

  await writeSettings(fullParsed.data);
  revalidatePath('/', 'layout');
  revalidatePath('/admin/settings');
  revalidateTag('store-settings', 'default');

  return {
    success: true,
    message: 'Configuración general guardada.',
    data: pickGeneralSettingsDto(fullParsed.data),
  };
}

/**
 * Actualiza configuración financiera (cuentas de pago, Binance).
 * Requiere permiso FINANCIAL_SETTINGS.
 * STORE_SETTINGS no puede modificar estos campos enviándolos manualmente.
 */
export async function updateFinancialSettings(input: unknown): Promise<FinancialSettingsActionResult> {
  await requirePermissionAction('FINANCIAL_SETTINGS');

  const parsed = financialSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (errors[key] ??= []).push(issue.message);
    }
    return {
      success: false,
      message: 'Algunos campos no son válidos. Revisa los marcados en rojo.',
      errors,
    };
  }

  const { parseAndNormalizePaymentMethods } = await import('@/lib/payment-methods');
  const methodsResult = parseAndNormalizePaymentMethods(parsed.data.paymentMethods);
  if (!methodsResult.ok) {
    const errors: Record<string, string[]> = {};
    for (const issue of methodsResult.error.issues) {
      const key = ['paymentMethods', ...issue.path].join('.') || 'paymentMethods';
      (errors[key] ??= []).push(issue.message);
    }
    return {
      success: false,
      message: 'Algunos métodos de pago no son válidos. Revisa los marcados en rojo.',
      errors,
    };
  }

  // Leer settings actuales y mezclar solo los campos financieros
  const { readSettings } = await import('@/lib/data-store');
  const current = await readSettings();
  const merged: StoreSettings = {
    ...current,
    pagoMovil:    parsed.data.pagoMovil,
    transferencia: parsed.data.transferencia,
    binancePayId: parsed.data.binancePayId,
    binanceQrUrl: parsed.data.binanceQrUrl,
    paymentMethods: methodsResult.methods,
    divisaDiscountEnabled: parsed.data.divisaDiscountEnabled,
    divisaDiscountPercent: parsed.data.divisaDiscountPercent,
  };

  const fullParsed = storeSettingsSchema.safeParse(merged);
  if (!fullParsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of fullParsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (errors[key] ??= []).push(issue.message);
    }
    return {
      success: false,
      message: 'Error al combinar configuración financiera.',
      errors,
    };
  }

  await writeSettings(fullParsed.data);
  revalidatePath('/', 'layout');
  revalidatePath('/admin/settings');
  revalidateTag('store-settings', 'default');

  return {
    success: true,
    message: 'Configuración financiera guardada.',
    data: pickFinancialSettingsDto(fullParsed.data),
  };
}

export interface ShippingEstimatesResult {
  success: boolean;
  message: string;
  data?: ShippingEstimates;
}

/** Guarda los estimados de envío. Requiere STORE_SETTINGS. */
export async function updateShippingEstimates(input: unknown): Promise<ShippingEstimatesResult> {
  await requirePermissionAction('STORE_SETTINGS');

  const parsed = shippingEstimatesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? 'Datos de estimados inválidos.',
    };
  }

  await writeShippingEstimates(parsed.data);
  revalidatePath('/checkout');

  return { success: true, message: 'Estimados de envío guardados.', data: parsed.data };
}
