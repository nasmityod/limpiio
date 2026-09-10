import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOMEPAGE_FREE_SHIPPING,
  DEFAULT_HOMEPAGE_SHELVES,
  homepageFreeShippingSchema,
  homepageShelvesConfigSchema,
  normalizeHomepageFreeShipping,
  normalizeHomepageShelves,
  normalizeShelfOrder,
  parseHomepageFreeShippingForSave,
  parseHomepageShelvesForSave,
} from '@/lib/homepage-config';

describe('homepage_shelves V2', () => {
  it('expone defaults V2 correctos', () => {
    expect(DEFAULT_HOMEPAGE_SHELVES.order).toEqual([
      'offers',
      'newest',
      'featured',
    ]);
    expect(DEFAULT_HOMEPAGE_SHELVES.shelves.offers.title).toBe('Ofertas del Día');
    expect(DEFAULT_HOMEPAGE_SHELVES.shelves.newest.badge).toBe('Recién llegados');
    expect(DEFAULT_HOMEPAGE_SHELVES.shelves.featured.badge).toBe('Destacados');
    expect(DEFAULT_HOMEPAGE_SHELVES.featuredProductIds).toEqual([]);
    expect(DEFAULT_HOMEPAGE_SHELVES.categoryShelves).toEqual([]);
  });

  it('lee configuración V2 válida', () => {
    const raw = {
      order: ['featured', 'offers', 'newest'],
      shelves: {
        offers: {
          enabled: false,
          title: 'Ofertas',
          badge: 'Hot',
          subtitle: 'Hoy',
        },
        newest: {
          enabled: true,
          title: 'Nuevos',
          badge: 'New',
          subtitle: '',
        },
        featured: {
          enabled: true,
          title: 'Pick',
          badge: 'Top',
          subtitle: 'Team',
        },
      },
      featuredProductIds: ['a', 'b'],
    };
    const normalized = normalizeHomepageShelves(raw);
    expect(normalized.order).toEqual(['featured', 'offers', 'newest']);
    expect(normalized.shelves.offers.enabled).toBe(false);
    expect(normalized.featuredProductIds).toEqual(['a', 'b']);
    expect(normalized.categoryShelves).toEqual([]);
    expect(homepageShelvesConfigSchema.safeParse(normalized).success).toBe(true);
  });

  it('conserva estanterías por categoría válidas', () => {
    const raw = {
      ...DEFAULT_HOMEPAGE_SHELVES,
      categoryShelves: [
        {
          categoryId: 'cat-1',
          enabled: true,
          title: 'Cocina',
          badge: 'Cocina',
          subtitle: 'Para el hogar',
        },
        {
          categoryId: 'cat-1',
          enabled: true,
          title: 'Duplicada',
          badge: '',
          subtitle: '',
        },
        {
          categoryId: 'cat-2',
          enabled: false,
          title: '  Gadgets  ',
          badge: 'New',
          subtitle: '',
        },
      ],
    };
    const normalized = normalizeHomepageShelves(raw);
    expect(normalized.categoryShelves).toEqual([
      {
        categoryId: 'cat-1',
        enabled: true,
        title: 'Cocina',
        badge: 'Cocina',
        subtitle: 'Para el hogar',
      },
      {
        categoryId: 'cat-2',
        enabled: false,
        title: 'Gadgets',
        badge: 'New',
        subtitle: '',
      },
    ]);
  });

  it('migra en memoria la configuración antigua', () => {
    const legacy = {
      bestsellers: {
        title: 'Más vendidos X',
        badge: 'Top',
        subtitle: 'sub',
      },
      newest: {
        title: 'Novedades custom',
        badge: 'Fresh',
        subtitle: 'llegaron',
      },
      recommended: {
        title: 'Reco title',
        badge: 'Reco',
        subtitle: 'equipo',
      },
    };
    const normalized = normalizeHomepageShelves(legacy);
    expect(normalized.order).toEqual(['offers', 'newest', 'featured']);
    expect(normalized.shelves.newest.title).toBe('Novedades custom');
    expect(normalized.shelves.newest.badge).toBe('Fresh');
    expect(normalized.shelves.newest.subtitle).toBe('llegaron');
    expect(normalized.shelves.featured.title).toBe('Reco title');
    expect(normalized.shelves.featured.badge).toBe('Reco');
    expect(normalized.shelves.offers.title).toBe(
      DEFAULT_HOMEPAGE_SHELVES.shelves.offers.title,
    );
    expect(normalized.featuredProductIds).toEqual([]);
    expect(normalized.categoryShelves).toEqual([]);
  });

  it('normaliza order sin duplicados y completa faltantes', () => {
    expect(normalizeShelfOrder(['newest', 'newest', 'offers'])).toEqual([
      'newest',
      'offers',
      'featured',
    ]);
    expect(normalizeShelfOrder(['unknown', 'featured'])).toEqual([
      'featured',
      'offers',
      'newest',
    ]);
  });

  it('rechaza claves inválidas en save', () => {
    const parsed = parseHomepageShelvesForSave({
      order: ['offers', 'bogus'],
      shelves: DEFAULT_HOMEPAGE_SHELVES.shelves,
      featuredProductIds: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza más de 8 featuredProductIds', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `id-${i}`);
    const parsed = parseHomepageShelvesForSave({
      ...DEFAULT_HOMEPAGE_SHELVES,
      featuredProductIds: ids,
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza IDs destacados duplicados', () => {
    const parsed = parseHomepageShelvesForSave({
      ...DEFAULT_HOMEPAGE_SHELVES,
      featuredProductIds: ['a', 'a'],
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza más de 6 estanterías por categoría', () => {
    const categoryShelves = Array.from({ length: 7 }, (_, i) => ({
      categoryId: `cat-${i}`,
      enabled: true,
      title: `Cat ${i}`,
      badge: '',
      subtitle: '',
    }));
    const parsed = parseHomepageShelvesForSave({
      ...DEFAULT_HOMEPAGE_SHELVES,
      categoryShelves,
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza categorías duplicadas al guardar', () => {
    const parsed = parseHomepageShelvesForSave({
      ...DEFAULT_HOMEPAGE_SHELVES,
      categoryShelves: [
        {
          categoryId: 'cat-1',
          enabled: true,
          title: 'Uno',
          badge: '',
          subtitle: '',
        },
        {
          categoryId: 'cat-1',
          enabled: true,
          title: 'Dos',
          badge: '',
          subtitle: '',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rechaza título vacío en estantería de categoría', () => {
    const parsed = parseHomepageShelvesForSave({
      ...DEFAULT_HOMEPAGE_SHELVES,
      categoryShelves: [
        {
          categoryId: 'cat-1',
          enabled: true,
          title: '   ',
          badge: '',
          subtitle: '',
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('acepta una estantería de categoría válida', () => {
    const parsed = parseHomepageShelvesForSave({
      ...DEFAULT_HOMEPAGE_SHELVES,
      categoryShelves: [
        {
          categoryId: 'cat-1',
          enabled: true,
          title: 'Cocina',
          badge: 'Cocina',
          subtitle: '',
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.categoryShelves).toHaveLength(1);
      expect(parsed.data.categoryShelves[0]?.categoryId).toBe('cat-1');
    }
  });

  it('rechaza título vacío al guardar V2', () => {
    const parsed = parseHomepageShelvesForSave({
      ...DEFAULT_HOMEPAGE_SHELVES,
      shelves: {
        ...DEFAULT_HOMEPAGE_SHELVES.shelves,
        offers: {
          ...DEFAULT_HOMEPAGE_SHELVES.shelves.offers,
          title: '   ',
        },
      },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('homepage_free_shipping', () => {
  it('default válido', () => {
    expect(DEFAULT_HOMEPAGE_FREE_SHIPPING).toEqual({
      enabled: true,
      text: 'Envío gratis por MRW',
    });
    expect(
      homepageFreeShippingSchema.safeParse(DEFAULT_HOMEPAGE_FREE_SHIPPING)
        .success,
    ).toBe(true);
  });

  it('rechaza texto vacío', () => {
    expect(
      parseHomepageFreeShippingForSave({ enabled: true, text: '  ' }).success,
    ).toBe(false);
  });

  it('rechaza propiedades desconocidas', () => {
    expect(
      homepageFreeShippingSchema.safeParse({
        enabled: true,
        text: 'Envío gratis por MRW',
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('normaliza lectura parcial', () => {
    expect(normalizeHomepageFreeShipping({ enabled: false })).toEqual({
      enabled: false,
      text: 'Envío gratis por MRW',
    });
  });
});
