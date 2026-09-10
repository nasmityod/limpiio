import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_METHODS,
  type PaymentMethodConfig,
  type PaymentSettingsSlice,
} from '@/lib/payment-methods';
import { buildFooterPaymentMethodLabels } from '@/lib/footer-payment-labels';

function settingsWith(
  methods: PaymentMethodConfig[],
  extras?: Partial<PaymentSettingsSlice>,
): PaymentSettingsSlice {
  return {
    pagoMovil: {
      bank: 'Banesco',
      phone: '04141234567',
      idNumber: 'V123',
    },
    transferencia: {
      bank: 'Banesco',
      accountNumber: '0102',
      accountHolder: 'MT',
      rif: 'J-1',
    },
    binancePayId: 'binance-id',
    paymentMethods: methods,
    ...extras,
  };
}

describe('footer payment method labels', () => {
  it('métodos desactivados no aparecen', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
      ...m,
      active: false,
      enabledInFull: true,
      enabledInWhatsapp: true,
    }));
    expect(buildFooterPaymentMethodLabels(settingsWith(methods))).toEqual([]);
  });

  it('método activo solo en WhatsApp aparece', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
      ...m,
      active: m.id === 'zelle',
      enabledInWhatsapp: m.id === 'zelle',
      enabledInFull: false,
      recipientValue: m.id === 'zelle' ? 'zelle@example.com' : m.recipientValue,
    }));
    const labels = buildFooterPaymentMethodLabels(settingsWith(methods));
    expect(labels).toContain('Zelle');
    expect(labels).toHaveLength(1);
  });

  it('método activo solo en web aparece', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
      ...m,
      active: m.id === 'pagomovil',
      enabledInFull: m.id === 'pagomovil',
      enabledInWhatsapp: false,
    }));
    const labels = buildFooterPaymentMethodLabels(settingsWith(methods));
    expect(labels.some((n) => /pago\s*m[oó]vil/i.test(n))).toBe(true);
  });

  it('método activo en ambos no se duplica', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
      ...m,
      active: m.id === 'transferencia',
      enabledInFull: m.id === 'transferencia',
      enabledInWhatsapp: m.id === 'transferencia',
    }));
    const labels = buildFooterPaymentMethodLabels(settingsWith(methods));
    expect(labels.filter((n) => /transferencia/i.test(n))).toHaveLength(1);
  });

  it('no expone datos privados en las etiquetas', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
      ...m,
      active: true,
      enabledInFull: true,
      enabledInWhatsapp: true,
      recipientValue: 'SECRET-VALUE-123',
      instructions: 'SECRET-INSTRUCTIONS',
    }));
    const labels = buildFooterPaymentMethodLabels(
      settingsWith(methods, { binancePayId: 'SECRET-BINANCE' }),
    );
    const joined = labels.join(' ');
    expect(joined).not.toContain('SECRET');
    expect(joined).not.toMatch(/recipient|instruction|account|rif/i);
  });

  it('método exclusivo WhatsApp con sortOrder bajo aparece antes que web', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => {
      if (m.id === 'zelle') {
        return {
          ...m,
          active: true,
          enabledInWhatsapp: true,
          enabledInFull: false,
          sortOrder: 1,
          recipientValue: 'zelle@example.com',
        };
      }
      if (m.id === 'pagomovil') {
        return {
          ...m,
          active: true,
          enabledInWhatsapp: false,
          enabledInFull: true,
          sortOrder: 20,
        };
      }
      return {
        ...m,
        active: false,
        enabledInWhatsapp: false,
        enabledInFull: false,
      };
    });

    const labels = buildFooterPaymentMethodLabels(settingsWith(methods));
    expect(labels[0]).toBe('Zelle');
    expect(labels.some((n) => /pago\s*m[oó]vil/i.test(n))).toBe(true);
    expect(labels.indexOf('Zelle')).toBeLessThan(
      labels.findIndex((n) => /pago\s*m[oó]vil/i.test(n)),
    );
  });
});

describe('SiteShellData payment surface', () => {
  it('DTO público solo incluye paymentMethodLabels string[]', () => {
    const dto = {
      paymentMethodLabels: ['Pago Móvil', 'Transferencia'],
      settings: {
        storeName: 'MundoTech',
        tagline: '',
        phone: '',
        phone2: '',
        email: '',
        address: '',
        instagram: '',
        facebook: '',
      },
    };
    expect(dto).not.toHaveProperty('pagoMovil');
    expect(dto).not.toHaveProperty('transferencia');
    expect(dto).not.toHaveProperty('binancePayId');
    expect(dto).not.toHaveProperty('recipientValue');
    expect(JSON.stringify(dto)).not.toContain('recipientValue');
    expect(JSON.stringify(dto)).not.toContain('instructions');
  });
});
