/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ProductAboutHighlights from '@/app/product/[slug]/ProductAboutHighlights';
import type { ProductSpec } from '@/lib/definitions';

afterEach(() => {
  cleanup();
});

describe('ProductAboutHighlights', () => {
  it('con specs, usa hasta 6 especificaciones', () => {
    const specs: ProductSpec[] = [
      { name: 'Pantalla', value: '6.1"' },
      { name: 'RAM', value: '8 GB' },
      { name: 'Almacenamiento', value: '128 GB' },
    ];

    render(<ProductAboutHighlights specs={specs} />);

    expect(screen.getByText('Pantalla: 6.1"')).toBeTruthy();
    expect(screen.getByText('RAM: 8 GB')).toBeTruthy();
    expect(screen.getByText('Almacenamiento: 128 GB')).toBeTruthy();
  });

  it('sin specs, no renderiza la sección', () => {
    const { container } = render(<ProductAboutHighlights specs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('limita a 6 bullets', () => {
    const specs: ProductSpec[] = Array.from({ length: 8 }, (_, i) => ({
      name: `Spec${i + 1}`,
      value: `Val${i + 1}`,
    }));

    render(<ProductAboutHighlights specs={specs} />);

    expect(screen.getByText('Spec1: Val1')).toBeTruthy();
    expect(screen.getByText('Spec6: Val6')).toBeTruthy();
    expect(screen.queryByText('Spec7: Val7')).toBeNull();
  });
});
