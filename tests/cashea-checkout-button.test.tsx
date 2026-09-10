/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { CasheaPayload } from '@/lib/cashea';

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.doUnmock('cashea-web-checkout-sdk');
});

function samplePayload(): CasheaPayload {
  return {
    identificationNumber: 'V12345678',
    externalClientId: 'client-123',
    deliveryMethod: 'STORE_PICKUP',
    merchantName: 'MundoTech VE',
    redirectUrl: 'https://mundotechve.com/checkout/cashea/return?token=abc',
    deliveryPrice: 0,
    orders: [
      {
        store: { id: 42, name: 'MundoTech', enabled: true },
        products: [
          {
            id: 'prod-1',
            name: 'Producto',
            sku: 'SKU-1',
            description: '',
            imageUrl: '',
            quantity: 1,
            price: 10,
            tax: 0,
            discount: 0,
          },
        ],
      },
    ],
  };
}

describe('CasheaCheckoutButton', () => {
  it('monta el botón usando solo la clave pública, nunca una privada', async () => {
    const createCheckoutButton = vi.fn();
    const ctorSpy = vi.fn();
    class FakeSDK {
      constructor(config: { apiKey: string }) {
        ctorSpy(config);
      }
      createCheckoutButton = createCheckoutButton;
    }
    vi.doMock('cashea-web-checkout-sdk', () => ({ default: FakeSDK }));

    const { default: FreshButton } = await import('@/app/components/checkout/CasheaCheckoutButton');

    render(
      <FreshButton publicApiKey="pk_test_only" payload={samplePayload()} />,
    );

    await waitFor(() => expect(createCheckoutButton).toHaveBeenCalledTimes(1));

    expect(ctorSpy).toHaveBeenCalledWith({ apiKey: 'pk_test_only' });
    const call = createCheckoutButton.mock.calls[0][0] as {
      payload: CasheaPayload;
      container: HTMLElement;
    };
    expect(call.payload.deliveryPrice).toBe(0);
    expect(call.container).toBeInstanceOf(HTMLElement);

    // Nunca se le pasó nada parecido a una clave privada al SDK.
    expect(ctorSpy.mock.calls[0][0]).not.toHaveProperty('privateApiKey');
  });

  it('muestra un mensaje de error si el SDK no puede cargarse, sin romper el checkout', async () => {
    // Módulo sin `default`: instanciar `new undefined()` lanza dentro del
    // `.then`, y la cadena de promesas lo propaga al `.catch()` del componente
    // — simula un chunk cargado pero incompatible/roto, sin depender de que
    // el mocker de vitest soporte lanzar directamente en la factory.
    vi.doMock('cashea-web-checkout-sdk', () => ({}));

    const { default: FreshButton } = await import('@/app/components/checkout/CasheaCheckoutButton');
    const onError = vi.fn();

    render(
      <FreshButton publicApiKey="pk_test_only" payload={samplePayload()} onError={onError} />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/no pudimos cargar el botón de cashea/i);
  });
});
