/**
 * Módulo central de métodos de pago y descuentos por divisas.
 * Schemas, defaults, normalización, disponibilidad, validación por canal
 * y cálculo de descuento viven aquí — no duplicar reglas en UI/checkout.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

/** Subconjunto de settings necesarios para disponibilidad de métodos built-in. */
export type PaymentSettingsSlice = {
  pagoMovil: { bank: string; phone: string; idNumber: string };
  transferencia: {
    bank: string;
    accountNumber: string;
    accountHolder: string;
    rif: string;
  };
  binancePayId?: string;
  /** Puede ser el array crudo o ya normalizado. */
  paymentMethods?: unknown;
  /** Descuento global único por pago en divisas (sobrescribe % por método). */
  divisaDiscountEnabled?: boolean;
  divisaDiscountPercent?: number;
};

function isPagoMovilConfigured(settings: PaymentSettingsSlice): boolean {
  const pm = settings.pagoMovil;
  return Boolean(pm.bank.trim() && pm.phone.trim() && pm.idNumber.trim());
}

function isTransferenciaConfigured(settings: PaymentSettingsSlice): boolean {
  const tr = settings.transferencia;
  return Boolean(
    tr.bank.trim() &&
      tr.accountNumber.trim() &&
      tr.accountHolder.trim() &&
      tr.rif.trim(),
  );
}

export const PAYMENT_METHOD_KINDS = [
  'PAGO_MOVIL',
  'BANK_TRANSFER',
  'BINANCE',
  'ZELLE',
  'CASH_FOREIGN_CURRENCY',
  'CASHEA',
  'CUSTOM_FOREIGN_CURRENCY',
] as const;

export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export const PAYMENT_CURRENCY_GROUPS = ['VES', 'USD'] as const;
export type PaymentCurrencyGroup =
  (typeof PAYMENT_CURRENCY_GROUPS)[number];

/** Grupo de moneda derivado autoritativamente del kind (no se persiste). */
export function paymentMethodCurrencyGroup(
  kind: PaymentMethodKind,
): PaymentCurrencyGroup {
  switch (kind) {
    case 'PAGO_MOVIL':
    case 'BANK_TRANSFER':
    case 'CASHEA':
      return 'VES';

    case 'BINANCE':
    case 'ZELLE':
    case 'CASH_FOREIGN_CURRENCY':
    case 'CUSTOM_FOREIGN_CURRENCY':
      return 'USD';
  }
}

export const FULL_DELIVERY_SCOPES = ['ANY', 'STORE_PICKUP_ONLY'] as const;
export type FullDeliveryScope = (typeof FULL_DELIVERY_SCOPES)[number];

export const BUILTIN_PAYMENT_METHOD_IDS = [
  'pagomovil',
  'transferencia',
  'binancepay',
  'zelle',
  'efectivo-divisas',
  'cashea',
] as const;

export type BuiltinPaymentMethodId = (typeof BUILTIN_PAYMENT_METHOD_IDS)[number];

const BUILTIN_ID_SET = new Set<string>(BUILTIN_PAYMENT_METHOD_IDS);

/** Kinds que pueden tener descuento por pago en divisas. */
export const DISCOUNT_ELIGIBLE_KINDS: ReadonlySet<PaymentMethodKind> = new Set([
  'BINANCE',
  'ZELLE',
  'CASH_FOREIGN_CURRENCY',
  'CUSTOM_FOREIGN_CURRENCY',
]);

const PAYMENT_METHOD_ID_REGEX = /^[a-z0-9:_-]+$/;
const CURRENCY_REGEX = /^[A-Z0-9]+$/;

function hasAtMostTwoDecimals(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return Math.round(n * 100) === Math.round(n * 1000) / 10 || Number.isInteger(n * 100);
}

export const paymentMethodConfigSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(PAYMENT_METHOD_ID_REGEX, 'ID de método inválido.'),
    kind: z.enum(PAYMENT_METHOD_KINDS),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(180).default(''),
    active: z.boolean(),
    enabledInWhatsapp: z.boolean(),
    enabledInFull: z.boolean(),
    discountEligible: z.boolean(),
    discountEnabled: z.boolean(),
    discountPercent: z
      .number()
      .min(0)
      .max(100)
      .refine(
        (n) => Number.isFinite(n) && Math.round(n * 100) / 100 === n,
        'El porcentaje admite máximo dos decimales.',
      ),
    requireReferenceInFull: z.boolean(),
    requireProofInFull: z.boolean(),
    instructions: z.string().trim().max(1500).default(''),
    recipientLabel: z.string().trim().max(80).default(''),
    recipientValue: z.string().trim().max(300).default(''),
    acceptedCurrencies: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .min(2)
          .max(10)
          .regex(CURRENCY_REGEX, 'Moneda inválida.'),
      )
      .max(10)
      .default([]),
    fullDeliveryScope: z.enum(FULL_DELIVERY_SCOPES).default('ANY'),
    sortOrder: z.number().int().min(0).max(9999),
  })
  .superRefine((method, ctx) => {
    const canDiscount = DISCOUNT_ELIGIBLE_KINDS.has(method.kind);
    if (!canDiscount && (method.discountEligible || method.discountEnabled || method.discountPercent > 0)) {
      ctx.addIssue({
        code: 'custom',
        message: `El método ${method.kind} no admite descuento por divisas.`,
        path: ['discountEligible'],
      });
    }
    if (method.discountEligible && method.kind === 'CUSTOM_FOREIGN_CURRENCY') {
      // custom puede ser elegible
    } else if (method.discountEligible && !canDiscount) {
      ctx.addIssue({
        code: 'custom',
        message: 'discountEligible solo aplica a métodos en divisas.',
        path: ['discountEligible'],
      });
    }
    if (method.kind === 'CUSTOM_FOREIGN_CURRENCY' && !method.id.startsWith('custom:')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Los métodos personalizados deben usar el prefijo custom:.',
        path: ['id'],
      });
    }
    if (BUILTIN_ID_SET.has(method.id) && method.kind === 'CUSTOM_FOREIGN_CURRENCY') {
      ctx.addIssue({
        code: 'custom',
        message: 'No se puede reutilizar un ID built-in para un método personalizado.',
        path: ['id'],
      });
    }
  });

export type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;

export const paymentMethodsArraySchema = z
  .array(paymentMethodConfigSchema)
  .max(20, 'Máximo 20 métodos de pago.')
  .superRefine((methods, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const builtinKindsSeen = new Set<PaymentMethodKind>();

    for (let i = 0; i < methods.length; i++) {
      const m = methods[i]!;
      if (ids.has(m.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `ID duplicado: ${m.id}`,
          path: [i, 'id'],
        });
      }
      ids.add(m.id);

      const nameKey = m.name.trim().toLowerCase();
      if (names.has(nameKey)) {
        ctx.addIssue({
          code: 'custom',
          message: `Nombre duplicado: ${m.name}`,
          path: [i, 'name'],
        });
      }
      names.add(nameKey);

      if (BUILTIN_ID_SET.has(m.id)) {
        if (builtinKindsSeen.has(m.kind) && m.kind !== 'CUSTOM_FOREIGN_CURRENCY') {
          // Built-in kinds should appear once (by id uniqueness already covers)
        }
        builtinKindsSeen.add(m.kind);
      }

      // Active method validation (canal-dependiente)
      if (m.active) {
        const enabledInAnyChannel = m.enabledInWhatsapp || m.enabledInFull;
        const needsFullConfiguration = m.active && m.enabledInFull;

        if (m.discountEnabled && m.discountPercent <= 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'No se puede activar descuento con porcentaje 0.',
            path: [i, 'discountPercent'],
          });
        }
        if (m.kind === 'ZELLE' && needsFullConfiguration && !m.recipientValue.trim()) {
          ctx.addIssue({
            code: 'custom',
            message: 'Zelle habilitado en checkout Full requiere un destinatario.',
            path: [i, 'recipientValue'],
          });
        }
        if (m.kind === 'CUSTOM_FOREIGN_CURRENCY' && needsFullConfiguration) {
          if (!m.instructions.trim()) {
            ctx.addIssue({
              code: 'custom',
              message:
                'El método personalizado habilitado en checkout Full requiere instrucciones.',
              path: [i, 'instructions'],
            });
          }
          if (!m.recipientValue.trim()) {
            ctx.addIssue({
              code: 'custom',
              message:
                'El método personalizado habilitado en checkout Full requiere destinatario.',
              path: [i, 'recipientValue'],
            });
          }
        }
        if (
          m.kind === 'CASH_FOREIGN_CURRENCY' &&
          enabledInAnyChannel &&
          m.acceptedCurrencies.length === 0
        ) {
          ctx.addIssue({
            code: 'custom',
            message: 'Efectivo activo requiere al menos una moneda.',
            path: [i, 'acceptedCurrencies'],
          });
        }
      }
    }

    // Built-in methods cannot be duplicated by kind among built-ins
    const builtinByKind = new Map<PaymentMethodKind, number>();
    for (const m of methods) {
      if (!BUILTIN_ID_SET.has(m.id)) continue;
      const count = (builtinByKind.get(m.kind) ?? 0) + 1;
      builtinByKind.set(m.kind, count);
      if (count > 1) {
        ctx.addIssue({
          code: 'custom',
          message: `Método built-in duplicado para kind ${m.kind}.`,
          path: [],
        });
      }
    }
  });

export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: 'pagomovil',
    kind: 'PAGO_MOVIL',
    name: 'Pago Móvil',
    description: 'Transfiere desde tu app bancaria',
    active: true,
    enabledInWhatsapp: true,
    enabledInFull: true,
    discountEligible: false,
    discountEnabled: false,
    discountPercent: 0,
    requireReferenceInFull: true,
    requireProofInFull: true,
    instructions: '',
    recipientLabel: '',
    recipientValue: '',
    acceptedCurrencies: [],
    fullDeliveryScope: 'ANY',
    sortOrder: 10,
  },
  {
    id: 'transferencia',
    kind: 'BANK_TRANSFER',
    name: 'Transferencia Bancaria',
    description: 'Transferencia bancaria nacional',
    active: true,
    enabledInWhatsapp: true,
    enabledInFull: true,
    discountEligible: false,
    discountEnabled: false,
    discountPercent: 0,
    requireReferenceInFull: true,
    requireProofInFull: true,
    instructions: '',
    recipientLabel: '',
    recipientValue: '',
    acceptedCurrencies: [],
    fullDeliveryScope: 'ANY',
    sortOrder: 20,
  },
  {
    id: 'binancepay',
    kind: 'BINANCE',
    name: 'Binance Pay',
    description: 'Paga a nuestra cuenta y sube captura + Order ID',
    active: true,
    enabledInWhatsapp: true,
    enabledInFull: true,
    discountEligible: true,
    discountEnabled: false,
    discountPercent: 0,
    requireReferenceInFull: true,
    requireProofInFull: true,
    instructions: '',
    recipientLabel: '',
    recipientValue: '',
    acceptedCurrencies: [],
    fullDeliveryScope: 'ANY',
    sortOrder: 30,
  },
  {
    id: 'zelle',
    kind: 'ZELLE',
    name: 'Zelle',
    description: 'Pago en USD vía Zelle',
    active: false,
    enabledInWhatsapp: true,
    enabledInFull: true,
    discountEligible: true,
    discountEnabled: false,
    discountPercent: 0,
    requireReferenceInFull: true,
    requireProofInFull: true,
    instructions: '',
    recipientLabel: 'Titular / email Zelle',
    recipientValue: '',
    acceptedCurrencies: ['USD'],
    fullDeliveryScope: 'ANY',
    sortOrder: 40,
  },
  {
    id: 'efectivo-divisas',
    kind: 'CASH_FOREIGN_CURRENCY',
    name: 'Efectivo',
    description: 'Pago en efectivo en divisas',
    active: false,
    enabledInWhatsapp: true,
    enabledInFull: true,
    discountEligible: true,
    discountEnabled: false,
    discountPercent: 0,
    requireReferenceInFull: false,
    requireProofInFull: false,
    instructions: '',
    recipientLabel: '',
    recipientValue: '',
    acceptedCurrencies: ['USD'],
    fullDeliveryScope: 'STORE_PICKUP_ONLY',
    sortOrder: 50,
  },
  {
    id: 'cashea',
    kind: 'CASHEA',
    name: 'Cashea',
    description: 'Compra ahora y paga después — coordinamos por WhatsApp',
    active: true,
    enabledInWhatsapp: true,
    enabledInFull: true,
    discountEligible: false,
    discountEnabled: false,
    discountPercent: 0,
    requireReferenceInFull: false,
    requireProofInFull: false,
    instructions: '',
    recipientLabel: '',
    recipientValue: '',
    acceptedCurrencies: [],
    fullDeliveryScope: 'ANY',
    sortOrder: 60,
  },
];

/** Normaliza un método individual (discountEligible=false ⇒ sin descuento). */
export function normalizePaymentMethod(raw: PaymentMethodConfig): PaymentMethodConfig {
  const canDiscount = DISCOUNT_ELIGIBLE_KINDS.has(raw.kind);
  let discountEligible = canDiscount ? raw.discountEligible : false;
  // CUSTOM: discountEligible solo si kind es CUSTOM_FOREIGN_CURRENCY (ya garantizado)
  if (raw.kind === 'CUSTOM_FOREIGN_CURRENCY') {
    discountEligible = raw.discountEligible;
  }

  let discountEnabled = discountEligible ? raw.discountEnabled : false;
  let discountPercent = discountEligible ? raw.discountPercent : 0;

  if (!discountEligible) {
    discountEnabled = false;
    discountPercent = 0;
  }

  let acceptedCurrencies = (raw.acceptedCurrencies ?? [])
    .map((c) => c.trim().toUpperCase())
    .filter((c) => CURRENCY_REGEX.test(c) && c.length >= 2 && c.length <= 10)
    .slice(0, 10);

  // Efectivo: únicamente USD (normaliza configuraciones antiguas con EUR u otras).
  if (raw.kind === 'CASH_FOREIGN_CURRENCY') {
    acceptedCurrencies = ['USD'];
  }

  return {
    ...raw,
    id: raw.id.trim(),
    name: raw.name.trim(),
    description: (raw.description ?? '').trim(),
    instructions: (raw.instructions ?? '').trim(),
    recipientLabel: (raw.recipientLabel ?? '').trim(),
    recipientValue: (raw.recipientValue ?? '').trim(),
    discountEligible,
    discountEnabled,
    discountPercent: Math.round(discountPercent * 100) / 100,
    acceptedCurrencies,
    fullDeliveryScope: raw.fullDeliveryScope ?? 'ANY',
  };
}

/**
 * Incorpora defaults para instalaciones antiguas sin paymentMethods.
 * No sobrescribe métodos ya presentes; completa built-ins faltantes.
 */
export function mergePaymentMethodsWithDefaults(
  incoming: unknown,
): PaymentMethodConfig[] {
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return DEFAULT_PAYMENT_METHODS.map(normalizePaymentMethod);
  }

  const parsed: PaymentMethodConfig[] = [];
  for (const item of incoming) {
    const result = paymentMethodConfigSchema.safeParse(item);
    if (result.success) {
      parsed.push(normalizePaymentMethod(result.data));
    }
  }

  if (parsed.length === 0) {
    return DEFAULT_PAYMENT_METHODS.map(normalizePaymentMethod);
  }

  const byId = new Map(parsed.map((m) => [m.id, m]));
  // Ensure all built-ins exist
  for (const def of DEFAULT_PAYMENT_METHODS) {
    if (!byId.has(def.id)) {
      byId.set(def.id, normalizePaymentMethod(def));
    }
  }

  return [...byId.values()]
    .map(normalizePaymentMethod)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Valida y normaliza la lista completa (para guardado admin). */
export function parseAndNormalizePaymentMethods(input: unknown): {
  ok: true;
  methods: PaymentMethodConfig[];
} | {
  ok: false;
  error: z.ZodError;
} {
  const merged = mergePaymentMethodsWithDefaults(input);
  // Re-validate after merge for uniqueness etc. — but if input was partial
  // defaults fill gaps. For explicit save, validate the provided array first.
  const provided = Array.isArray(input) ? input : [];
  if (provided.length > 0) {
    const normalized = provided.map((item) => {
      const r = paymentMethodConfigSchema.safeParse(item);
      return r.success ? normalizePaymentMethod(r.data) : item;
    });
    const result = paymentMethodsArraySchema.safeParse(normalized);
    if (!result.success) {
      return { ok: false, error: result.error };
    }
    return { ok: true, methods: result.data.map(normalizePaymentMethod) };
  }
  return { ok: true, methods: merged };
}

export type CheckoutChannel = 'whatsapp' | 'web';

export type CheckoutPaymentMethodDto = {
  id: string;
  kind: PaymentMethodKind;
  name: string;
  description: string;
  discountEnabled: boolean;
  discountPercent: number;
  requireReferenceInFull: boolean;
  requireProofInFull: boolean;
  instructions: string;
  recipientLabel: string;
  recipientValue: string;
  acceptedCurrencies: string[];
  fullDeliveryScope: FullDeliveryScope;
  currencyGroup: PaymentCurrencyGroup;
};

/**
 * ¿El método tiene todos los datos necesarios para checkout Full?
 * Alias interno semántico: isMethodConfiguredForFull.
 */
export function isMethodConfigured(
  method: PaymentMethodConfig,
  settings: PaymentSettingsSlice,
): boolean {
  return isMethodConfiguredForFull(method, settings);
}

/** ¿Este método tiene todos los datos necesarios para checkout Full? */
export function isMethodConfiguredForFull(
  method: PaymentMethodConfig,
  settings: PaymentSettingsSlice,
): boolean {
  switch (method.kind) {
    case 'PAGO_MOVIL':
      return isPagoMovilConfigured(settings);
    case 'BANK_TRANSFER':
      return isTransferenciaConfigured(settings);
    case 'BINANCE':
      return Boolean((settings.binancePayId ?? '').trim());
    case 'ZELLE':
      return Boolean(method.recipientValue.trim());
    case 'CASH_FOREIGN_CURRENCY':
      return method.acceptedCurrencies.length > 0;
    case 'CASHEA':
      return true;
    case 'CUSTOM_FOREIGN_CURRENCY':
      return Boolean(method.instructions.trim() && method.recipientValue.trim());
    default:
      return false;
  }
}

/**
 * DTO sanitizado para checkout: solo métodos activos, habilitados para el canal
 * y correctamente configurados.
 */
export function buildCheckoutPaymentMethods(
  settings: PaymentSettingsSlice,
  channel: CheckoutChannel,
): CheckoutPaymentMethodDto[] {
  const methods = applyGlobalDivisaDiscount(
    mergePaymentMethodsWithDefaults(settings.paymentMethods),
    {
      enabled: Boolean(settings.divisaDiscountEnabled),
      percent: settings.divisaDiscountPercent ?? 0,
    },
  );

  return methods
    .filter((m) => m.active)
    .filter((m) =>
      channel === 'whatsapp' ? m.enabledInWhatsapp : m.enabledInFull,
    )
    .filter((m) => {
      if (channel === 'whatsapp') {
        // Los datos de recepción se coordinan por WhatsApp.
        // Efectivo debe conservar moneda válida.
        if (
          m.kind === 'CASH_FOREIGN_CURRENCY' &&
          m.acceptedCurrencies.length === 0
        ) {
          return false;
        }
        return true;
      }

      return isMethodConfigured(m, settings);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      name: m.name,
      // En WhatsApp el comprobante/Order ID se coordina por chat, no en el sitio.
      description:
        channel === 'whatsapp' && m.kind === 'BINANCE' ? '' : m.description,
      discountEnabled: Boolean(m.discountEligible && m.discountEnabled && m.discountPercent > 0),
      discountPercent:
        m.discountEligible && m.discountEnabled ? m.discountPercent : 0,
      requireReferenceInFull: m.requireReferenceInFull,
      requireProofInFull: m.requireProofInFull,
      instructions: m.instructions,
      recipientLabel: m.recipientLabel,
      // En WhatsApp no exponemos datos bancarios sensibles de PM/Transfer vacíos;
      // para Zelle/custom/Binance sí se necesitan instrucciones.
      recipientValue: m.recipientValue,
      acceptedCurrencies: m.acceptedCurrencies,
      fullDeliveryScope: m.fullDeliveryScope,
      currencyGroup: paymentMethodCurrencyGroup(m.kind),
    }));
}

export function findPaymentMethodById(
  methods: PaymentMethodConfig[],
  id: string,
): PaymentMethodConfig | undefined {
  return methods.find((m) => m.id === id);
}

export type GlobalDivisaDiscountConfig = {
  enabled: boolean;
  percent: number;
};

/**
 * Sobrescribe discountEnabled/discountPercent con el % global.
 * Elegibilidad autoritativa por `kind` (DISCOUNT_ELIGIBLE_KINDS), no por el
 * flag almacenado. Fuente única: no muta los objetos de entrada.
 * Fail-closed: NaN/Infinity/>100/negativos/>2 decimales ⇒ descuento apagado.
 */
export function applyGlobalDivisaDiscount(
  methods: PaymentMethodConfig[],
  { enabled, percent }: GlobalDivisaDiscountConfig,
): PaymentMethodConfig[] {
  const validPercent =
    Number.isFinite(percent) &&
    percent > 0 &&
    percent <= 100 &&
    Math.round(percent * 100) / 100 === percent;
  const active = enabled === true && validPercent;

  return methods.map((method) => {
    if (DISCOUNT_ELIGIBLE_KINDS.has(method.kind)) {
      return {
        ...method,
        discountEligible: true,
        discountEnabled: active,
        discountPercent: active ? percent : 0,
      };
    }
    return {
      ...method,
      discountEligible: false,
      discountEnabled: false,
      discountPercent: 0,
    };
  });
}

/** Porcentaje efectivo de descuento (0 si no aplica). */
export function resolvePaymentDiscountPercent(method: PaymentMethodConfig): number {
  if (!method.discountEligible || !method.discountEnabled) return 0;
  return method.discountPercent > 0 ? method.discountPercent : 0;
}

/**
 * Calcula el descuento por método sobre el subtotal original en céntimos.
 * Política: redondeo a céntimo entero, tope = subtotal.
 */
export function calculatePaymentDiscountCents(
  subtotalBeforeDiscountCents: number,
  paymentDiscountPercent: number,
): number {
  if (paymentDiscountPercent <= 0 || subtotalBeforeDiscountCents <= 0) return 0;
  return Math.min(
    subtotalBeforeDiscountCents,
    Math.round((subtotalBeforeDiscountCents * paymentDiscountPercent) / 100),
  );
}

export function estimatePaymentDiscountUsd(
  subtotalUsd: number,
  paymentDiscountPercent: number,
): number {
  if (paymentDiscountPercent <= 0 || subtotalUsd <= 0) return 0;
  return Math.min(
    subtotalUsd,
    Math.round(subtotalUsd * paymentDiscountPercent) / 100,
  );
}

export type PaymentDiscountPreviewLine = {
  key: string;
  originalCents: number;
  discountCents: number;
  finalCents: number;
};

export type PaymentDiscountPreview = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  lines: PaymentDiscountPreviewLine[];
};

/**
 * Preview visual del descuento por líneas (céntimos enteros).
 * No sustituye el cálculo autoritativo del servidor al crear el pedido.
 */
export function buildPaymentDiscountPreview(
  lines: Array<{
    key: string;
    unitPriceUsd: number;
    quantity: number;
  }>,
  paymentDiscountPercent: number,
): PaymentDiscountPreview {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { subtotalCents: 0, discountCents: 0, totalCents: 0, lines: [] };
  }

  const prepared = lines.map((line) => {
    const unitPriceUsd =
      Number.isFinite(line.unitPriceUsd) && line.unitPriceUsd > 0
        ? line.unitPriceUsd
        : 0;
    const quantity =
      Number.isInteger(line.quantity) && line.quantity >= 1 ? line.quantity : 0;
    const originalCents = Math.round(unitPriceUsd * 100) * quantity;
    return { key: line.key, originalCents };
  });

  const subtotalCents = prepared.reduce((sum, line) => sum + line.originalCents, 0);
  const percent =
    Number.isFinite(paymentDiscountPercent) && paymentDiscountPercent > 0
      ? paymentDiscountPercent
      : 0;
  const discountCents = calculatePaymentDiscountCents(subtotalCents, percent);

  if (discountCents <= 0 || subtotalCents <= 0) {
    return {
      subtotalCents,
      discountCents: 0,
      totalCents: subtotalCents,
      lines: prepared.map((line) => ({
        key: line.key,
        originalCents: line.originalCents,
        discountCents: 0,
        finalCents: line.originalCents,
      })),
    };
  }

  // Largest-remainder: floor first, then distribute leftover cents by remainder.
  const shares = prepared.map((line, index) => {
    const exact = (discountCents * line.originalCents) / subtotalCents;
    const floor = Math.floor(exact);
    return {
      index,
      key: line.key,
      originalCents: line.originalCents,
      floor,
      remainder: exact - floor,
    };
  });

  const assigned = shares.reduce((sum, s) => sum + s.floor, 0);
  const remaining = discountCents - assigned;
  const extras = new Array<number>(shares.length).fill(0);

  const byRemainder = [...shares].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.index - b.index;
  });

  for (let i = 0; i < remaining; i++) {
    const target = byRemainder[i];
    if (!target) break;
    extras[target.index] = (extras[target.index] ?? 0) + 1;
  }

  const resultLines: PaymentDiscountPreviewLine[] = shares.map((s) => {
    const lineDiscount = Math.min(s.originalCents, s.floor + (extras[s.index] ?? 0));
    return {
      key: s.key,
      originalCents: s.originalCents,
      discountCents: lineDiscount,
      finalCents: s.originalCents - lineDiscount,
    };
  });

  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    lines: resultLines,
  };
}

export type ResolvePaymentMethodParams = {
  methods: PaymentMethodConfig[];
  paymentMethodId: string;
  channel: CheckoutChannel;
  shippingMethod?: string | null;
  paymentCurrency?: string | null;
  paymentReference?: string | null;
  paymentUploadToken?: string | null;
  settings: PaymentSettingsSlice;
};

export type ResolvePaymentMethodResult = {
  method: PaymentMethodConfig;
  paymentDiscountPercent: number;
  resolvedPaymentCurrency: string | null;
};

/**
 * Valida método + canal + moneda + requisitos Full.
 * Lanza mensajes de error de negocio (el caller los convierte en CheckoutError).
 */
export function resolveAndValidatePaymentMethod(
  params: ResolvePaymentMethodParams,
): ResolvePaymentMethodResult {
  const {
    methods,
    paymentMethodId,
    channel,
    shippingMethod,
    paymentCurrency,
    paymentReference,
    paymentUploadToken,
    settings,
  } = params;

  const method = findPaymentMethodById(methods, paymentMethodId);
  if (!method) {
    throw new PaymentMethodValidationError('Método de pago no válido.');
  }
  if (!method.active) {
    throw new PaymentMethodValidationError('El método de pago no está disponible.');
  }
  if (channel === 'whatsapp' && !method.enabledInWhatsapp) {
    throw new PaymentMethodValidationError('Este método no está disponible en WhatsApp.');
  }
  if (channel === 'web' && !method.enabledInFull) {
    throw new PaymentMethodValidationError('Este método no está disponible en el checkout.');
  }

  if (
    channel === 'web' &&
    method.fullDeliveryScope === 'STORE_PICKUP_ONLY' &&
    shippingMethod !== 'tienda'
  ) {
    throw new PaymentMethodValidationError(
      'Este método de pago solo está disponible con retiro en tienda.',
    );
  }

  // Configuración Full: solo en canal web. En WhatsApp se coordina por chat.
  if (channel === 'web') {
    if (method.kind === 'PAGO_MOVIL' && !isPagoMovilConfigured(settings)) {
      throw new PaymentMethodValidationError('Pago Móvil no está configurado.');
    }
    if (method.kind === 'BANK_TRANSFER' && !isTransferenciaConfigured(settings)) {
      throw new PaymentMethodValidationError('Transferencia no está configurada.');
    }
    if (method.kind === 'BINANCE' && !(settings.binancePayId ?? '').trim()) {
      throw new PaymentMethodValidationError('Binance Pay no está configurado.');
    }
    if (method.kind === 'ZELLE' && !method.recipientValue.trim()) {
      throw new PaymentMethodValidationError('Zelle no está configurado.');
    }
    if (method.kind === 'CUSTOM_FOREIGN_CURRENCY') {
      if (!method.instructions.trim() || !method.recipientValue.trim()) {
        throw new PaymentMethodValidationError('Método de pago incompleto.');
      }
    }
  }

  let resolvedPaymentCurrency: string | null = null;
  const rawCurrency = paymentCurrency?.trim().toUpperCase() || null;

  if (method.kind === 'CASH_FOREIGN_CURRENCY') {
    if (!rawCurrency) {
      throw new PaymentMethodValidationError('Selecciona la moneda del pago en efectivo.');
    }
    if (!method.acceptedCurrencies.includes(rawCurrency)) {
      throw new PaymentMethodValidationError('La moneda seleccionada no está aceptada.');
    }
    resolvedPaymentCurrency = rawCurrency;
  } else if (method.acceptedCurrencies.length > 0 && rawCurrency) {
    if (!method.acceptedCurrencies.includes(rawCurrency)) {
      throw new PaymentMethodValidationError('La moneda seleccionada no está aceptada.');
    }
    resolvedPaymentCurrency = rawCurrency;
  } else if (rawCurrency) {
    // Métodos sin monedas: rechazar moneda arbitraria del cliente
    throw new PaymentMethodValidationError('Este método no acepta selección de moneda.');
  }

  if (channel === 'web') {
    if (method.requireReferenceInFull && !paymentReference?.trim()) {
      throw new PaymentMethodValidationError(
        method.kind === 'BINANCE'
          ? 'Indica el Order ID o referencia que muestra Binance tras pagar.'
          : 'Indica el número de referencia del pago.',
      );
    }
    if (method.requireProofInFull && !paymentUploadToken?.trim()) {
      throw new PaymentMethodValidationError(
        method.kind === 'BINANCE'
          ? 'Sube la captura de pantalla del pago en Binance.'
          : 'Sube el comprobante de pago.',
      );
    }
  }

  return {
    method,
    paymentDiscountPercent: resolvePaymentDiscountPercent(method),
    resolvedPaymentCurrency,
  };
}

export class PaymentMethodValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentMethodValidationError';
  }
}

/**
 * Lee métodos de pago desde AppConfig dentro de una transacción Prisma.
 */
export async function loadPaymentMethodsFromTransaction(
  tx: Prisma.TransactionClient,
): Promise<PaymentMethodConfig[]> {
  const record = await tx.appConfig.findUnique({
    where: { key: 'store_settings' },
  });
  if (!record) {
    return applyGlobalDivisaDiscount(
      DEFAULT_PAYMENT_METHODS.map(normalizePaymentMethod),
      { enabled: false, percent: 0 },
    );
  }
  try {
    const raw = JSON.parse(record.value) as {
      paymentMethods?: unknown;
      divisaDiscountEnabled?: boolean;
      divisaDiscountPercent?: number;
    };
    return applyGlobalDivisaDiscount(mergePaymentMethodsWithDefaults(raw.paymentMethods), {
      enabled: Boolean(raw.divisaDiscountEnabled),
      percent:
        typeof raw.divisaDiscountPercent === 'number' ? raw.divisaDiscountPercent : 0,
    });
  } catch {
    return applyGlobalDivisaDiscount(
      DEFAULT_PAYMENT_METHODS.map(normalizePaymentMethod),
      { enabled: false, percent: 0 },
    );
  }
}

/** Factory para método personalizado en divisas (admin UI). */
export function createCustomForeignCurrencyMethod(
  existing: PaymentMethodConfig[],
): PaymentMethodConfig {
  const maxOrder = existing.reduce((max, m) => Math.max(max, m.sortOrder), 0);
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `custom:${crypto.randomUUID()}`
      : `custom:${Date.now().toString(36)}`;

  return normalizePaymentMethod({
    id,
    kind: 'CUSTOM_FOREIGN_CURRENCY',
    name: 'Método en divisas',
    description: '',
    active: false,
    enabledInWhatsapp: true,
    enabledInFull: true,
    discountEligible: true,
    discountEnabled: false,
    discountPercent: 0,
    requireReferenceInFull: true,
    requireProofInFull: true,
    instructions: '',
    recipientLabel: 'Destinatario',
    recipientValue: '',
    acceptedCurrencies: [],
    fullDeliveryScope: 'ANY',
    sortOrder: Math.min(9999, maxOrder + 10),
  });
}

export function isBuiltinPaymentMethodId(id: string): boolean {
  return BUILTIN_ID_SET.has(id);
}

export function isDeletablePaymentMethod(method: PaymentMethodConfig): boolean {
  return method.kind === 'CUSTOM_FOREIGN_CURRENCY' && method.id.startsWith('custom:');
}

/** Re-export helper for two-decimal check used by UI. */
export { hasAtMostTwoDecimals };
