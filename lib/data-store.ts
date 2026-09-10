/**
 * data-store.ts
 * Maneja configuración persistente de la tienda vía AppConfig en Prisma.
 * Los pedidos ya no se gestionan aquí — usan el modelo Order en Prisma.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logWarn, logError } from '@/lib/safe-logger';
import { isR2PublicHttpsUrl } from '@/lib/r2-public-url';
import {
  normalizeWhatsAppPhone,
  isValidWhatsAppPhone,
  WHATSAPP_PHONE_INVALID_MESSAGE,
} from '@/lib/whatsapp-phone';
import {
  mergePaymentMethodsWithDefaults,
  paymentMethodsArraySchema,
  DEFAULT_PAYMENT_METHODS,
  type PaymentMethodConfig,
} from '@/lib/payment-methods';

const paymentMethodsFieldSchema = z.preprocess(
  (val) => mergePaymentMethodsWithDefaults(val),
  paymentMethodsArraySchema,
);

export const storeSettingsSchema = z.object({
  storeName:     z.string().min(1, 'El nombre de la tienda es requerido.'),
  tagline:       z.string().optional().default(''),
  phone:         z.string().min(1, 'El teléfono es requerido.'),
  phone2:        z.string().optional().default(''),
  email:         z.string().email('Email inválido.'),
  address:       z.string().optional().default('Barquisimeto, Lara — Venezuela. Atención y envíos a nivel nacional.'),
  instagram:     z.string().optional().default(''),
  facebook:      z.string().optional().default(''),
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
  /**
   * PRD-027/130: Binance Pay configurable desde Admin → sin redeploy.
   * Vacíos por defecto: PaymentForm oculta el método si binancePayId está vacío
   * (evita mostrar instrucciones de pago sin destino real configurado).
   */
  binancePayId:  z.string().optional().default(''),
  binanceQrUrl: z
    .string()
    .trim()
    .max(2048, 'La URL del QR Binance es demasiado larga.')
    .optional()
    .default('')
    .refine(
      (value) => value === '' || isR2PublicHttpsUrl(value),
      'El QR Binance debe estar alojado en el R2 público configurado.',
    ),
  /** Métodos de pago editables + descuentos por divisas. */
  paymentMethods: paymentMethodsFieldSchema.optional().default(() =>
    DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
  ),
  /** Descuento global único por pago en divisas (flag OFF por defecto). */
  divisaDiscountEnabled: z.boolean().optional().default(false),
  divisaDiscountPercent: z
    .number()
    .min(0)
    .max(100)
    .refine((n) => Math.round(n * 100) / 100 === n, 'Máx 2 decimales')
    .optional()
    .default(0),
  // Etiqueta de envío: tamaño de la HOJA de impresión en mm. Default térmica 4×6".
  labelWidthMm:  z.coerce.number().min(40).max(300).default(100),
  labelHeightMm: z.coerce.number().min(40).max(400).default(150),
  /// Número de WhatsApp para pedidos en modo WhatsApp (E.164 venezolano, ej. 584261234567).
  whatsappOrderPhone: z
    .string()
    .trim()
    .optional()
    .default('')
    .transform((value) => normalizeWhatsAppPhone(value))
    .refine(
      (value) => value === '' || isValidWhatsAppPhone(value),
      WHATSAPP_PHONE_INVALID_MESSAGE,
    ),
}).superRefine((data, ctx) => {
  // Pago Móvil: o todo vacío, o todo completo
  const pmKeys = ['bank', 'phone', 'idNumber'] as const;
  const pmVals = pmKeys.map((k) => (data.pagoMovil[k] ?? '').trim());
  if (pmVals.some(Boolean) && !pmVals.every(Boolean)) {
    pmKeys.forEach((k) => {
      if (!(data.pagoMovil[k] ?? '').trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Completa todos los datos de Pago Móvil o déjalos todos vacíos.',
          path: ['pagoMovil', k],
        });
      }
    });
  }
  // Transferencia: o todo vacío, o todo completo
  const trKeys = ['bank', 'accountNumber', 'accountHolder', 'rif'] as const;
  const trVals = trKeys.map((k) => (data.transferencia[k] ?? '').trim());
  if (trVals.some(Boolean) && !trVals.every(Boolean)) {
    trKeys.forEach((k) => {
      if (!(data.transferencia[k] ?? '').trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Completa todos los datos de Transferencia o déjalos todos vacíos.',
          path: ['transferencia', k],
        });
      }
    });
  }
});

export type StoreSettings = z.infer<typeof storeSettingsSchema> & {
  paymentMethods: PaymentMethodConfig[];
};

const SETTINGS_KEY = 'store_settings';

// PRD-101: los datos de contacto provienen del material físico verificado de la
// tienda (letrero, tarjetas, marketing). Los datos FINANCIEROS (pago móvil,
// transferencia) NUNCA llevan placeholders: si la BD no tiene configuración
// quedan vacíos y el checkout debe ocultarlos (ver hasConfiguredPayments).
// Un cliente jamás debe ver una cuenta/RIF que no sea real.
export const DEFAULT_SETTINGS: StoreSettings = {
  storeName:  'MundoTech',
  tagline:    'Tecnología, variedades y lo más viral para tu casa. Tienda física en Barquisimeto y envíos a toda Venezuela.',
  phone:      '0412-1471338',
  phone2:     '0414-5709470',
  email:      'ventas@mundotechve.com',
  address:    'Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001, estado Lara.',
  instagram:  'https://instagram.com/Mundotech39',
  facebook:   '',
  // Sin datos bancarios por defecto: deben guardarse desde Admin → Configuración
  // antes del lanzamiento. La validación todo-o-nada en superRefine exige que
  // si se llena un campo del grupo se completen todos, o todos vacíos.
  pagoMovil:  { bank: '', phone: '', idNumber: '' },
  transferencia: {
    bank:          '',
    accountNumber: '',
    accountHolder: '',
    rif:           '',
  },
  // PRD-027/130: Binance Pay — vacíos por defecto, editables desde Admin.
  binancePayId: '',
  binanceQrUrl: '',
  paymentMethods: DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
  divisaDiscountEnabled: false,
  divisaDiscountPercent: 0,
  labelWidthMm: 100,
  labelHeightMm: 150,
  whatsappOrderPhone: '',
};

/** ¿Pago Móvil tiene los 3 datos completos? (todo-o-nada, ver superRefine arriba). */
export function isPagoMovilConfigured(settings: StoreSettings): boolean {
  const pm = settings.pagoMovil;
  return Boolean(pm.bank.trim() && pm.phone.trim() && pm.idNumber.trim());
}

/** ¿Transferencia tiene los 4 datos completos? (todo-o-nada, ver superRefine arriba). */
export function isTransferenciaConfigured(settings: StoreSettings): boolean {
  const tr = settings.transferencia;
  return Boolean(
    tr.bank.trim() && tr.accountNumber.trim() && tr.accountHolder.trim() && tr.rif.trim(),
  );
}

/** ¿Hay datos de pago reales configurados? (false = BD vacía → DEFAULT_SETTINGS).
 *  DEPENDENCIA-02/04 (PRD-101): el checkout/PaymentForm debe ocultar los métodos
 *  pago móvil/transferencia cuando esto sea false, en vez de mostrar campos vacíos. */
export function hasConfiguredPayments(settings: StoreSettings): boolean {
  return isPagoMovilConfigured(settings) || isTransferenciaConfigured(settings);
}

export async function readSettings(): Promise<StoreSettings> {
  try {
    const record = await prisma.appConfig.findUnique({ where: { key: SETTINGS_KEY } });
    if (!record) {
      // BD accesible pero sin settings guardados: estado esperado en tienda
      // recién instalada — no es un error, pero conviene dejar rastro en prod.
      if (process.env.NODE_ENV === 'production') {
        logWarn('data_store_settings_missing', { operation: 'read_settings' });
      }
      return DEFAULT_SETTINGS;
    }
    // PRD-106: validar el JSON persistido en vez de castear a ciegas; si el
    // contenido está corrupto se registra el motivo y se degrada a DEFAULT.
    const parsed = storeSettingsSchema.safeParse(JSON.parse(record.value));
    if (!parsed.success) {
      logError('data_store_settings_corrupt', new Error('Invalid store_settings JSON'), {
        operation: 'read_settings',
      });
      return DEFAULT_SETTINGS;
    }
    return parsed.data;
  } catch (err) {
    logError('data_store_read_failed', err, { operation: 'read_settings', provider: 'postgres' });
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(settings: StoreSettings): Promise<void> {
  await prisma.appConfig.upsert({
    where:  { key: SETTINGS_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(settings) },
  });
}
