import { describe, expect, it } from 'vitest';
import {
  filterOfferShelfProducts,
  orderFeaturedProducts,
  type HomeShelfProduct,
} from '@/lib/home-shelf-products';
import { buildHomeShelfSections } from '@/lib/home-sections';

function product(
  partial: Partial<HomeShelfProduct> & Pick<HomeShelfProduct, 'id' | 'name'>,
): HomeShelfProduct {
  return {
    slug: partial.slug ?? partial.id,
    description: null,
    price: partial.price ?? 10,
    originalPrice: partial.originalPrice ?? null,
    stock: partial.stock ?? 5,
    category: 'Cat',
    brand: null,
    images: [],
    freeShipping: false,
    ...partial,
  };
}

describe('home shelf product filters', () => {
  it('ofertas exige originalPrice > price', () => {
    const rows = [
      product({ id: '1', name: 'A', price: 10, originalPrice: 20 }),
      product({ id: '2', name: 'B', price: 10, originalPrice: 10 }),
      product({ id: '3', name: 'C', price: 10, originalPrice: null }),
      product({ id: '4', name: 'D', price: 15, originalPrice: 10 }),
    ];
    expect(filterOfferShelfProducts(rows).map((p) => p.id)).toEqual(['1']);
  });

  it('destacados conserva el orden configurado', () => {
    const rows = [
      product({ id: 'c', name: 'C' }),
      product({ id: 'a', name: 'A' }),
      product({ id: 'b', name: 'B' }),
    ];
    expect(
      orderFeaturedProducts(rows, ['a', 'c', 'missing', 'b']).map((p) => p.id),
    ).toEqual(['a', 'c', 'b']);
  });

  it('destacados omite ausentes sin sustituir', () => {
    expect(orderFeaturedProducts([], ['a', 'b'])).toEqual([]);
  });
});

describe('buildHomeShelfSections', () => {
  it('oculta estanterías vacías y no duplica editoriales', () => {
    const sections = buildHomeShelfSections({
      shelves: [
        { key: 'offers', hasProducts: false, node: 'offers' },
        { key: 'newest', hasProducts: true, node: 'newest' },
        { key: 'featured', hasProducts: true, node: 'featured' },
      ],
      discover: 'discover',
      categories: 'categories',
      promotions: 'promotions',
    });
    expect(sections).toEqual([
      'newest',
      'discover',
      'categories',
      'featured',
      'promotions',
    ]);
  });

  it('sin estanterías activas conserva Discover → Category → Promotions', () => {
    expect(
      buildHomeShelfSections({
        shelves: [
          { key: 'offers', hasProducts: false, node: null },
          { key: 'newest', hasProducts: false, node: null },
          { key: 'featured', hasProducts: false, node: null },
        ],
        discover: 'discover',
        categories: 'categories',
        promotions: 'promotions',
      }),
    ).toEqual(['discover', 'categories', 'promotions']);
  });

  it('con una sola estantería inserta editoriales después', () => {
    expect(
      buildHomeShelfSections({
        shelves: [{ key: 'offers', hasProducts: true, node: 'offers' }],
        discover: 'discover',
        categories: 'categories',
        promotions: 'promotions',
      }),
    ).toEqual(['offers', 'discover', 'categories', 'promotions']);
  });
});
