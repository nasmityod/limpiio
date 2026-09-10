/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  applyGlobalDivisaDiscount,
  buildCheckoutPaymentMethods,
  DEFAULT_PAYMENT_METHODS,
  type CheckoutPaymentMethodDto,
} from '@/lib/payment-methods';

const cartItems = [
  {
    id: 'prod-a',
    slug: 'prod-a',
    name: 'Producto A',
    description: '',
    price: 119,
    originalPrice: null,
    stock: 10,
    category: 'cat',
    brand: 'brand',
    image: '/placeholder-product.png',
    images: ['/placeholder-product.png'],
    details: {},
    quantity: 1,
    freeShipping: false,
  },
];

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

vi.mock('@/context/CartContext', () => ({
  useCart: () => ({
    cart: cartItems,
    clearCart: vi.fn(),
    isCartLoading: false,
    refreshCart: vi.fn(async () => undefined),
    getCartTotal: () => 119,
  }),
}));

vi.mock('@/context/ExchangeRateContext', () => ({
  useExchangeRate: () => ({ rate: 40 }),
}));

vi.mock('@/app/components/checkout/ShippingForm', () => ({
  default: () => <div data-testid="shipping-form-stub" />,
}));

import WhatsAppCheckout from '@/app/components/checkout/WhatsAppCheckout';

function dtoWithDiscount(percent: number): CheckoutPaymentMethodDto[] {
  const methods = DEFAULT_PAYMENT_METHODS.map((m) => ({
    ...m,
    active: true,
    enabledInWhatsapp: true,
    enabledInFull: true,
    recipientValue: m.id === 'zelle' ? 'z@e.com' : m.recipientValue,
  }));
  const withDiscount = applyGlobalDivisaDiscount(methods, {
    enabled: true,
    percent,
  });
  return buildCheckoutPaymentMethods(
    {
      pagoMovil: { bank: 'B', phone: '1', idNumber: 'V' },
      transferencia: { bank: 'B', accountNumber: '1', accountHolder: 'H', rif: 'J' },
      binancePayId: '123',
      paymentMethods: withDiscount,
      divisaDiscountEnabled: true,
      divisaDiscountPercent: percent,
    },
    'whatsapp',
  );
}

describe('WhatsAppCheckout resumen reactivo', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('inicialmente total = subtotal; Binance aplica preview; Pago Móvil restaura', () => {
    render(
      <WhatsAppCheckout
        pagoMovil={{ bank: 'Banesco', phone: '0412', idNumber: 'V-1' }}
        transferencia={{
          bank: 'M',
          accountNumber: '0105',
          accountHolder: 'H',
          rif: 'J-1',
        }}
        binancePayId="pay-id"
        checkoutPaymentMethods={dtoWithDiscount(33)}
      />,
    );

    const summary = screen.getByRole('heading', { name: 'Tu pedido' }).closest('div')!
      .parentElement!;

    expect(within(summary).getByText('Subtotal')).toBeTruthy();
    // Sin método: total = subtotal $119
    expect(screen.queryByText(/Descuento por pago en divisas/i)).toBeNull();
    expect(within(summary).getAllByText(/US\$119\.00|\$119\.00/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: 'USD / divisas' }));
    fireEvent.click(screen.getByRole('button', { name: /Binance Pay/i }));

    expect(screen.getByText(/Descuento por pago en divisas \(33%\)/i)).toBeTruthy();
    expect(screen.getByText(/−US\$39\.27|−\$39\.27/)).toBeTruthy();
    expect(screen.getAllByText(/US\$79\.73|\$79\.73/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Estimado según el método seleccionado/i)).toBeTruthy();
    expect(within(summary).queryByText(/≈ Bs\./)).toBeNull();

    // Precios tachados / descontados en la línea
    const productRow = screen.getByText('Producto A').closest('li')!;
    expect(productRow.querySelector('.line-through')).toBeTruthy();
    expect(within(productRow).getByText(/c\/u/)).toBeTruthy();

    // Badge fuera del contenedor interior overflow-hidden
    const outer = productRow.querySelector('.overflow-visible');
    const inner = productRow.querySelector('.overflow-hidden');
    const badge = within(productRow).getByText('1');
    expect(outer).toBeTruthy();
    expect(inner).toBeTruthy();
    expect(inner?.contains(badge)).toBe(false);
    expect(outer?.contains(badge)).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Bolívares' }));
    fireEvent.click(screen.getByRole('button', { name: /Pago Móvil/i }));

    expect(screen.queryByText(/Descuento por pago en divisas/i)).toBeNull();
    expect(screen.queryByText(/Estimado según el método seleccionado/i)).toBeNull();
    expect(productRow.querySelector('.line-through')).toBeNull();
    expect(within(summary).getAllByText(/US\$119\.00|\$119\.00/).length).toBeGreaterThan(0);
    expect(within(summary).getByText(/≈ Bs\./)).toBeTruthy();
  });
});
