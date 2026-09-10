/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ProductShelf from '@/app/components/ProductShelf';

vi.mock('@/components/ProductCard', () => ({
  default: ({ product }: { product: { id: string; name: string } }) => (
    <div data-testid={`card-${product.id}`}>{product.name}</div>
  ),
}));

const trackMock = vi.fn<(...args: unknown[]) => boolean>(() => true);
vi.mock('@/lib/ga4', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ga4')>('@/lib/ga4');
  return {
    ...actual,
    track: (...args: unknown[]) => trackMock(...args),
  };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const products = [
  {
    id: '1',
    slug: 'a',
    name: 'Prod A',
    price: 10,
    originalPrice: 12,
    images: ['/a.png'],
    category: 'Cat',
    brand: null,
    stock: 3,
    freeShipping: false,
  },
];

describe('ProductShelf', () => {
  beforeEach(() => {
    trackMock.mockClear();
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'G-TEST');
    (globalThis as Record<string, unknown>).window = {
      ...(globalThis as Record<string, unknown>).window as object,
      __mtAnalyticsConsent: 'granted',
      gtag: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('estantería vacía no renderiza', () => {
    const { container } = render(
      <ProductShelf title="Ofertas" products={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('view_item_list no se duplica en el mismo montaje', async () => {
    render(
      <ProductShelf
        title="Ofertas del Día"
        listId="home-offers"
        products={products}
      />,
    );
    await vi.waitFor(() => {
      expect(
        trackMock.mock.calls.filter((c) => c[0] === 'view_item_list'),
      ).toHaveLength(1);
    });
  });
});
