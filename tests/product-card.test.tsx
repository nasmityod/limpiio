/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ProductCard from '@/components/ProductCard';
import type { Product } from '@/context/ProductContext';

const addToCart = vi.fn();
const trackMock = vi.fn<(...args: unknown[]) => boolean>(() => true);

vi.mock('@/context/CartContext', () => ({
  useCart: () => ({ addToCart }),
  // PERF-2026-08: ProductCard consume solo acciones (identidad estable).
  useCartActions: () => ({ addToCart }),
}));

vi.mock('@/context/WishlistContext', () => ({
  useWishlist: () => ({
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
    isInWishlist: () => false,
  }),
}));

vi.mock('@/context/ExchangeRateContext', () => ({
  useExchangeRate: () => ({ rate: 40, stale: false }),
}));

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/ga4', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ga4')>('@/lib/ga4');
  return {
    ...actual,
    track: (...args: unknown[]) => trackMock(...args),
  };
});

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    slug: 'producto-1',
    name: 'Auriculares Bluetooth Pro',
    price: 25,
    originalPrice: 30,
    description: '',
    image: '/placeholder-product.png',
    images: ['/placeholder-product.png'],
    category: 'Audio',
    brand: 'Sony',
    stock: 4,
    details: {},
    freeShipping: false,
    ...overrides,
  };
}

describe('ProductCard', () => {
  beforeEach(() => {
    addToCart.mockClear();
    trackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('freeShipping=true muestra Envío gratis MRW', () => {
    render(<ProductCard product={makeProduct({ freeShipping: true })} />);
    expect(screen.getByText('Envío gratis MRW')).toBeTruthy();
  });

  it('freeShipping=false no lo muestra', () => {
    render(<ProductCard product={makeProduct({ freeShipping: false })} />);
    expect(screen.queryByText('Envío gratis MRW')).toBeNull();
  });

  it('no muestra MRW cuando está agotado', () => {
    render(
      <ProductCard
        product={makeProduct({ freeShipping: true, stock: 0 })}
      />,
    );
    expect(screen.queryByText('Envío gratis MRW')).toBeNull();
  });

  it('CTA añade al carrito', () => {
    render(<ProductCard product={makeProduct()} />);
    fireEvent.click(screen.getByRole('button', { name: /Añadir al carrito/i }));
    expect(addToCart).toHaveBeenCalledTimes(1);
  });

  it('agotado mantiene CTA deshabilitado', () => {
    render(<ProductCard product={makeProduct({ stock: 0 })} />);
    const btn = screen.getByRole('button', { name: /Agotado/i });
    expect(btn).toHaveProperty('disabled', true);
    fireEvent.click(btn);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('stretched link es un anchor válido (sin botón anidado)', () => {
    const { container } = render(<ProductCard product={makeProduct()} />);
    const link = container.querySelector('a[href="/product/producto-1"]');
    expect(link).toBeTruthy();
    expect(link?.querySelector('button')).toBeNull();
  });

  it('select_item incluye contexto de lista cuando existe', () => {
    render(
      <ProductCard
        product={makeProduct()}
        analyticsListId="home-offers"
        analyticsListName="Ofertas del Día"
        analyticsIndex={2}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /Auriculares/i }));
    expect(trackMock).toHaveBeenCalledWith(
      'select_item',
      expect.objectContaining({
        item_list_id: 'home-offers',
        item_list_name: 'Ofertas del Día',
        items: [
          expect.objectContaining({
            item_id: 'p1',
            index: 2,
          }),
        ],
      }),
    );
  });

  it('select_item funciona sin contexto de lista', () => {
    render(<ProductCard product={makeProduct()} />);
    fireEvent.click(screen.getByRole('link', { name: /Auriculares/i }));
    expect(trackMock).toHaveBeenCalledWith(
      'select_item',
      expect.objectContaining({
        items: [expect.objectContaining({ item_id: 'p1' })],
      }),
    );
    const payload = trackMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.item_list_id).toBeUndefined();
  });
});
