import { expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany: db.findMany } } }));

import { getCachedCatalogProducts } from '@/lib/catalog-cache';

it('reproduce: el mapper del catálogo descarta freeShipping seleccionado desde BD', async () => {
  db.findMany.mockResolvedValue([{ id: 'p', slug: 'p', name: 'Producto', description: '', price: 10, originalPrice: null, stock: 5, category: 'Test', brand: null, images: ['/placeholder-product.png'], freeShipping: true }]);
  const cards = await getCachedCatalogProducts(1);
  expect(db.findMany.mock.calls[0][0].select.freeShipping).toBe(true);
  expect(cards[0]).not.toHaveProperty('freeShipping');
});
