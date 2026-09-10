/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { DataTableColumn } from '@/components/admin/DataTable';

/**
 * RC-03 de la auditoría de rendimiento del Panel Admin.
 *
 * DataTable renderizaba SIEMPRE los dos árboles —`<ul className="md:hidden">`
 * con un `data.map(...)` y `<div className="hidden md:block">` con OTRO
 * `data.map(...)`— y ocultaba uno con Tailwind. `md:hidden` es CSS: no evita
 * que React construya el árbol ni que el navegador cree los nodos.
 *
 * Estas pruebas fijan el criterio de aceptación: al inspeccionar el DOM NO debe
 * haber cientos de filas duplicadas escondidas con CSS.
 */

interface Row {
  id: string;
  name: string;
  qty: number;
}

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Nombre', primary: true, cell: r => <span>{r.name}</span> },
  { key: 'qty', header: 'Cantidad', mobileLabel: 'Cantidad', cell: r => <span>{r.qty}</span> },
];

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Fila ${i}`, qty: i }));
}

/**
 * Sustituye `matchMedia` y recarga el módulo: el hook `useIsDesktop` cachea un
 * único MediaQueryList compartido (para no registrar N listeners con varias
 * tablas en pantalla), así que cada escenario necesita un módulo limpio.
 */
async function loadTable(isDesktop: boolean) {
  vi.resetModules();
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: isDesktop,
        media: query,
        onchange: null,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  const mod = await import('@/components/admin/DataTable');
  return mod.DataTable as typeof import('@/components/admin/DataTable').DataTable;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DataTable no duplica las filas móvil + escritorio', () => {
  it('en escritorio monta la tabla y NINGUNA card móvil', async () => {
    const Table = await loadTable(true);
    const { container } = render(
      <Table<Row> data={makeRows(50)} columns={columns} rowKey={r => r.id} />,
    );

    expect(container.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(container.querySelectorAll('ul li')).toHaveLength(0);
    // Cada nombre aparece UNA sola vez en todo el documento.
    expect(screen.getAllByText('Fila 0')).toHaveLength(1);
  });

  it('en móvil monta las cards y NINGUNA fila de tabla', async () => {
    const Table = await loadTable(false);
    const { container } = render(
      <Table<Row> data={makeRows(50)} columns={columns} rowKey={r => r.id} />,
    );

    expect(container.querySelectorAll('ul li')).toHaveLength(50);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(screen.getAllByText('Fila 0')).toHaveLength(1);
  });

  it('no quedan nodos ocultos con las clases del bug original', async () => {
    const Table = await loadTable(true);
    const { container } = render(
      <Table<Row> data={makeRows(20)} columns={columns} rowKey={r => r.id} />,
    );
    expect(container.querySelector('.md\\:hidden')).toBeNull();
    expect(container.querySelector('.hidden.md\\:block')).toBeNull();
  });

  it('el coste por fila es el de UNA representación, no el de dos', async () => {
    const Table = await loadTable(true);

    const small = render(<Table<Row> data={makeRows(10)} columns={columns} rowKey={r => r.id} />);
    const smallNodes = small.container.querySelectorAll('*').length;
    cleanup();

    const big = render(<Table<Row> data={makeRows(110)} columns={columns} rowKey={r => r.id} />);
    const bigNodes = big.container.querySelectorAll('*').length;

    // Nodos añadidos por cada fila adicional, aislando la cabecera fija.
    const nodesPerRow = (bigNodes - smallNodes) / 100;

    // Una fila de escritorio son <tr> + 2 <td> + 2 <span> = 5 nodos. Con el bug
    // original cada fila costaba ADEMÁS su card móvil completa (<li>, <div>,
    // <dl>, <dt>, <dd>…), más del doble. El umbral de 8 deja margen para
    // cambios de maquetación sin dejar pasar una duplicación.
    expect(nodesPerRow).toBeLessThanOrEqual(8);
    expect(nodesPerRow).toBeGreaterThan(0);
  });

  it('multiplicar por 10 los datos multiplica por ~10 los nodos', async () => {
    const Table = await loadTable(false);

    const small = render(<Table<Row> data={makeRows(10)} columns={columns} rowKey={r => r.id} />);
    const smallNodes = small.container.querySelectorAll('*').length;
    cleanup();

    const big = render(<Table<Row> data={makeRows(100)} columns={columns} rowKey={r => r.id} />);
    const bigNodes = big.container.querySelectorAll('*').length;

    expect(bigNodes / smallNodes).toBeGreaterThan(8);
    expect(bigNodes / smallNodes).toBeLessThan(12);
  });
});

describe('DataTable — selección y estados', () => {
  it('marca las filas seleccionadas con búsqueda O(1) por Set', async () => {
    const Table = await loadTable(true);
    const selected = makeRows(200).map(r => r.id).slice(0, 100);
    const { container } = render(
      <Table<Row>
        data={makeRows(200)}
        columns={columns}
        rowKey={r => r.id}
        selectable
        selectedIds={selected}
        onSelectionChange={() => {}}
      />,
    );
    const checked = container.querySelectorAll('tbody input[type="checkbox"]:checked');
    expect(checked).toHaveLength(100);
  });

  it('`loading` muestra esqueleto y `refreshing` conserva los datos visibles', async () => {
    const Table = await loadTable(true);
    const { container, rerender } = render(
      <Table<Row> data={makeRows(5)} columns={columns} rowKey={r => r.id} loading />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);

    rerender(<Table<Row> data={makeRows(5)} columns={columns} rowKey={r => r.id} refreshing />);
    // Con `refreshing` las filas siguen ahí: no hay parpadeo de esqueleto en
    // cada pulsación del buscador.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('muestra el estado vacío cuando no hay datos', async () => {
    const Table = await loadTable(false);
    render(
      <Table<Row>
        data={[]}
        columns={columns}
        rowKey={r => r.id}
        emptyState="Nada por aquí."
      />,
    );
    expect(screen.getByText('Nada por aquí.')).toBeTruthy();
  });
});
