import { z } from 'zod';
import { isR2PublicHttpsUrl } from '@/lib/r2-public-url';
import {
  normalizeWhatsAppPhone,
  isValidWhatsAppPhone,
  WHATSAPP_PHONE_INVALID_MESSAGE,
} from '@/lib/whatsapp-phone';
import {
  mergePaymentMethodsWithDefaults,
  paymentMethodsArraySchema,
  type PaymentMethodConfig,
} from '@/lib/payment-methods';

/** Subset expuesto con STORE_SETTINGS (GET/PUT general). */
export const generalSettingsApiSchema = z.object({
  storeName:          z.string().min(1),
  tagline:            z.string().optional().default(''),
  phone:              z.string().min(1),
  phone2:             z.string().optional().default(''),
  email:              z.string().email(),
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

const paymentMethodsApiField = z.preprocess(
  (val) => mergePaymentMethodsWithDefaults(val),
  paymentMethodsArraySchema,
);

/** Subset expuesto con FINANCIAL_SETTINGS (GET/PUT financial). */
export const financialSettingsApiSchema = z.object({
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
  binanceQrUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .default('')
    .refine(
      (value) => value === '' || isR2PublicHttpsUrl(value),
      'El QR Binance debe estar alojado en el R2 público configurado.',
    ),
  paymentMethods: paymentMethodsApiField,
  divisaDiscountEnabled: z.boolean().optional().default(false),
  divisaDiscountPercent: z
    .number()
    .min(0)
    .max(100)
    .refine((n) => Math.round(n * 100) / 100 === n, 'Máx 2 decimales')
    .optional()
    .default(0),
}).strict();

export type GeneralSettingsDto = z.infer<typeof generalSettingsApiSchema>;
export type FinancialSettingsDto = z.infer<typeof financialSettingsApiSchema> & {
  paymentMethods: PaymentMethodConfig[];
};

export function pickGeneralSettingsDto(settings: GeneralSettingsDto & Partial<FinancialSettingsDto>): GeneralSettingsDto {
  return generalSettingsApiSchema.parse({
    storeName: settings.storeName,
    tagline: settings.tagline ?? '',
    phone: settings.phone,
    phone2: settings.phone2 ?? '',
    email: settings.email,
    address: settings.address ?? '',
    instagram: settings.instagram ?? '',
    facebook: settings.facebook ?? '',
    labelWidthMm: settings.labelWidthMm ?? 100,
    labelHeightMm: settings.labelHeightMm ?? 150,
    whatsappOrderPhone: settings.whatsappOrderPhone ?? '',
  });
}

export function pickFinancialSettingsDto(settings: Partial<GeneralSettingsDto> & FinancialSettingsDto): FinancialSettingsDto {
  return financialSettingsApiSchema.parse({
    pagoMovil: settings.pagoMovil,
    transferencia: settings.transferencia,
    binancePayId: settings.binancePayId ?? '',
    binanceQrUrl: settings.binanceQrUrl ?? '',
    paymentMethods: settings.paymentMethods,
    divisaDiscountEnabled: settings.divisaDiscountEnabled ?? false,
    divisaDiscountPercent: settings.divisaDiscountPercent ?? 0,
  });
}
