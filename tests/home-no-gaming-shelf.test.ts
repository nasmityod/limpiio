import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('home — sin estantería gaming automática', () => {
  it('app/page.tsx no renderiza Consolas y gaming ni imports gaming', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(src).not.toContain('Consolas y gaming');
    expect(src).not.toContain('getCachedGamingProducts');
    expect(src).not.toContain('getCachedGamingPath');
    expect(src).not.toContain('badge="Gaming"');
    expect(src).not.toContain('Ver gaming');
    expect(src).not.toContain('gamingProducts');
    expect(src).not.toContain('gamingPath');
  });

  it('lib/home-cache.ts no contiene el algoritmo gaming por keywords', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/home-cache.ts'), 'utf8');
    expect(src).not.toContain('GAMING_KEYWORDS');
    expect(src).not.toContain('buildGamingProductsWhere');
    expect(src).not.toContain('getCachedGamingProducts');
    expect(src).not.toContain('getCachedGamingPath');
    expect(src).not.toContain('GAMING_PRODUCTS_TAKE');
    expect(src).not.toContain('portátil');
    expect(src).not.toContain("'portatil'");
  });
});

describe('home-cache query contracts', () => {
  it('novedades y ofertas exigen isActive y stock > 0 en el código', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/home-cache.ts'), 'utf8');
    expect(src).toContain('isActive: true');
    expect(src).toContain('stock: { gt: 0 }');
    expect(src).toContain('originalPrice: { not: null }');
    expect(src).toContain('getFeaturedProductsByIds');
    expect(src).toContain('orderFeaturedProducts');
  });
});
