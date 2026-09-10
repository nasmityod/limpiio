import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  CategoryNameError,
  ensureProductCategory,
  isValidNormalizedCategoryName,
  normalizeCategoryName,
  withSerializableCategoryTransaction,
  type CategoryTransactionRunner,
} from '@/lib/categories/ensure-product-category';

describe('normalizeCategoryName', () => {
  it('colapsa espacios internos y recorta extremos', () => {
    expect(normalizeCategoryName('  Audio   y Video  ')).toBe('Audio y Video');
  });

  it('rechaza vacío vía isValidNormalizedCategoryName', () => {
    expect(isValidNormalizedCategoryName(normalizeCategoryName('   '))).toBe(false);
    expect(isValidNormalizedCategoryName('')).toBe(false);
  });

  it('rechaza más de 80 caracteres', () => {
    const long = 'A'.repeat(81);
    expect(isValidNormalizedCategoryName(normalizeCategoryName(long))).toBe(false);
  });

  it('conserva acentos', () => {
    expect(normalizeCategoryName('  Electrónica  ')).toBe('Electrónica');
  });

  it('no asigna Consolas ni otra categoría por defecto', () => {
    expect(normalizeCategoryName('')).toBe('');
    expect(normalizeCategoryName('  ')).toBe('');
    expect(normalizeCategoryName('Accesorios')).toBe('Accesorios');
  });
});

type FakeCategory = { id: string; name: string; slug: string; order: number };

function createFakeTx(seed: FakeCategory[] = []) {
  const categories = [...seed];
  let createShouldFail: 'name' | 'slug' | null = null;
  let createCalls = 0;
  let productCreateShouldFail = false;
  const products: { category: string }[] = [];

  const tx = {
    category: {
      findFirst: vi.fn(async ({ where }: { where: { name: { equals: string; mode: string } } }) => {
        const needle = where.name.equals.toLowerCase();
        return categories.find((c) => c.name.toLowerCase() === needle) ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
        return categories.find((c) => c.slug === where.slug) ?? null;
      }),
      aggregate: vi.fn(async () => ({
        _max: { order: categories.reduce((m, c) => Math.max(m, c.order), -1) },
      })),
      create: vi.fn(async ({ data }: { data: FakeCategory & Record<string, unknown> }) => {
        createCalls += 1;
        if (createShouldFail === 'name') {
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['name'] },
          });
          throw err;
        }
        if (createShouldFail === 'slug') {
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['slug'] },
          });
          throw err;
        }
        if (categories.some((c) => c.name.toLowerCase() === data.name.toLowerCase())) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['name'] },
          });
        }
        if (categories.some((c) => c.slug === data.slug)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['slug'] },
          });
        }
        const row = {
          id: `cat-${categories.length + 1}`,
          name: data.name,
          slug: data.slug,
          order: data.order,
        };
        categories.push(row);
        return { id: row.id, name: row.name, slug: row.slug };
      }),
    },
    product: {
      create: vi.fn(async ({ data }: { data: { category: string } }) => {
        if (productCreateShouldFail) {
          throw new Error('product create failed');
        }
        products.push({ category: data.category });
        return { id: `prod-${products.length}` };
      }),
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    categories,
    products,
    get createCalls() {
      return createCalls;
    },
    failNextCreateOn: (kind: 'name' | 'slug' | null) => {
      createShouldFail = kind;
    },
    failProductCreate: (v: boolean) => {
      productCreateShouldFail = v;
    },
  };
}

describe('ensureProductCategory — categoría existente', () => {
  it('reutiliza Accesorios cuando el usuario escribe accesorios', async () => {
    const fake = createFakeTx([
      { id: '1', name: 'Accesorios', slug: 'accesorios', order: 0 },
    ]);
    const result = await ensureProductCategory(fake.tx, 'accesorios');
    expect(result.created).toBe(false);
    expect(result.name).toBe('Accesorios');
    expect(fake.createCalls).toBe(0);
  });
});

describe('ensureProductCategory — categoría nueva', () => {
  it('crea Cuidado personal con slug cuidado-personal y flags neutros', async () => {
    const fake = createFakeTx();
    const result = await ensureProductCategory(fake.tx, 'Cuidado personal');
    expect(result.created).toBe(true);
    expect(result.name).toBe('Cuidado personal');
    expect(result.slug).toBe('cuidado-personal');
    expect(fake.categories).toHaveLength(1);
    expect(fake.categories[0]).toMatchObject({
      name: 'Cuidado personal',
      slug: 'cuidado-personal',
    });
    expect(fake.tx.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Cuidado personal',
          slug: 'cuidado-personal',
          isFeatured: false,
          imageUrl: null,
        }),
      }),
    );
  });
});

describe('ensureProductCategory — colisión de slug', () => {
  it('genera audio-2 si el slug audio ya existe para otro nombre', async () => {
    const fake = createFakeTx([
      { id: '1', name: 'Audio!', slug: 'audio', order: 0 },
    ]);
    // "Audio?" también slugifica a "audio"
    const result = await ensureProductCategory(fake.tx, 'Audio?');
    expect(result.created).toBe(true);
    expect(result.slug).toBe('audio-2');
    expect(fake.categories.map((c) => c.slug)).toEqual(['audio', 'audio-2']);
  });
});

describe('ensureProductCategory — P2002 reutiliza existente', () => {
  it('tras P2002 por name reconsulta y reutiliza la categoría', async () => {
    // Simulamos carrera: findFirst no ve la fila, create choca P2002, luego reconsulta.
    const race = createFakeTx();
    race.tx.category.findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'race-1',
        name: 'Accesorios para autos',
        slug: 'accesorios-para-autos',
      });
    race.failNextCreateOn('name');

    const result = await ensureProductCategory(race.tx, 'Accesorios para autos');
    expect(result.created).toBe(false);
    expect(result.name).toBe('Accesorios para autos');
  });
});

describe('atomicidad categoría + producto', () => {
  it('revierte la categoría si falla la creación del producto (rollback de TX)', async () => {
    const store: FakeCategory[] = [];
    let committed: FakeCategory[] = [];

    const runTransaction: CategoryTransactionRunner = async (fn) => {
      const snapshot = [...store];
      const fake = createFakeTx(store);
      fake.failProductCreate(true);
      try {
        const result = await fn(fake.tx);
        committed = [...fake.categories];
        store.splice(0, store.length, ...fake.categories);
        return result;
      } catch (e) {
        store.splice(0, store.length, ...snapshot);
        committed = [...snapshot];
        throw e;
      }
    };

    await expect(
      withSerializableCategoryTransaction(async (tx) => {
        const ensured = await ensureProductCategory(tx, 'Nueva Cat');
        await (tx as unknown as ReturnType<typeof createFakeTx>['tx']).product.create({
          data: { category: ensured.name },
        } as never);
        return ensured;
      }, runTransaction),
    ).rejects.toThrow('product create failed');

    expect(committed).toHaveLength(0);
    expect(store).toHaveLength(0);
  });
});

describe('concurrencia — withSerializableCategoryTransaction', () => {
  it('reintenta P2034 y termina con una sola categoría canónica', async () => {
    const categories: FakeCategory[] = [];
    let attempts = 0;

    const runTransaction: CategoryTransactionRunner = async (fn) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError('Serialization', {
          code: 'P2034',
          clientVersion: 'test',
        });
      }
      const fake = createFakeTx(categories);
      const result = await fn(fake.tx);
      categories.splice(0, categories.length, ...fake.categories);
      return result;
    };

    const a = await withSerializableCategoryTransaction(async (tx) => {
      const ensured = await ensureProductCategory(tx, 'Accesorios para autos');
      return ensured.name;
    }, runTransaction);

    const b = await withSerializableCategoryTransaction(async (tx) => {
      const ensured = await ensureProductCategory(tx, 'accesorios para autos');
      return { name: ensured.name, created: ensured.created };
    }, runTransaction);

    expect(a).toBe('Accesorios para autos');
    expect(b.name).toBe('Accesorios para autos');
    expect(b.created).toBe(false);
    expect(categories).toHaveLength(1);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('reintenta P2002 sin devolver error genérico cuando la categoría ya existe', async () => {
    let attempts = 0;
    const runTransaction: CategoryTransactionRunner = async (fn) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['name'] },
        });
      }
      const fake = createFakeTx([
        { id: '1', name: 'Accesorios para autos', slug: 'accesorios-para-autos', order: 0 },
      ]);
      return fn(fake.tx);
    };

    const result = await withSerializableCategoryTransaction(async (tx) => {
      return ensureProductCategory(tx, 'Accesorios para autos');
    }, runTransaction);

    expect(result.name).toBe('Accesorios para autos');
    expect(result.created).toBe(false);
    expect(attempts).toBe(2);
  });
});

describe('CategoryNameError', () => {
  it('rechaza nombres solo símbolos', async () => {
    const fake = createFakeTx();
    await expect(ensureProductCategory(fake.tx, '!!!')).rejects.toBeInstanceOf(CategoryNameError);
  });
});
