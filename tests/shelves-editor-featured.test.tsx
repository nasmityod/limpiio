/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShelvesEditor from '@/app/admin/home-manager/ShelvesEditor';
import { DEFAULT_HOMEPAGE_SHELVES } from '@/lib/homepage-config';

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} />
  ),
}));

describe('ShelvesEditor featured sin detalles', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/admin/products/search')) {
          return {
            ok: true,
            json: async () => ({ products: [] }),
          } as Response;
        }
        if (url.includes('/api/categories')) {
          return {
            ok: true,
            json: async () => [
              { id: 'cat-1', name: 'Cocina', slug: 'cocina', productCount: 4 },
              { id: 'cat-2', name: 'Gadgets', slug: 'gadgets', productCount: 2 },
            ],
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra filas para IDs ausentes y permite quitarlos', async () => {
    const initial = {
      ...DEFAULT_HOMEPAGE_SHELVES,
      featuredProductIds: ['missing-aaa', 'missing-bbb'],
    };

    render(<ShelvesEditor initial={initial} loading={false} />);

    await waitFor(() => {
      expect(screen.getAllByText('Producto no disponible')).toHaveLength(2);
    });

    const removeButtons = screen.getAllByRole('button', {
      name: /Quitar producto/i,
    });
    expect(removeButtons).toHaveLength(2);

    fireEvent.click(removeButtons[0]!);
    await waitFor(() => {
      expect(screen.getAllByText('Producto no disponible')).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /Quitar producto/i }));
    await waitFor(() => {
      expect(screen.queryByText('Producto no disponible')).toBeNull();
      expect(
        screen.getByText(/Aún no hay productos destacados/i),
      ).toBeTruthy();
    });
  });

  it('permite agregar y quitar una estantería por categoría', async () => {
    render(<ShelvesEditor initial={DEFAULT_HOMEPAGE_SHELVES} loading={false} />);

    await waitFor(() => {
      expect(screen.getByText('Cocina')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar' })[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('category-shelf-cat-1')).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Quitar estantería Cocina/i }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('category-shelf-cat-1')).toBeNull();
      expect(
        screen.getByText(/Aún no hay categorías seleccionadas/i),
      ).toBeTruthy();
    });
  });
});
