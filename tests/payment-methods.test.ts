import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_METHODS,
  mergePaymentMethodsWithDefaults,
  normalizePaymentMethod,
  calculatePaymentDiscountCents,
  resolvePaymentDiscountPercent,
  resolveAndValidatePaymentMethod,
  paymentMethodsArraySchema,
  PaymentMethodValidationError,
  buildCheckoutPaymentMethods,
  createCustomForeignCurrencyMethod,
  applyGlobalDivisaDiscount,
  paymentMethodCurrencyGroup,
  buildPaymentDiscountPreview,
  type PaymentMethodConfig,
} from '@/lib/payment-methods';

function withDiscount(id: string, percent: number): PaymentMethodConfig {
  const base = DEFAULT_PAYMENT_METHODS.find((m) => m.id === id)!;
  return normalizePaymentMethod({
    ...base,
    active: true,
    discountEligible: true,
    discountEnabled: true,
    discountPercent: percent,
    recipientValue: id === 'zelle' ? 'zelle@example.com' : base.recipientValue,
  });
}

const settingsSlice = {
  pagoMovil: { bank: 'Banesco', phone: '0412', idNumber: 'V-1' },
  transferencia: {
    bank: 'Mercantil',
    accountNumber: '0105',
    accountHolder: 'MT',
    rif: 'J-1',
  },
  binancePayId: '12345678',
};

describe('payment-methods', () => {
  it('defaults incluyen built-ins y sin paymentMethods usa defaults', () => {
    const methods = mergePaymentMethodsWithDefaults(undefined);
    expect(methods.map((m) => m.id)).toEqual(
      expect.arrayContaining(['pagomovil', 'transferencia', 'binancepay', 'zelle', 'efectivo-divisas', 'cashea']),
    );
  });

  it('Binance 10% sobre 10000 céntimos → 1000', () => {
    expect(calculatePaymentDiscountCents(10000, 10)).toBe(1000);
  });

  it('Zelle 7.5% sobre 10000 céntimos → 750', () => {
    expect(calculatePaymentDiscountCents(10000, 7.5)).toBe(750);
  });

  it('redondeo determinista 19.99 * 7.5%', () => {
    // 1999 céntimos * 7.5% = 149.925 → round 150
    expect(calculatePaymentDiscountCents(1999, 7.5)).toBe(150);
  });

  it('sin descuento → 0', () => {
    const m = DEFAULT_PAYMENT_METHODS.find((x) => x.id === 'binancepay')!;
    expect(resolvePaymentDiscountPercent(m)).toBe(0);
    expect(calculatePaymentDiscountCents(10000, 0)).toBe(0);
  });

  it('Pago Móvil no puede activar descuento', () => {
    const bad = {
      ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'pagomovil')!,
      discountEligible: true,
      discountEnabled: true,
      discountPercent: 10,
    };
    const parsed = paymentMethodsArraySchema.safeParse([
      ...DEFAULT_PAYMENT_METHODS.filter((m) => m.id !== 'pagomovil'),
      bad,
    ]);
    expect(parsed.success).toBe(false);
  });

  it('Transferencia y Cashea rechazan descuento', () => {
    for (const id of ['transferencia', 'cashea'] as const) {
      const bad = {
        ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === id)!,
        discountEligible: true,
        discountEnabled: true,
        discountPercent: 5,
      };
      const list = DEFAULT_PAYMENT_METHODS.map((m) => (m.id === id ? bad : m));
      expect(paymentMethodsArraySchema.safeParse(list).success).toBe(false);
    }
  });

  it('IDs duplicados se rechazan', () => {
    const list = [...DEFAULT_PAYMENT_METHODS, { ...DEFAULT_PAYMENT_METHODS[0]! }];
    expect(paymentMethodsArraySchema.safeParse(list).success).toBe(false);
  });

  it('nombres duplicados case-insensitive se rechazan', () => {
    const custom = createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS);
    custom.name = 'pago móvil';
    custom.active = false;
    custom.instructions = 'x';
    custom.recipientValue = 'y';
    expect(paymentMethodsArraySchema.safeParse([...DEFAULT_PAYMENT_METHODS, custom]).success).toBe(false);
  });

  it('más de 20 métodos se rechazan', () => {
    const extras = Array.from({ length: 20 }, (_, i) => {
      const c = createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS);
      c.id = `custom:extra-${i}`;
      c.name = `Extra ${i}`;
      c.active = false;
      c.instructions = 'ok';
      c.recipientValue = 'ok';
      return c;
    });
    expect(paymentMethodsArraySchema.safeParse([...DEFAULT_PAYMENT_METHODS, ...extras]).success).toBe(false);
  });

  it('efectivo activo sin monedas se rechaza', () => {
    const list = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'efectivo-divisas'
        ? { ...m, active: true, acceptedCurrencies: [] as string[] }
        : m,
    );
    expect(paymentMethodsArraySchema.safeParse(list).success).toBe(false);
  });

  it('custom activo + Full ON sin destinatario se rechaza', () => {
    const custom = createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS);
    custom.active = true;
    custom.enabledInFull = true;
    custom.instructions = 'Paga aquí';
    custom.recipientValue = '';
    expect(paymentMethodsArraySchema.safeParse([...DEFAULT_PAYMENT_METHODS, custom]).success).toBe(false);
  });

  it('Zelle Full exige referencia y comprobante', () => {
    const methods = [withDiscount('zelle', 7.5)];
    expect(() =>
      resolveAndValidatePaymentMethod({
        methods,
        paymentMethodId: 'zelle',
        channel: 'web',
        settings: settingsSlice,
        paymentReference: null,
        paymentUploadToken: null,
      }),
    ).toThrow(PaymentMethodValidationError);
  });

  it('Zelle WhatsApp no exige referencia ni comprobante', () => {
    const methods = [withDiscount('zelle', 7.5)];
    const resolved = resolveAndValidatePaymentMethod({
      methods,
      paymentMethodId: 'zelle',
      channel: 'whatsapp',
      settings: settingsSlice,
    });
    expect(resolved.paymentDiscountPercent).toBe(7.5);
  });

  it('efectivo sin moneda o moneda inválida → error', () => {
    const cash = normalizePaymentMethod({
      ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!,
      active: true,
      discountEnabled: true,
      discountPercent: 5,
    });
    expect(() =>
      resolveAndValidatePaymentMethod({
        methods: [cash],
        paymentMethodId: 'efectivo-divisas',
        channel: 'whatsapp',
        settings: settingsSlice,
      }),
    ).toThrow(/moneda/i);
    expect(() =>
      resolveAndValidatePaymentMethod({
        methods: [cash],
        paymentMethodId: 'efectivo-divisas',
        channel: 'whatsapp',
        settings: settingsSlice,
        paymentCurrency: 'GBP',
      }),
    ).toThrow(/aceptada/i);
  });

  it('efectivo STORE_PICKUP_ONLY con MRW falla en Full; tienda ok', () => {
    const cash = normalizePaymentMethod({
      ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!,
      active: true,
      fullDeliveryScope: 'STORE_PICKUP_ONLY',
    });
    expect(() =>
      resolveAndValidatePaymentMethod({
        methods: [cash],
        paymentMethodId: 'efectivo-divisas',
        channel: 'web',
        shippingMethod: 'mrw',
        paymentCurrency: 'USD',
        settings: settingsSlice,
      }),
    ).toThrow(/retiro en tienda/i);
    const ok = resolveAndValidatePaymentMethod({
      methods: [cash],
      paymentMethodId: 'efectivo-divisas',
      channel: 'web',
      shippingMethod: 'tienda',
      paymentCurrency: 'USD',
      settings: settingsSlice,
    });
    expect(ok.resolvedPaymentCurrency).toBe('USD');
  });

  it('método inexistente o inactivo falla', () => {
    expect(() =>
      resolveAndValidatePaymentMethod({
        methods: DEFAULT_PAYMENT_METHODS,
        paymentMethodId: 'no-existe',
        channel: 'web',
        settings: settingsSlice,
      }),
    ).toThrow(/no válido/i);
    const inactive = normalizePaymentMethod({
      ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'zelle')!,
      active: false,
      recipientValue: 'x@y.com',
    });
    expect(() =>
      resolveAndValidatePaymentMethod({
        methods: [inactive],
        paymentMethodId: 'zelle',
        channel: 'web',
        settings: settingsSlice,
        paymentReference: '1',
        paymentUploadToken: 'tok',
      }),
    ).toThrow(/no está disponible/i);
  });

  it('buildCheckoutPaymentMethods solo activos y configurados', () => {
    const dto = buildCheckoutPaymentMethods(
      {
        ...settingsSlice,
        paymentMethods: DEFAULT_PAYMENT_METHODS,
      },
      'web',
    );
    expect(dto.find((m) => m.id === 'zelle')).toBeUndefined(); // inactive default
    expect(dto.find((m) => m.id === 'binancepay')).toBeTruthy();
    expect(dto.find((m) => m.id === 'cashea')).toBeTruthy();
  });

  it('applyGlobalDivisaDiscount ON 10% → elegibles 10%; Cashea/PagoMóvil 0%', () => {
    const result = applyGlobalDivisaDiscount(DEFAULT_PAYMENT_METHODS, {
      enabled: true,
      percent: 10,
    });
    for (const id of ['binancepay', 'zelle', 'efectivo-divisas'] as const) {
      const m = result.find((x) => x.id === id)!;
      expect(m.discountEligible).toBe(true);
      expect(m.discountEnabled).toBe(true);
      expect(m.discountPercent).toBe(10);
    }
    for (const id of ['cashea', 'pagomovil', 'transferencia'] as const) {
      const m = result.find((x) => x.id === id)!;
      expect(m.discountEligible).toBe(false);
      expect(m.discountEnabled).toBe(false);
      expect(m.discountPercent).toBe(0);
    }
  });

  it('19. Global ON 10%: BINANCE/ZELLE/CASH/CUSTOM = 10%', () => {
    const custom = createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS);
    custom.active = false;
    custom.discountEligible = false;
    const result = applyGlobalDivisaDiscount([...DEFAULT_PAYMENT_METHODS, custom], {
      enabled: true,
      percent: 10,
    });
    for (const kind of ['BINANCE', 'ZELLE', 'CASH_FOREIGN_CURRENCY', 'CUSTOM_FOREIGN_CURRENCY'] as const) {
      const methods = result.filter((m) => m.kind === kind);
      expect(methods.length).toBeGreaterThan(0);
      for (const m of methods) {
        expect(m.discountEligible).toBe(true);
        expect(m.discountEnabled).toBe(true);
        expect(m.discountPercent).toBe(10);
      }
    }
  });

  it('20. CASHEA/PAGO_MOVIL/BANK_TRANSFER = 0%', () => {
    const result = applyGlobalDivisaDiscount(DEFAULT_PAYMENT_METHODS, {
      enabled: true,
      percent: 10,
    });
    for (const kind of ['CASHEA', 'PAGO_MOVIL', 'BANK_TRANSFER'] as const) {
      const m = result.find((x) => x.kind === kind)!;
      expect(m.discountEligible).toBe(false);
      expect(m.discountEnabled).toBe(false);
      expect(m.discountPercent).toBe(0);
    }
  });

  it('21. Divisa con discountEligible=false se normaliza a true y recibe el global', () => {
    const binance = {
      ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'binancepay')!,
      discountEligible: false,
      discountEnabled: false,
      discountPercent: 0,
    };
    const result = applyGlobalDivisaDiscount([binance], { enabled: true, percent: 12.5 });
    expect(result[0]!.discountEligible).toBe(true);
    expect(result[0]!.discountEnabled).toBe(true);
    expect(result[0]!.discountPercent).toBe(12.5);
  });

  it('applyGlobalDivisaDiscount OFF → todos 0%', () => {
    const withPerMethod = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.discountEligible
        ? { ...m, discountEnabled: true, discountPercent: 15 }
        : m,
    );
    const result = applyGlobalDivisaDiscount(withPerMethod, {
      enabled: false,
      percent: 10,
    });
    for (const m of result) {
      expect(m.discountEnabled).toBe(false);
      expect(m.discountPercent).toBe(0);
    }
  });

  it('22. Flag OFF = todos 0%', () => {
    const result = applyGlobalDivisaDiscount(DEFAULT_PAYMENT_METHODS, {
      enabled: false,
      percent: 10,
    });
    for (const m of result) {
      expect(m.discountEnabled).toBe(false);
      expect(m.discountPercent).toBe(0);
    }
  });

  it('23. Porcentajes inválidos (NaN/Infinity/>100/negativos/>2 decimales) = descuento apagado', () => {
    const invalids = [Number.NaN, Number.POSITIVE_INFINITY, 101, -1, 0, 10.123];
    for (const percent of invalids) {
      const result = applyGlobalDivisaDiscount(DEFAULT_PAYMENT_METHODS, {
        enabled: true,
        percent,
      });
      for (const m of result) {
        expect(m.discountEnabled).toBe(false);
        expect(m.discountPercent).toBe(0);
      }
    }
  });

  describe('validación por canal y currencyGroup', () => {
    it('Zelle active + WhatsApp ON + Full OFF + recipient vacío: schema válido', () => {
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

    it('Zelle active + Full ON + recipient vacío: schema inválido en recipientValue', () => {
      const list = DEFAULT_PAYMENT_METHODS.map((m) =>
        m.id === 'zelle'
          ? {
              ...m,
              active: true,
              enabledInWhatsapp: true,
              enabledInFull: true,
              recipientValue: '',
            }
          : m,
      );
      const parsed = paymentMethodsArraySchema.safeParse(list);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(
          parsed.error.issues.some(
            (i) =>
              i.path.includes('recipientValue') ||
              String(i.message).includes('destinatario'),
          ),
        ).toBe(true);
      }
    });

    it('Custom active + WhatsApp ON + Full OFF + datos vacíos: schema válido', () => {
      const custom = createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS);
      custom.active = true;
      custom.enabledInWhatsapp = true;
      custom.enabledInFull = false;
      custom.instructions = '';
      custom.recipientValue = '';
      expect(
        paymentMethodsArraySchema.safeParse([...DEFAULT_PAYMENT_METHODS, custom]).success,
      ).toBe(true);
    });

    it('Custom active + Full ON + datos vacíos: schema inválido', () => {
      const custom = createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS);
      custom.active = true;
      custom.enabledInFull = true;
      custom.instructions = '';
      custom.recipientValue = '';
      expect(
        paymentMethodsArraySchema.safeParse([...DEFAULT_PAYMENT_METHODS, custom]).success,
      ).toBe(false);
    });

    it('Binance active + WhatsApp ON + Pay ID vacío: aparece en WhatsApp', () => {
      const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
        m.id === 'binancepay'
          ? { ...m, active: true, enabledInWhatsapp: true, enabledInFull: true }
          : m,
      );
      const dto = buildCheckoutPaymentMethods(
        { ...settingsSlice, binancePayId: '', paymentMethods: methods },
        'whatsapp',
      );
      const binance = dto.find((m) => m.id === 'binancepay');
      expect(binance).toBeTruthy();
      // En WS no se pide captura/Order ID en el sitio.
      expect(binance?.description).toBe('');
    });

    it('Binance active + Full ON + Pay ID vacío: no aparece en Full', () => {
      const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
        m.id === 'binancepay'
          ? { ...m, active: true, enabledInWhatsapp: true, enabledInFull: true }
          : m,
      );
      const dto = buildCheckoutPaymentMethods(
        { ...settingsSlice, binancePayId: '', paymentMethods: methods },
        'web',
      );
      expect(dto.find((m) => m.id === 'binancepay')).toBeUndefined();
    });

    it('resolveAndValidatePaymentMethod acepta Binance sin Pay ID en WhatsApp', () => {
      const methods = [
        normalizePaymentMethod({
          ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'binancepay')!,
          active: true,
          enabledInWhatsapp: true,
        }),
      ];
      const resolved = resolveAndValidatePaymentMethod({
        methods,
        paymentMethodId: 'binancepay',
        channel: 'whatsapp',
        settings: { ...settingsSlice, binancePayId: '' },
      });
      expect(resolved.method.id).toBe('binancepay');
    });

    it('resolveAndValidatePaymentMethod rechaza Binance sin Pay ID en web', () => {
      const methods = [
        normalizePaymentMethod({
          ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'binancepay')!,
          active: true,
          enabledInFull: true,
        }),
      ];
      expect(() =>
        resolveAndValidatePaymentMethod({
          methods,
          paymentMethodId: 'binancepay',
          channel: 'web',
          settings: { ...settingsSlice, binancePayId: '' },
          paymentReference: '1',
          paymentUploadToken: 'tok',
        }),
      ).toThrow(/Binance/i);
    });

    it('resolveAndValidatePaymentMethod acepta Zelle sin recipient en WhatsApp', () => {
      const methods = [
        normalizePaymentMethod({
          ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'zelle')!,
          active: true,
          enabledInWhatsapp: true,
          enabledInFull: false,
          recipientValue: '',
        }),
      ];
      const resolved = resolveAndValidatePaymentMethod({
        methods,
        paymentMethodId: 'zelle',
        channel: 'whatsapp',
        settings: settingsSlice,
        paymentCurrency: 'USD',
      });
      expect(resolved.method.id).toBe('zelle');
    });

    it('resolveAndValidatePaymentMethod rechaza Zelle sin recipient en web', () => {
      const methods = [
        normalizePaymentMethod({
          ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'zelle')!,
          active: true,
          enabledInFull: true,
          recipientValue: '',
        }),
      ];
      expect(() =>
        resolveAndValidatePaymentMethod({
          methods,
          paymentMethodId: 'zelle',
          channel: 'web',
          settings: settingsSlice,
          paymentCurrency: 'USD',
          paymentReference: '1',
          paymentUploadToken: 'tok',
        }),
      ).toThrow(/Zelle/i);
    });

    it('Efectivo activo sin acceptedCurrencies: inválido', () => {
      const list = DEFAULT_PAYMENT_METHODS.map((m) =>
        m.id === 'efectivo-divisas'
          ? { ...m, active: true, acceptedCurrencies: [] as string[] }
          : m,
      );
      expect(paymentMethodsArraySchema.safeParse(list).success).toBe(false);
    });

    it('Efectivo con moneda no aceptada: servidor rechaza', () => {
      const cash = normalizePaymentMethod({
        ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!,
        active: true,
      });
      expect(() =>
        resolveAndValidatePaymentMethod({
          methods: [cash],
          paymentMethodId: 'efectivo-divisas',
          channel: 'whatsapp',
          settings: settingsSlice,
          paymentCurrency: 'GBP',
        }),
      ).toThrow(/aceptada/i);
    });

    it('Grupos currencyGroup por kind', () => {
      expect(paymentMethodCurrencyGroup('PAGO_MOVIL')).toBe('VES');
      expect(paymentMethodCurrencyGroup('BANK_TRANSFER')).toBe('VES');
      expect(paymentMethodCurrencyGroup('CASHEA')).toBe('VES');
      expect(paymentMethodCurrencyGroup('BINANCE')).toBe('USD');
      expect(paymentMethodCurrencyGroup('ZELLE')).toBe('USD');
      expect(paymentMethodCurrencyGroup('CASH_FOREIGN_CURRENCY')).toBe('USD');
      expect(paymentMethodCurrencyGroup('CUSTOM_FOREIGN_CURRENCY')).toBe('USD');
    });

    it('DTO incluye currencyGroup derivado del kind', () => {
      const dto = buildCheckoutPaymentMethods(
        { ...settingsSlice, paymentMethods: DEFAULT_PAYMENT_METHODS },
        'whatsapp',
      );
      expect(dto.find((m) => m.id === 'pagomovil')?.currencyGroup).toBe('VES');
      expect(dto.find((m) => m.id === 'binancepay')?.currencyGroup).toBe('USD');
    });

    it('Cashea continúa sin descuento', () => {
      const result = applyGlobalDivisaDiscount(DEFAULT_PAYMENT_METHODS, {
        enabled: true,
        percent: 10,
      });
      const cashea = result.find((m) => m.kind === 'CASHEA')!;
      expect(cashea.discountEligible).toBe(false);
      expect(cashea.discountEnabled).toBe(false);
      expect(cashea.discountPercent).toBe(0);
    });

    it('Métodos de divisa conservan el descuento global', () => {
      const result = applyGlobalDivisaDiscount(DEFAULT_PAYMENT_METHODS, {
        enabled: true,
        percent: 8,
      });
      for (const kind of [
        'BINANCE',
        'ZELLE',
        'CASH_FOREIGN_CURRENCY',
      ] as const) {
        const m = result.find((x) => x.kind === kind)!;
        expect(m.discountEnabled).toBe(true);
        expect(m.discountPercent).toBe(8);
      }
    });
  });

  describe('efectivo solo USD', () => {
    it('DEFAULT_PAYMENT_METHODS efectivo contiene exactamente USD', () => {
      const cash = DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!;
      expect(cash.acceptedCurrencies).toEqual(['USD']);
    });

    it('normalizePaymentMethod transforma USD+EUR en solo USD para efectivo', () => {
      const cash = normalizePaymentMethod({
        ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!,
        acceptedCurrencies: ['USD', 'EUR'],
      });
      expect(cash.acceptedCurrencies).toEqual(['USD']);
    });

    it('normalizePaymentMethod transforma solo EUR en USD para efectivo', () => {
      const cash = normalizePaymentMethod({
        ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!,
        acceptedCurrencies: ['EUR'],
      });
      expect(cash.acceptedCurrencies).toEqual(['USD']);
    });

    it('custom foreign currency conserva monedas configuradas', () => {
      const custom = normalizePaymentMethod({
        ...createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS),
        acceptedCurrencies: ['USDT', 'EUR'],
      });
      expect(custom.acceptedCurrencies).toEqual(['USDT', 'EUR']);
    });

    it('DTO de checkout efectivo expone únicamente USD', () => {
      const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
        m.id === 'efectivo-divisas'
          ? { ...m, active: true, acceptedCurrencies: ['USD', 'EUR'] }
          : { ...m, active: m.active },
      );
      const dto = buildCheckoutPaymentMethods(
        { ...settingsSlice, paymentMethods: methods },
        'whatsapp',
      );
      expect(dto.find((m) => m.id === 'efectivo-divisas')?.acceptedCurrencies).toEqual(['USD']);
    });

    it('servidor acepta efectivo + USD', () => {
      const cash = normalizePaymentMethod({
        ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!,
        active: true,
        acceptedCurrencies: ['USD', 'EUR'],
      });
      const resolved = resolveAndValidatePaymentMethod({
        methods: [cash],
        paymentMethodId: 'efectivo-divisas',
        channel: 'whatsapp',
        settings: settingsSlice,
        paymentCurrency: 'USD',
      });
      expect(resolved.resolvedPaymentCurrency).toBe('USD');
    });

    it('servidor rechaza efectivo + EUR', () => {
      const cash = normalizePaymentMethod({
        ...DEFAULT_PAYMENT_METHODS.find((m) => m.id === 'efectivo-divisas')!,
        active: true,
        acceptedCurrencies: ['USD', 'EUR'],
      });
      expect(cash.acceptedCurrencies).toEqual(['USD']);
      expect(() =>
        resolveAndValidatePaymentMethod({
          methods: [cash],
          paymentMethodId: 'efectivo-divisas',
          channel: 'whatsapp',
          settings: settingsSlice,
          paymentCurrency: 'EUR',
        }),
      ).toThrow(/aceptada/i);
    });
  });

  describe('buildPaymentDiscountPreview', () => {
    it('sin descuento devuelve totales originales', () => {
      const preview = buildPaymentDiscountPreview(
        [
          { key: 'a', unitPriceUsd: 10.5, quantity: 2 },
          { key: 'b', unitPriceUsd: 5, quantity: 1 },
        ],
        0,
      );
      expect(preview.subtotalCents).toBe(2600);
      expect(preview.discountCents).toBe(0);
      expect(preview.totalCents).toBe(2600);
      expect(preview.lines.map((l) => l.discountCents)).toEqual([0, 0]);
      expect(preview.lines.map((l) => l.finalCents)).toEqual([2100, 500]);
    });

    it('subtotal $119 y 33% → 11900 / 3927 / 7973', () => {
      const preview = buildPaymentDiscountPreview(
        [{ key: 'solo', unitPriceUsd: 119, quantity: 1 }],
        33,
      );
      expect(preview.subtotalCents).toBe(11900);
      expect(preview.discountCents).toBe(3927);
      expect(preview.totalCents).toBe(7973);
    });

    it('suma de descuentos por línea coincide con discountCents', () => {
      const preview = buildPaymentDiscountPreview(
        [
          { key: 'a', unitPriceUsd: 40, quantity: 1 },
          { key: 'b', unitPriceUsd: 35.5, quantity: 1 },
          { key: 'c', unitPriceUsd: 43.5, quantity: 1 },
        ],
        33,
      );
      expect(preview.subtotalCents).toBe(11900);
      expect(preview.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(preview.discountCents);
    });

    it('suma de finales por línea coincide con totalCents', () => {
      const preview = buildPaymentDiscountPreview(
        [
          { key: 'a', unitPriceUsd: 10.5, quantity: 2 },
          { key: 'b', unitPriceUsd: 98, quantity: 1 },
        ],
        33,
      );
      expect(preview.lines.reduce((s, l) => s + l.finalCents, 0)).toBe(preview.totalCents);
      expect(preview.totalCents).toBe(preview.subtotalCents - preview.discountCents);
    });

    it('residuos de redondeo distribuyen todos los céntimos', () => {
      const preview = buildPaymentDiscountPreview(
        [
          { key: 'a', unitPriceUsd: 10, quantity: 1 },
          { key: 'b', unitPriceUsd: 10, quantity: 1 },
          { key: 'c', unitPriceUsd: 10, quantity: 1 },
        ],
        10,
      );
      // 3000 * 10% = 300; 100 cada uno exacto
      expect(preview.discountCents).toBe(300);
      expect(preview.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(300);
      expect(preview.lines.every((l) => l.discountCents === 100)).toBe(true);

      const uneven = buildPaymentDiscountPreview(
        [
          { key: 'a', unitPriceUsd: 10, quantity: 1 },
          { key: 'b', unitPriceUsd: 20, quantity: 1 },
          { key: 'c', unitPriceUsd: 1, quantity: 1 },
        ],
        7,
      );
      expect(uneven.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(uneven.discountCents);
      expect(uneven.lines.reduce((s, l) => s + l.originalCents, 0)).toBe(uneven.subtotalCents);
    });

    it('carrito vacío no produce NaN', () => {
      const preview = buildPaymentDiscountPreview([], 33);
      expect(preview).toEqual({
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        lines: [],
      });
      expect(Number.isNaN(preview.totalCents)).toBe(false);
    });

    it('porcentaje 0 no produce descuento', () => {
      const preview = buildPaymentDiscountPreview(
        [{ key: 'a', unitPriceUsd: 50, quantity: 2 }],
        0,
      );
      expect(preview.discountCents).toBe(0);
      expect(preview.totalCents).toBe(10000);
    });
  });
});
