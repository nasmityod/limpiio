/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  estimatePaymentDiscountUsd,
  buildCheckoutPaymentMethods,
  DEFAULT_PAYMENT_METHODS,
  createCustomForeignCurrencyMethod,
  isDeletablePaymentMethod,
  isMethodConfigured,
  normalizePaymentMethod,
  applyGlobalDivisaDiscount,
  type CheckoutPaymentMethodDto,
} from '@/lib/payment-methods';
import { PaymentMethodsAdminSection } from '@/app/admin/settings/PaymentMethodsAdminSection';
import PaymentForm from '@/app/components/checkout/PaymentForm';

const emptyAccounts = {
  pagoMovil: { bank: '', phone: '', idNumber: '' },
  transferencia: { bank: '', accountNumber: '', accountHolder: '', rif: '' },
};

function dtoWithAllActive(opts?: {
  binancePayId?: string;
  zelleRecipient?: string;
  onlyUsd?: boolean;
  onlyVes?: boolean;
  discountPercent?: number;
}): CheckoutPaymentMethodDto[] {
  const methods = DEFAULT_PAYMENT_METHODS.map((m) => {
    let next = {
      ...m,
      active: true,
      enabledInWhatsapp: true,
      enabledInFull: true,
      recipientValue:
        m.id === 'zelle' ? (opts?.zelleRecipient ?? 'zelle@example.com') : m.recipientValue,
    };
    if (opts?.onlyUsd && (m.kind === 'PAGO_MOVIL' || m.kind === 'BANK_TRANSFER' || m.kind === 'CASHEA')) {
      next = { ...next, active: false };
    }
    if (
      opts?.onlyVes &&
      (m.kind === 'BINANCE' ||
        m.kind === 'ZELLE' ||
        m.kind === 'CASH_FOREIGN_CURRENCY' ||
        m.kind === 'CUSTOM_FOREIGN_CURRENCY')
    ) {
      next = { ...next, active: false };
    }
    return next;
  });
  const withDiscount =
    opts?.discountPercent && opts.discountPercent > 0
      ? applyGlobalDivisaDiscount(methods, {
          enabled: true,
          percent: opts.discountPercent,
        })
      : methods;
  return buildCheckoutPaymentMethods(
    {
      pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
      transferencia: { bank: 'B', accountNumber: '1', accountHolder: 'H', rif: 'J' },
      binancePayId: opts?.binancePayId ?? '123',
      paymentMethods: withDiscount,
      divisaDiscountEnabled: Boolean(opts?.discountPercent),
      divisaDiscountPercent: opts?.discountPercent ?? 0,
    },
    'whatsapp',
  );
}

function renderPaymentForm(
  overrides: Partial<{
    checkoutPaymentMethods: CheckoutPaymentMethodDto[];
    whatsappMode: boolean;
    initialData: {
      paymentMethodId: string;
      paymentCurrency: string | null;
      bank: string;
      holderIdNumber: string;
      holderPhone: string;
      referenceNumber: string;
      proofFile: File | null;
      proofPreviewUrl: string;
    } | null;
    onPaymentSubmit: (data: unknown) => void;
    onSelectedMethodChange: (method: CheckoutPaymentMethodDto | null) => void;
  }> = {},
) {
  const onPaymentSubmit = overrides.onPaymentSubmit ?? vi.fn();
  return render(
    <PaymentForm
      onPaymentSubmit={onPaymentSubmit}
      onSelectedMethodChange={overrides.onSelectedMethodChange}
      pagoMovil={{ bank: 'Banesco', phone: '0412', idNumber: 'V-1' }}
      transferencia={{
        bank: 'M',
        accountNumber: '0105',
        accountHolder: 'H',
        rif: 'J-1',
      }}
      binancePayId="pay-id"
      checkoutPaymentMethods={overrides.checkoutPaymentMethods ?? dtoWithAllActive()}
      subtotalUsd={100}
      whatsappMode={overrides.whatsappMode ?? false}
      initialData={overrides.initialData ?? null}
      shippingMethod="tienda"
    />,
  );
}

describe('payment-method-ui', () => {
  it('estimación de ahorro no es autoritativa pero es determinista', () => {
    expect(estimatePaymentDiscountUsd(100, 10)).toBe(10);
    expect(estimatePaymentDiscountUsd(19.99, 7.5)).toBe(1.5);
  });

  it('DTO de checkout no incluye métodos inactivos', () => {
    const dto = buildCheckoutPaymentMethods(
      {
        pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
        transferencia: { bank: 'B', accountNumber: '1', accountHolder: 'H', rif: 'J' },
        binancePayId: '123',
        paymentMethods: DEFAULT_PAYMENT_METHODS,
      },
      'whatsapp',
    );
    expect(dto.every((m) => typeof m.id === 'string')).toBe(true);
    expect(dto.find((m) => m.id === 'zelle')).toBeUndefined();
    for (const m of dto) {
      expect(m).toHaveProperty('discountPercent');
      expect(m).toHaveProperty('requireReferenceInFull');
      expect(m).toHaveProperty('currencyGroup');
      expect(m).not.toHaveProperty('sortOrder');
    }
  });
});

describe('PaymentForm currency groups', () => {
  beforeEach(() => {
    cleanup();
  });

  it('con métodos VES y USD aparecen los dos botones', () => {
    renderPaymentForm();
    expect(screen.getByRole('tab', { name: 'Bolívares' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'USD / divisas' })).toBeTruthy();
  });

  it('Bolívares muestra Pago Móvil, Transferencia y Cashea', () => {
    renderPaymentForm();
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    expect(screen.getByRole('button', { name: /Pago Móvil/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Transferencia Bancaria/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cashea/i })).toBeTruthy();
  });

  it('Bolívares no muestra Binance, Zelle ni Efectivo', () => {
    renderPaymentForm();
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    expect(screen.queryByRole('button', { name: /Binance Pay/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Zelle/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Efectivo/i })).toBeNull();
  });

  it('USD/divisas muestra Binance, Zelle, Efectivo y custom activos', () => {
    const custom = normalizePaymentMethod({
      ...createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS),
      active: true,
      enabledInWhatsapp: true,
      enabledInFull: false,
      name: 'Crypto Wallet',
      instructions: '',
      recipientValue: '',
    });
    const methods = [
      ...DEFAULT_PAYMENT_METHODS.map((m) => ({
        ...m,
        active: true,
        enabledInWhatsapp: true,
        enabledInFull: true,
        recipientValue: m.id === 'zelle' ? 'z@e.com' : m.recipientValue,
      })),
      custom,
    ];
    const dto = buildCheckoutPaymentMethods(
      {
        pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
        transferencia: { bank: 'B', accountNumber: '1', accountHolder: 'H', rif: 'J' },
        binancePayId: '123',
        paymentMethods: methods,
      },
      'whatsapp',
    );
    renderPaymentForm({ checkoutPaymentMethods: dto });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    expect(screen.getByRole('button', { name: /Binance Pay/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Zelle/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Efectivo/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crypto Wallet/i })).toBeTruthy();
  });

  it('al cambiar grupo se limpia el método anterior', () => {
    renderPaymentForm();
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    fireEvent.click(screen.getByRole('button', { name: /Pago Móvil/i }));
    expect(screen.getByRole('button', { name: /Pago Móvil/i }).className).toMatch(/border-navy/);
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    const pm = screen.getByRole('button', { name: /Pago Móvil/i });
    expect(pm.className).not.toMatch(/border-2 border-navy/);
  });

  it('el cambio de grupo no envía automáticamente el formulario', () => {
    const onPaymentSubmit = vi.fn();
    renderPaymentForm({ onPaymentSubmit });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    expect(onPaymentSubmit).not.toHaveBeenCalled();
  });

  it('initialData con Binance abre USD/divisas', () => {
    renderPaymentForm({
      initialData: {
        paymentMethodId: 'binancepay',
        paymentCurrency: null,
        bank: '',
        holderIdNumber: '',
        holderPhone: '',
        referenceNumber: '',
        proofFile: null,
        proofPreviewUrl: '',
      },
    });
    expect(screen.getByRole('tab', { name: 'USD / divisas' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('initialData con Pago Móvil abre Bolívares', () => {
    renderPaymentForm({
      initialData: {
        paymentMethodId: 'pagomovil',
        paymentCurrency: null,
        bank: '',
        holderIdNumber: '',
        holderPhone: '',
        referenceNumber: '',
        proofFile: null,
        proofPreviewUrl: '',
      },
    });
    expect(screen.getByRole('tab', { name: 'Bolívares' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('si solo existen métodos USD, inicia USD', () => {
    renderPaymentForm({ checkoutPaymentMethods: dtoWithAllActive({ onlyUsd: true }) });
    expect(screen.getByRole('tab', { name: 'USD / divisas' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.queryByRole('tab', { name: 'Bolívares' })).toBeNull();
  });

  it('si solo existen métodos VES, no muestra un botón USD vacío', () => {
    renderPaymentForm({ checkoutPaymentMethods: dtoWithAllActive({ onlyVes: true }) });
    expect(screen.getByRole('tab', { name: 'Bolívares' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'USD / divisas' })).toBeNull();
  });

  it('Binance sin Pay ID aparece en UI WhatsApp', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
      ...m,
      active: true,
      enabledInWhatsapp: true,
      enabledInFull: true,
      recipientValue: m.id === 'zelle' ? 'z@e.com' : m.recipientValue,
    }));
    const dto = buildCheckoutPaymentMethods(
      {
        ...emptyAccounts,
        binancePayId: '',
        paymentMethods: methods,
      },
      'whatsapp',
    );
    expect(dto.find((m) => m.id === 'binancepay')).toBeTruthy();
    renderPaymentForm({ checkoutPaymentMethods: dto, whatsappMode: true });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    expect(screen.getByRole('button', { name: /Binance Pay/i })).toBeTruthy();
  });

  it('Binance sin Pay ID no aparece en Full', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
      ...m,
      active: true,
      enabledInWhatsapp: true,
      enabledInFull: true,
      recipientValue: m.id === 'zelle' ? 'z@e.com' : m.recipientValue,
    }));
    const dto = buildCheckoutPaymentMethods(
      {
        pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
        transferencia: { bank: 'B', accountNumber: '1', accountHolder: 'H', rif: 'J' },
        binancePayId: '',
        paymentMethods: methods,
      },
      'web',
    );
    expect(dto.find((m) => m.id === 'binancepay')).toBeUndefined();
  });

  it('Zelle sin recipient aparece en WhatsApp', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'zelle'
        ? {
            ...m,
            active: true,
            enabledInWhatsapp: true,
            enabledInFull: false,
            recipientValue: '',
          }
        : { ...m, active: true, enabledInWhatsapp: true },
    );
    const dto = buildCheckoutPaymentMethods(
      {
        ...emptyAccounts,
        binancePayId: '',
        paymentMethods: methods,
      },
      'whatsapp',
    );
    expect(dto.find((m) => m.id === 'zelle')).toBeTruthy();
    renderPaymentForm({ checkoutPaymentMethods: dto, whatsappMode: true });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    expect(screen.getByRole('button', { name: /^Zelle/i })).toBeTruthy();
  });

  it('Zelle sin recipient no aparece en Full', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'zelle'
        ? {
            ...m,
            active: true,
            enabledInWhatsapp: true,
            enabledInFull: true,
            recipientValue: '',
          }
        : { ...m, active: true, enabledInFull: true },
    );
    const dto = buildCheckoutPaymentMethods(
      {
        pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
        transferencia: { bank: 'B', accountNumber: '1', accountHolder: 'H', rif: 'J' },
        binancePayId: '123',
        paymentMethods: methods,
      },
      'web',
    );
    expect(dto.find((m) => m.id === 'zelle')).toBeUndefined();
  });

  it('en WhatsApp no pide comprobante ni referencia', () => {
    renderPaymentForm({ whatsappMode: true });
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    fireEvent.click(screen.getByRole('button', { name: /Pago Móvil/i }));
    expect(screen.queryByRole('button', { name: /Subir comprobante/i })).toBeNull();
    expect(screen.queryByLabelText(/Número de referencia/i)).toBeNull();
  });

  it('en Full conserva referencia y comprobante cuando están activados', () => {
    const dto = buildCheckoutPaymentMethods(
      {
        pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
        transferencia: { bank: 'B', accountNumber: '1', accountHolder: 'H', rif: 'J' },
        binancePayId: '123',
        paymentMethods: DEFAULT_PAYMENT_METHODS.map((m) => ({
          ...m,
          active: true,
          enabledInFull: true,
          recipientValue: m.id === 'zelle' ? 'z@e.com' : m.recipientValue,
        })),
      },
      'web',
    );
    renderPaymentForm({ checkoutPaymentMethods: dto, whatsappMode: false });
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    fireEvent.click(screen.getByRole('button', { name: /Pago Móvil/i }));
    expect(screen.getByLabelText(/Número de referencia/i)).toBeTruthy();
    expect(screen.getByText(/Subir comprobante/i)).toBeTruthy();
  });

  it('las tarjetas no muestran badge verde de descuento ni aviso de ahorro', () => {
    renderPaymentForm({
      checkoutPaymentMethods: dtoWithAllActive({ discountPercent: 10 }),
    });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    fireEvent.click(screen.getByRole('button', { name: /Binance Pay/i }));
    expect(screen.queryByText(/descuento pagando en divisas/i)).toBeNull();
    expect(screen.queryByText(/Ahorras aproximadamente/i)).toBeNull();
  });

  it('seleccionar Binance invoca onSelectedMethodChange con Binance', () => {
    const onSelectedMethodChange = vi.fn();
    renderPaymentForm({
      checkoutPaymentMethods: dtoWithAllActive({ discountPercent: 10 }),
      onSelectedMethodChange,
    });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    fireEvent.click(screen.getByRole('button', { name: /Binance Pay/i }));
    expect(onSelectedMethodChange).toHaveBeenCalled();
    const last = onSelectedMethodChange.mock.calls.at(-1)?.[0] as CheckoutPaymentMethodDto | null;
    expect(last?.id).toBe('binancepay');
    expect(last?.kind).toBe('BINANCE');
  });

  it('cambiar de USD a VES limpia la selección y emite null', () => {
    const onSelectedMethodChange = vi.fn();
    renderPaymentForm({ onSelectedMethodChange });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    fireEvent.click(screen.getByRole('button', { name: /Binance Pay/i }));
    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    const last = onSelectedMethodChange.mock.calls.at(-1)?.[0];
    expect(last).toBeNull();
  });

  it('seleccionar efectivo asigna automáticamente USD y no ofrece EUR', () => {
    renderPaymentForm({ whatsappMode: true });
    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    fireEvent.click(screen.getByRole('button', { name: /^Efectivo/i }));
    expect(screen.getByText('Moneda de pago')).toBeTruthy();
    expect(screen.getByText('USD')).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'EUR' })).toBeNull();
    expect(screen.queryByLabelText(/^Moneda$/i)).toBeNull();
  });

  it('el selector Bolívares / USD-divisas permanece funcional', () => {
    renderPaymentForm();
    const ves = screen.getByRole('tab', { name: 'Bolívares' });
    const usd = screen.getByRole('tab', { name: 'USD / divisas' });
    expect(ves.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(usd);
    expect(usd.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(ves);
    expect(ves.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: /Pago Móvil/i })).toBeTruthy();
  });

  it('los botones de grupo tienen role tab y aria-selected', () => {
    renderPaymentForm();
    const ves = screen.getByRole('tab', { name: 'Bolívares' });
    const usd = screen.getByRole('tab', { name: 'USD / divisas' });
    expect(ves.getAttribute('aria-selected')).toBe('true');
    expect(usd.getAttribute('aria-selected')).toBe('false');
    fireEvent.click(usd);
    expect(usd.getAttribute('aria-selected')).toBe('true');
    expect(ves.getAttribute('aria-selected')).toBe('false');
  });
});

describe('PaymentMethodsAdminSection UI', () => {
  beforeEach(() => {
    cleanup();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  const accountSettings = {
    pagoMovil: { bank: 'Banesco', phone: '0412', idNumber: 'V-1' },
    transferencia: {
      bank: 'M',
      accountNumber: '01051234567890123456',
      accountHolder: 'H',
      rif: 'J-1',
    },
    binancePayId: 'pay',
  };

  it('todos los métodos empiezan colapsados; abrir uno cierra el anterior', async () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
    const onChange = vi.fn();
    render(
      <PaymentMethodsAdminSection
        methods={methods}
        onChange={onChange}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );

    expect(screen.queryByText('Disponibilidad')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${methods[0]!.name}`) }));
    });
    expect(screen.getByText('Disponibilidad')).toBeTruthy();
    expect(screen.getByDisplayValue(methods[0]!.name)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${methods[1]!.name}`) }));
    });
    expect(screen.getByDisplayValue(methods[1]!.name)).toBeTruthy();
    expect(screen.queryByDisplayValue(methods[0]!.name)).toBeNull();
  });

  it('acordeones tienen aria-expanded / aria-controls', async () => {
    render(
      <PaymentMethodsAdminSection
        methods={DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }))}
        onChange={vi.fn()}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );
    const nameBtn = screen.getByRole('button', {
      name: new RegExp(`^${DEFAULT_PAYMENT_METHODS[0]!.name}`),
    });
    expect(nameBtn.getAttribute('aria-expanded')).toBe('false');
    expect(nameBtn.getAttribute('aria-controls')).toBeTruthy();
    await act(async () => {
      fireEvent.click(nameBtn);
    });
    expect(nameBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('Full apagado oculta referencia/comprobante sin borrar valores', async () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'binancepay'
        ? {
            ...m,
            enabledInFull: true,
            requireReferenceInFull: true,
            requireProofInFull: true,
          }
        : { ...m },
    );
    const onChange = vi.fn();

    const { rerender } = render(
      <PaymentMethodsAdminSection
        methods={methods}
        onChange={onChange}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Binance Pay/ }));
    });
    expect(screen.getByText('Requiere referencia')).toBeTruthy();
    expect(screen.getByText('Requiere comprobante')).toBeTruthy();

    const fullToggle = screen.getByLabelText(/Disponible en checkout Full/i);
    await act(async () => {
      fireEvent.click(fullToggle);
    });
    expect(onChange).toHaveBeenCalled();
    const updated = onChange.mock.calls.at(-1)?.[0];
    const binance = updated.find((m: { id: string }) => m.id === 'binancepay');
    expect(binance.enabledInFull).toBe(false);
    expect(binance.requireReferenceInFull).toBe(true);
    expect(binance.requireProofInFull).toBe(true);

    rerender(
      <PaymentMethodsAdminSection
        methods={updated}
        onChange={onChange}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );
    expect(screen.queryByText('Requiere referencia')).toBeNull();
    expect(screen.queryByText('Requiere comprobante')).toBeNull();
  });

  it('Cashea muestra que no recibe descuento por divisas', async () => {
    render(
      <PaymentMethodsAdminSection
        methods={DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }))}
        onChange={vi.fn()}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Cashea/ }));
    });
    expect(
      screen.getByText(/Cashea no recibe descuento por pago en divisas/i),
    ).toBeTruthy();
  });

  it('efectivo muestra moneda fija USD sin campo editable de monedas', async () => {
    render(
      <PaymentMethodsAdminSection
        methods={DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }))}
        onChange={vi.fn()}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Efectivo/ }));
    });
    expect(screen.getByText(/Moneda aceptada para efectivo/i)).toBeTruthy();
    expect(screen.getByDisplayValue('USD')).toBeTruthy();
    expect(screen.queryByLabelText(/Monedas aceptadas/i)).toBeNull();
  });

  it('método personalizado se añade y abre; solo personalizados pueden eliminarse', async () => {
    let methods = DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }));
    const onChange = vi.fn((next) => {
      methods = next;
    });
    const { rerender } = render(
      <PaymentMethodsAdminSection
        methods={methods}
        onChange={onChange}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Agregar método en divisas/i }));
    });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0];
    const custom = next.find((m: { kind: string }) => m.kind === 'CUSTOM_FOREIGN_CURRENCY');
    expect(custom).toBeTruthy();
    expect(isDeletablePaymentMethod(custom)).toBe(true);

    rerender(
      <PaymentMethodsAdminSection
        methods={next}
        onChange={onChange}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );
    expect(screen.getByText('Eliminar método personalizado')).toBeTruthy();
    expect(screen.getByDisplayValue(custom.name)).toBeTruthy();

    for (const m of DEFAULT_PAYMENT_METHODS) {
      expect(isDeletablePaymentMethod(m)).toBe(false);
    }
  });

  it('chips de canal muestran WhatsApp listo / Full listo', () => {
    render(
      <PaymentMethodsAdminSection
        methods={DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m }))}
        onChange={vi.fn()}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );
    const pago = screen.getByRole('button', { name: /Pago Móvil/i });
    expect(within(pago).getByText('Activo')).toBeTruthy();
    expect(within(pago).getByText('WhatsApp listo')).toBeTruthy();
    expect(within(pago).getByText('Full listo')).toBeTruthy();
    expect(within(pago).queryByText('Incompleto')).toBeNull();
  });

  it('Zelle solo WhatsApp muestra WhatsApp listo y no Incompleto', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'zelle'
        ? {
            ...m,
            active: true,
            enabledInWhatsapp: true,
            enabledInFull: false,
            recipientValue: '',
          }
        : { ...m },
    );
    render(
      <PaymentMethodsAdminSection
        methods={methods}
        onChange={vi.fn()}
        fieldError={() => undefined}
        accountSettings={accountSettings}
      />,
    );
    const zelle = screen.getByRole('button', { name: /^Zelle/i });
    expect(within(zelle).getByText('WhatsApp listo')).toBeTruthy();
    expect(within(zelle).queryByText('Incompleto')).toBeNull();
    expect(within(zelle).queryByText('Full incompleto')).toBeNull();
  });

  it('Binance ambos canales sin Pay ID muestra WhatsApp listo y Full incompleto', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'binancepay'
        ? { ...m, active: true, enabledInWhatsapp: true, enabledInFull: true }
        : { ...m },
    );
    render(
      <PaymentMethodsAdminSection
        methods={methods}
        onChange={vi.fn()}
        fieldError={() => undefined}
        accountSettings={{ ...accountSettings, binancePayId: '' }}
      />,
    );
    const binance = screen.getByRole('button', { name: /^Binance Pay/i });
    expect(within(binance).getByText('WhatsApp listo')).toBeTruthy();
    expect(within(binance).getByText('Full incompleto')).toBeTruthy();
  });

  it('Zelle Full sin recipient bloquea guardado vía fieldError', () => {
    const methods = DEFAULT_PAYMENT_METHODS.map((m) =>
      m.id === 'zelle'
        ? {
            ...m,
            active: true,
            enabledInWhatsapp: true,
            enabledInFull: true,
            recipientValue: '',
          }
        : { ...m },
    );
    const zelleIndex = methods.findIndex((m) => m.id === 'zelle');
    render(
      <PaymentMethodsAdminSection
        methods={methods}
        onChange={vi.fn()}
        fieldError={(path) =>
          path === `paymentMethods.${zelleIndex}.recipientValue`
            ? 'Zelle habilitado en checkout Full requiere un destinatario.'
            : undefined
        }
        accountSettings={accountSettings}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Zelle/i }));
    expect(
      screen.getByText('Zelle habilitado en checkout Full requiere un destinatario.'),
    ).toBeTruthy();
  });
});

describe('isMethodConfigured helpers', () => {
  it('Pago Móvil requiere tres campos; Transferencia cuatro; Binance Pay ID', () => {
    const base = {
      pagoMovil: { bank: '', phone: '', idNumber: '' },
      transferencia: { bank: '', accountNumber: '', accountHolder: '', rif: '' },
      binancePayId: '',
    };
    const pm = DEFAULT_PAYMENT_METHODS.find((m) => m.kind === 'PAGO_MOVIL')!;
    const tr = DEFAULT_PAYMENT_METHODS.find((m) => m.kind === 'BANK_TRANSFER')!;
    const bn = DEFAULT_PAYMENT_METHODS.find((m) => m.kind === 'BINANCE')!;

    expect(isMethodConfigured(pm, base)).toBe(false);
    expect(
      isMethodConfigured(pm, {
        ...base,
        pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
      }),
    ).toBe(true);

    expect(isMethodConfigured(tr, base)).toBe(false);
    expect(
      isMethodConfigured(tr, {
        ...base,
        transferencia: {
          bank: 'B',
          accountNumber: '1',
          accountHolder: 'H',
          rif: 'J',
        },
      }),
    ).toBe(true);

    expect(isMethodConfigured(bn, base)).toBe(false);
    expect(isMethodConfigured(bn, { ...base, binancePayId: 'x' })).toBe(true);
    // QR no es requisito
    expect(
      isMethodConfigured(bn, { ...base, binancePayId: 'x', paymentMethods: [] }),
    ).toBe(true);
  });

  it('createCustomForeignCurrencyMethod genera método eliminable', () => {
    const custom = createCustomForeignCurrencyMethod(DEFAULT_PAYMENT_METHODS);
    expect(custom.kind).toBe('CUSTOM_FOREIGN_CURRENCY');
    expect(isDeletablePaymentMethod(custom)).toBe(true);
  });
});
