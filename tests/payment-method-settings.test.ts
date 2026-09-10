import { describe, expect, it } from 'vitest';
import { financialSettingsApiSchema, pickFinancialSettingsDto } from '@/lib/settings-api-schemas';
import { storeSettingsSchema, DEFAULT_SETTINGS } from '@/lib/data-store';
import {
  DEFAULT_PAYMENT_METHODS,
  mergePaymentMethodsWithDefaults,
  paymentMethodsArraySchema,
  isMethodConfigured,
  createCustomForeignCurrencyMethod,
} from '@/lib/payment-methods';

describe('payment-method-settings', () => {
  it('settings antiguos sin paymentMethods obtienen defaults', () => {
    const merged = mergePaymentMethodsWithDefaults(undefined);
    expect(merged.length).toBe(DEFAULT_PAYMENT_METHODS.length);
    const parsed = storeSettingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      paymentMethods: undefined,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.paymentMethods.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('pickFinancialSettingsDto incluye paymentMethods', () => {
    const dto = pickFinancialSettingsDto({
      ...DEFAULT_SETTINGS,
      paymentMethods: DEFAULT_PAYMENT_METHODS,
    });
    expect(dto.paymentMethods.length).toBeGreaterThan(0);
    expect(dto.binancePayId).toBeDefined();
  });

  it('financialSettingsApiSchema valida paymentMethods', () => {
    const ok = financialSettingsApiSchema.safeParse({
      pagoMovil: DEFAULT_SETTINGS.pagoMovil,
      transferencia: DEFAULT_SETTINGS.transferencia,
      binancePayId: '',
      binanceQrUrl: '',
      paymentMethods: DEFAULT_PAYMENT_METHODS,
    });
    expect(ok.success).toBe(true);
  });

  it('Zelle activo + Full ON sin destinatario se rechaza', () => {
    const list = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'zelle'
        ? { ...m, active: true, enabledInFull: true, recipientValue: '' }
        : m,
    );
    expect(paymentMethodsArraySchema.safeParse(list).success).toBe(false);
  });

  it('Zelle activo + WhatsApp ON + Full OFF + recipient vacío es válido', () => {
    const list = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'zelle'
        ? {
            ...m,
            active: true,
            enabledInWhatsapp: true,
            enabledInFull: false,
            recipientValue: '',
          }
        : m,
    );
    expect(paymentMethodsArraySchema.safeParse(list).success).toBe(true);
  });

  it('Custom activo + WhatsApp ON + Full OFF + datos vacíos es válido', () => {
    const custom = {
      ...createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS),
      active: true,
      enabledInWhatsapp: true,
      enabledInFull: false,
      instructions: '',
      recipientValue: '',
    };
    expect(
      paymentMethodsArraySchema.safeParse([...DEFAULT_PAYMENT_METHODS, custom]).success,
    ).toBe(true);
  });

  it('Custom activo + Full ON + datos vacíos es inválido', () => {
    const custom = {
      ...createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS),
      active: true,
      enabledInWhatsapp: true,
      enabledInFull: true,
      instructions: '',
      recipientValue: '',
    };
    expect(
      paymentMethodsArraySchema.safeParse([...DEFAULT_PAYMENT_METHODS, custom]).success,
    ).toBe(false);
  });

  it('descuento activo con porcentaje 0 se rechaza si método activo', () => {
    const list = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'binancepay'
        ? { ...m, active: true, discountEnabled: true, discountPercent: 0 }
        : m,
    );
    expect(paymentMethodsArraySchema.safeParse(list).success).toBe(false);
  });

  it('Pago Móvil Configurado solo con bank+phone+idNumber', () => {
    const method = DEFAULT_PAYMENT_METHODS.find((m) => m.kind === 'PAGO_MOVIL')!;
    const empty = {
      pagoMovil: { bank: 'B', phone: '', idNumber: '' },
      transferencia: DEFAULT_SETTINGS.transferencia,
      binancePayId: '',
    };
    expect(isMethodConfigured(method, empty)).toBe(false);
    expect(
      isMethodConfigured(method, {
        ...empty,
        pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
      }),
    ).toBe(true);
  });

  it('Transferencia requiere los cuatro campos', () => {
    const method = DEFAULT_PAYMENT_METHODS.find((m) => m.kind === 'BANK_TRANSFER')!;
    const incomplete = {
      pagoMovil: DEFAULT_SETTINGS.pagoMovil,
      transferencia: {
        bank: 'B',
        accountNumber: '1',
        accountHolder: 'H',
        rif: '',
      },
      binancePayId: '',
    };
    expect(isMethodConfigured(method, incomplete)).toBe(false);
    expect(
      isMethodConfigured(method, {
        ...incomplete,
        transferencia: { ...incomplete.transferencia, rif: 'J-1' },
      }),
    ).toBe(true);
  });

  it('Binance requiere Pay ID; QR opcional', () => {
    const method = DEFAULT_PAYMENT_METHODS.find((m) => m.kind === 'BINANCE')!;
    expect(
      isMethodConfigured(method, {
        pagoMovil: DEFAULT_SETTINGS.pagoMovil,
        transferencia: DEFAULT_SETTINGS.transferencia,
        binancePayId: '',
      }),
    ).toBe(false);
    expect(
      isMethodConfigured(method, {
        pagoMovil: DEFAULT_SETTINGS.pagoMovil,
        transferencia: DEFAULT_SETTINGS.transferencia,
        binancePayId: '123',
      }),
    ).toBe(true);
  });
});
