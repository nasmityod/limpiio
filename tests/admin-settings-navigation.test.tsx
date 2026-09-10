/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import SettingsClient from '@/app/admin/settings/SettingsClient';
import type { FinancialSettingsDto, GeneralSettingsDto } from '@/lib/settings-api-schemas';
import type { ShippingEstimates } from '@/lib/shipping-estimates';
import { DEFAULT_PAYMENT_METHODS } from '@/lib/payment-methods';

const updateGeneralStoreSettingsMock = vi.fn();
const updateFinancialSettingsMock = vi.fn();
const updateShippingEstimatesMock = vi.fn();

vi.mock('@/app/actions/settingsActions', () => ({
  updateGeneralStoreSettings: (...args: unknown[]) => updateGeneralStoreSettingsMock(...args),
  updateFinancialSettings: (...args: unknown[]) => updateFinancialSettingsMock(...args),
  updateShippingEstimates: (...args: unknown[]) => updateShippingEstimatesMock(...args),
}));

vi.mock('@/app/actions/configActions', () => ({
  updateExchangeRate: vi.fn(),
  updatePricingParams: vi.fn(),
  getPricingParams: vi.fn().mockResolvedValue({ marginPct: 30, factor: 1.5 }),
}));

vi.mock('@/app/actions/productActions', () => ({
  recalculateAllProductPrices: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/components/admin/PhotoUploader', () => ({
  default: function PhotoUploaderStub() {
    return <div data-testid="photo-uploader-stub" />;
  },
}));

const general: GeneralSettingsDto = {
  storeName: 'MundoTech',
  tagline: 'Tag',
  phone: '04121234567',
  phone2: '',
  email: 'ventas@mundotechve.com',
  address: 'Lara',
  instagram: '',
  facebook: '',
  labelWidthMm: 100,
  labelHeightMm: 150,
  whatsappOrderPhone: '',
};

const financial: FinancialSettingsDto = {
  pagoMovil: { bank: 'Banesco', phone: '0412', idNumber: 'V-1' },
  transferencia: {
    bank: 'Mercantil',
    accountNumber: '01051234567890123456',
    accountHolder: 'Empresa',
    rif: 'J-1',
  },
  binancePayId: 'pay-1',
  binanceQrUrl: '',
  paymentMethods: DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
  divisaDiscountEnabled: false,
  divisaDiscountPercent: 0,
};

const estimates: ShippingEstimates = {
  tienda: 'Hoy',
  mrw: '2-4',
  zoom: '2-5',
  tealca: '2-5',
  states: [],
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  updateGeneralStoreSettingsMock.mockResolvedValue({ success: true, message: 'ok', data: general });
  updateFinancialSettingsMock.mockResolvedValue({
    success: true,
    message: 'ok',
    data: {
      ...financial,
      pagoMovil: { ...financial.pagoMovil, bank: 'Banesco Normalizado' },
    },
  });
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ rate: 40 }),
  }) as unknown as typeof fetch;
});

describe('admin settings navigation', () => {
  it('con ambos permisos aparecen tres tabs', () => {
    render(
      <SettingsClient
        canStoreSettings
        canFinancialSettings
        initialGeneral={general}
        initialFinancial={financial}
        initialEstimates={estimates}
        bcvDate={null}
      />,
    );
    expect(screen.getByRole('tab', { name: /Tienda y envíos/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Pagos/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Precios y tasa/i })).toBeTruthy();
  });

  it('solo STORE_SETTINGS: aparece Tienda; no Pagos ni Precios', () => {
    render(
      <SettingsClient
        canStoreSettings
        canFinancialSettings={false}
        initialGeneral={general}
        initialFinancial={null}
        initialEstimates={estimates}
        bcvDate={null}
      />,
    );
    expect(screen.getByRole('tab', { name: /Tienda y envíos/i })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /^Pagos$/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Precios y tasa/i })).toBeNull();
    expect(screen.queryByText('Cuentas para recibir pagos')).toBeNull();
  });

  it('solo FINANCIAL_SETTINGS: aparecen Pagos y Precios; no Tienda', () => {
    render(
      <SettingsClient
        canStoreSettings={false}
        canFinancialSettings
        initialGeneral={null}
        initialFinancial={financial}
        initialEstimates={null}
        bcvDate={null}
      />,
    );
    expect(screen.queryByRole('tab', { name: /Tienda y envíos/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /Pagos/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Precios y tasa/i })).toBeTruthy();
  });

  it('cambiar tab no pierde valores no guardados y marca dirty', async () => {
    render(
      <SettingsClient
        canStoreSettings
        canFinancialSettings
        initialGeneral={general}
        initialFinancial={financial}
        initialEstimates={estimates}
        bcvDate={null}
      />,
    );

    const storeName = screen.getByLabelText('Nombre de la tienda') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(storeName, { target: { value: 'MundoTech Editado' } });
    });

    const storeTab = screen.getByRole('tab', { name: /Tienda y envíos/i });
    expect(within(storeTab).getByLabelText('Cambios sin guardar')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Pagos/i }));
    });
    expect(screen.getByRole('tab', { name: /Pagos/i }).getAttribute('aria-selected')).toBe('true');

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Tienda y envíos/i }));
    });
    expect((screen.getByLabelText('Nombre de la tienda') as HTMLInputElement).value).toBe(
      'MundoTech Editado',
    );
  });

  it('tabs tienen atributos ARIA de tablist', () => {
    render(
      <SettingsClient
        canStoreSettings
        canFinancialSettings
        initialGeneral={general}
        initialFinancial={financial}
        initialEstimates={estimates}
        bcvDate={null}
      />,
    );
    expect(screen.getByRole('tablist')).toBeTruthy();
    const tab = screen.getByRole('tab', { name: /Tienda y envíos/i });
    expect(tab.getAttribute('aria-controls')).toBe('settings-panel-store');
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('guardar general no envía campos financieros', async () => {
    render(
      <SettingsClient
        canStoreSettings
        canFinancialSettings
        initialGeneral={general}
        initialFinancial={financial}
        initialEstimates={estimates}
        bcvDate={null}
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Nombre de la tienda'), {
        target: { value: 'Nuevo Nombre' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar datos de tienda/i }));
    });
    expect(updateGeneralStoreSettingsMock).toHaveBeenCalledTimes(1);
    const payload = updateGeneralStoreSettingsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('storeName', 'Nuevo Nombre');
    expect(payload).not.toHaveProperty('pagoMovil');
    expect(payload).not.toHaveProperty('paymentMethods');
    expect(updateFinancialSettingsMock).not.toHaveBeenCalled();
  });

  it('guardar financiero no envía campos generales y aplica result.data', async () => {
    render(
      <SettingsClient
        canStoreSettings
        canFinancialSettings
        initialGeneral={general}
        initialFinancial={financial}
        initialEstimates={estimates}
        bcvDate={null}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Pagos/i }));
    });

    const accountPago = screen.getAllByRole('button', { name: /Pago Móvil/i })[0]!;
    await act(async () => {
      fireEvent.click(accountPago);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Banco'), { target: { value: 'Provincial' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar configuración de pagos/i }));
    });

    expect(updateFinancialSettingsMock).toHaveBeenCalledTimes(1);
    const payload = updateFinancialSettingsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('pagoMovil');
    expect(payload).not.toHaveProperty('storeName');
    expect(payload).not.toHaveProperty('whatsappOrderPhone');

    // result.data normalizado reemplaza el estado local (banco del servidor)
    expect(await screen.findByDisplayValue('Banesco Normalizado')).toBeTruthy();
  });

  it('porcentaje 0 con toggle activo bloquea guardado', async () => {
    render(
      <SettingsClient
        canStoreSettings={false}
        canFinancialSettings
        initialGeneral={null}
        initialFinancial={{
          ...financial,
          divisaDiscountEnabled: true,
          divisaDiscountPercent: 10,
        }}
        initialEstimates={null}
        bcvDate={null}
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Porcentaje'), { target: { value: '0' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar configuración de pagos/i }));
    });

    expect(updateFinancialSettingsMock).not.toHaveBeenCalled();
    expect(screen.getByText(/porcentaje debe ser mayor a 0/i)).toBeTruthy();
  });
});
