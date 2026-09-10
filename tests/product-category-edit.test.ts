import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  ensureProductCategory,
  withSerializableCategoryTransaction,
  type CategoryTransactionRunner,
} from '@/lib/categories/ensure-product-category';

/**
 * Simula edición: ensure + update en la misma TX.
 * Si el update falla, el rollback no deja la categoría nueva.
 */
describe('edición de producto + categoría', () => {
  it('crear categoría nueva al editar y asociar nombre canónico', async () => {
    const categories: { id: string; name: string; slug: string; order: number }[] = [];
    let productCategory = 'Accesorios';

    const runTransaction: CategoryTransactionRunner = async (fn) => {
      const tx = {
        category: {
          findFirst: async ({ where }: { where: { name: { equals: string } } }) => {
            const needle = where.name.equals.toLowerCase();
            return categories.find((c) => c.name.toLowerCase() === needle) ?? null;
          },
          findUnique: async ({ where }: { where: { slug: string } }) =>
            categories.find((c) => c.slug === where.slug) ?? null,
          aggregate: async () => ({
            _max: { order: categories.reduce((m, c) => Math.max(m, c.order), -1) },
          }),
          create: async ({ data }: { data: { name: string; slug: string; order: number } }) => {
            const row = {
              id: `c-${categories.length + 1}`,
              name: data.name,
              slug: data.slug,
              order: data.order,
            };
            categories.push(row);
            return { id: row.id, name: row.name, slug: row.slug };
          },
        },
        product: {
          update: async ({ data }: { data: { category: string } }) => {
            productCategory = data.category;
            return { id: 'p1' };
          },
        },
      };
      return fn(tx as unknown as Prisma.TransactionClient);
    };

    const result = await withSerializableCategoryTransaction(async (tx) => {
      const ensured = await ensureProductCategory(tx, 'Cuidado personal');
      await (tx as unknown as { product: { update: (args: unknown) => Promise<unknown> } }).product.update({
        data: { category: ensured.name },
      });
      return ensured;
    }, runTransaction);

    expect(result.created).toBe(true);
    expect(result.name).toBe('Cuidado personal');
    expect(productCategory).toBe('Cuidado personal');
    expect(categories).toHaveLength(1);
  });

  it('editar con distinta capitalización reutiliza la existente', async () => {
    const categories = [
      { id: '1', name: 'Accesorios', slug: 'accesorios', order: 0 },
    ];
    let productCategory = 'Audio';

    const runTransaction: CategoryTransactionRunner = async (fn) => {
      const tx = {
        category: {
          findFirst: async ({ where }: { where: { name: { equals: string } } }) => {
            const needle = where.name.equals.toLowerCase();
            return categories.find((c) => c.name.toLowerCase() === needle) ?? null;
          },
          findUnique: async () => null,
          aggregate: async () => ({ _max: { order: 0 } }),
          create: vi.fn(),
        },
        product: {
          update: async ({ data }: { data: { category: string } }) => {
            productCategory = data.category;
            return { id: 'p1' };
          },
        },
      };
      return fn(tx as unknown as Prisma.TransactionClient);
    };

    const result = await withSerializableCategoryTransaction(async (tx) => {
      const ensured = await ensureProductCategory(tx, 'accesorios');
      await (tx as unknown as { product: { update: (args: unknown) => Promise<unknown> } }).product.update({
        data: { category: ensured.name },
      });
      return ensured;
    }, runTransaction);

    expect(result.created).toBe(false);
    expect(result.name).toBe('Accesorios');
    expect(productCategory).toBe('Accesorios');
  });

  it('si el update falla, se revierte la categoría nueva', async () => {
    const store: { id: string; name: string; slug: string; order: number }[] = [];

    const runTransaction: CategoryTransactionRunner = async (fn) => {
      const snapshot = [...store];
      const local = [...store];
      const tx = {
        category: {
          findFirst: async ({ where }: { where: { name: { equals: string } } }) => {
            const needle = where.name.equals.toLowerCase();
            return local.find((c) => c.name.toLowerCase() === needle) ?? null;
          },
          findUnique: async ({ where }: { where: { slug: string } }) =>
            local.find((c) => c.slug === where.slug) ?? null,
          aggregate: async () => ({
            _max: { order: local.reduce((m, c) => Math.max(m, c.order), -1) },
          }),
          create: async ({ data }: { data: { name: string; slug: string; order: number } }) => {
            const row = {
              id: `c-${local.length + 1}`,
              name: data.name,
              slug: data.slug,
              order: data.order,
            };
            local.push(row);
            return { id: row.id, name: row.name, slug: row.slug };
          },
        },
        product: {
          update: async () => {
            throw new Error('update failed');
          },
        },
      };
      try {
        const result = await fn(tx as unknown as Prisma.TransactionClient);
        store.splice(0, store.length, ...local);
        return result;
      } catch (e) {
        store.splice(0, store.length, ...snapshot);
        throw e;
      }
    };

    await expect(
      withSerializableCategoryTransaction(async (tx) => {
        const ensured = await ensureProductCategory(tx, 'Temporal Edit');
        await (tx as unknown as { product: { update: () => Promise<unknown> } }).product.update();
        return ensured;
      }, runTransaction),
    ).rejects.toThrow('update failed');

    expect(store).toHaveLength(0);
  });
});
