/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddProductModal from '@/app/components/AddProductModal';

vi.mock('@/app/actions/productActions', () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}));

vi.mock('@/app/actions/configActions', () => ({
  getPricingParams: vi.fn(async () => ({ marginPct: 50, factor: 1 })),
  getMarginPresets: vi.fn(async () => [30, 50, 80, 100]),
  updateMarginPresets: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: () => {},
}));

vi.mock('@/hooks/useBodyScrollLock', () => ({
  useBodyScrollLock: () => {},
}));

import { getPricingParams } from '@/app/actions/configActions';
import { createProductAction, updateProductAction } from '@/app/actions/productActions';

const createProductActionMock = vi.mocked(createProductAction);
const updateProductActionMock = vi.mocked(updateProductAction);

const existingCategories = ['Accesorios', 'Audio'];

function fillRequiredFields(container: HTMLElement) {
  const name = container.querySelector('#name') as HTMLInputElement;
  const description = container.querySelector('#description') as HTMLTextAreaElement;
  const stock = container.querySelector('#stock') as HTMLInputElement;
  fireEvent.change(name, { target: { value: 'Producto test' } });
  fireEvent.change(description, { target: { value: 'Descripción de prueba' } });
  fireEvent.change(stock, { target: { value: '1' } });
}

describe('AddProductModal — categoría', () => {
  beforeEach(() => {
    vi.mocked(getPricingParams).mockResolvedValue({ marginPct: 50, factor: 1, canEditMarginPresets: false });
    createProductActionMock.mockReset();
    updateProductActionMock.mockReset();
    createProductActionMock.mockResolvedValue({
      success: true,
      message: 'ok',
      category: { name: 'Cuidado personal', created: true },
    });
    updateProductActionMock.mockResolvedValue({
      success: true,
      message: 'ok',
      category: { name: 'Accesorios', created: false },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/categories')) {
          return {
            ok: true,
            json: async () =>
              existingCategories.map((name) => ({ name, slug: name.toLowerCase() })),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('muestra categorías existentes al abrir el selector', async () => {
    render(
      <AddProductModal
        isOpen
        onClose={vi.fn()}
        product={null}
        categories={existingCategories}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: /Categoría/i }));
    await waitFor(() => {
      const list = screen.getByTestId('category-options');
      expect(list.textContent).toContain('Accesorios');
      expect(list.textContent).toContain('Audio');
    });
  });

  it('permite escribir una nueva y muestra Se creará la categoría', () => {
    render(
      <AddProductModal
        isOpen
        onClose={vi.fn()}
        product={null}
        categories={existingCategories}
      />,
    );
    const input = screen.getByRole('combobox', { name: /Categoría/i }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Cuidado personal' } });
    expect(screen.getByTestId('category-will-create').textContent).toContain(
      'Se creará la categoría: Cuidado personal',
    );
    expect(createProductActionMock).not.toHaveBeenCalled();
  });

  it('no crea nada antes del submit', () => {
    render(
      <AddProductModal
        isOpen
        onClose={vi.fn()}
        product={null}
        categories={existingCategories}
      />,
    );
    const input = screen.getByRole('combobox', { name: /Categoría/i });
    fireEvent.change(input, { target: { value: 'Nueva cat' } });
    fireEvent.blur(input);
    expect(createProductActionMock).not.toHaveBeenCalled();
    expect(updateProductActionMock).not.toHaveBeenCalled();
  });

  it('al guardar llama onSaved y cierra', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn(async () => {});
    const { container } = render(
      <AddProductModal
        isOpen
        onClose={onClose}
        onSaved={onSaved}
        product={null}
        categories={existingCategories}
      />,
    );

    fillRequiredFields(container);
    fireEvent.change(screen.getByRole('combobox', { name: /Categoría/i }), {
      target: { value: 'Cuidado personal' },
    });
    // Costo + margen mínimos para pasar validación del formulario HTML
    const cost = container.querySelector('#cost') as HTMLInputElement;
    const margin = container.querySelector('#marginPct') as HTMLInputElement;
    const price = container.querySelector('#price') as HTMLInputElement | null;
    if (cost) fireEvent.change(cost, { target: { value: '10' } });
    if (margin) fireEvent.change(margin, { target: { value: '50' } });
    if (price) fireEvent.change(price, { target: { value: '20' } });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(createProductActionMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('al abrir producto nuevo la categoría está vacía', () => {
    const { rerender } = render(
      <AddProductModal
        isOpen
        onClose={vi.fn()}
        product={{
          id: 'p1',
          name: 'Editado',
          category: 'Accesorios',
          price: 10,
          stock: 1,
          images: [],
          brand: 'Marca',
          description: 'Desc',
        }}
        categories={existingCategories}
      />,
    );
    expect((screen.getByRole('combobox', { name: /Categoría/i }) as HTMLInputElement).value).toBe('Accesorios');

    rerender(
      <AddProductModal
        isOpen
        onClose={vi.fn()}
        product={null}
        categories={existingCategories}
      />,
    );
    expect((screen.getByRole('combobox', { name: /Categoría/i }) as HTMLInputElement).value).toBe('');
  });

  it('al editar conserva la categoría actual aunque no esté en la lista', async () => {
    render(
      <AddProductModal
        isOpen
        onClose={vi.fn()}
        product={{
          id: 'p1',
          name: 'Editado',
          category: 'Huérfana Legacy',
          price: 10,
          stock: 1,
          images: [],
          brand: 'Marca',
          description: 'Desc',
        }}
        categories={existingCategories}
      />,
    );
    const input = screen.getByRole('combobox', { name: /Categoría/i }) as HTMLInputElement;
    expect(input.value).toBe('Huérfana Legacy');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByTestId('category-options').textContent).toContain(
        'Huérfana Legacy',
      );
    });
  });

  it('al elegir una categoría de la lista la asigna al campo', async () => {
    render(
      <AddProductModal
        isOpen
        onClose={vi.fn()}
        product={null}
        categories={existingCategories}
      />,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: /Categoría/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Audio' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
    expect((screen.getByRole('combobox', { name: /Categoría/i }) as HTMLInputElement).value).toBe(
      'Audio',
    );
    expect(screen.queryByTestId('category-will-create')).toBeNull();
  });

  it('no ofrece configurar atajos globales sin permiso financiero', async () => {
    render(<AddProductModal isOpen onClose={vi.fn()} product={null} categories={existingCategories} />);
    await waitFor(() => expect(getPricingParams).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Configurar atajos de margen' })).toBeNull();
  });

  it('ofrece configurar atajos globales al recibir el permiso financiero', async () => {
    vi.mocked(getPricingParams).mockResolvedValueOnce({ marginPct: 50, factor: 1, canEditMarginPresets: true });
    render(<AddProductModal isOpen onClose={vi.fn()} product={null} categories={existingCategories} />);
    expect(await screen.findByRole('button', { name: 'Configurar atajos de margen' })).toBeTruthy();
  });

  it('conserva el borrador cuando el servidor rechaza guardar', async () => {
    createProductActionMock.mockResolvedValueOnce({ success: false, message: 'SKU duplicado' });
    const onClose = vi.fn();
    const { container } = render(<AddProductModal isOpen onClose={onClose} product={null} categories={existingCategories} />);
    fillRequiredFields(container);
    fireEvent.change(screen.getByRole('combobox', { name: /Categoría/i }), { target: { value: 'Audio' } });
    fireEvent.submit(container.querySelector('form')!);
    await screen.findByRole('alert');
    expect((container.querySelector('#name') as HTMLInputElement).value).toBe('Producto test');
    expect((container.querySelector('#description') as HTMLTextAreaElement).value).toBe('Descripción de prueba');
    expect((container.querySelector('#stock') as HTMLInputElement).value).toBe('1');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('no permite cerrar ni duplicar envío durante un guardado pendiente', async () => {
    let finish!: (value: { success: boolean; message: string }) => void;
    createProductActionMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const onClose = vi.fn();
    const { container } = render(<AddProductModal isOpen onClose={onClose} product={null} categories={existingCategories} />);
    fillRequiredFields(container);
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Cerrar/i }));
    fireEvent.submit(container.querySelector('form')!);
    expect(onClose).not.toHaveBeenCalled(); expect(createProductActionMock).toHaveBeenCalledTimes(1);
    finish({ success: false, message: 'Prueba' });
    await screen.findByRole('alert');
  });

  it('selecciona categorías con teclado y Escape solo cierra la lista', async () => {
    const onClose = vi.fn();
    render(<AddProductModal isOpen onClose={onClose} product={null} categories={existingCategories} />);
    const input = screen.getByRole('combobox', { name: /Categoría/i });
    fireEvent.focus(input); fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' });
    expect((input as HTMLInputElement).value).toBe('Accesorios');
    fireEvent.focus(input); fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('category-options')).toBeNull(); expect(onClose).not.toHaveBeenCalled();
  });
});
