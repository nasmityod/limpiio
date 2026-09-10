import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { DEFAULT_HOMEPAGE_SHELVES } from '@/lib/homepage-config';

const findUnique = vi.fn();
const findManyProducts = vi.fn();
const findManyCategories = vi.fn();
const upsert = vi.fn();

vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: {
      findMany: vi.fn(),
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
    product: {
      findMany: (...args: unknown[]) => findManyProducts(...args),
    },
    category: {
      findMany: (...args: unknown[]) => findManyCategories(...args),
    },
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { requirePermission } from '@/lib/admin-access-server';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { PUT } from '@/app/api/config/homepage/route';

async function putShelves(featuredProductIds: string[]) {
  const req = new Request('http://localhost/api/config/homepage', {
    method: 'PUT',
    body: JSON.stringify({
      key: 'homepage_shelves',
      value: { ...DEFAULT_HOMEPAGE_SHELVES, featuredProductIds },
    }),
  });
  return PUT(req);
}

describe('PUT /api/config/homepage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rejectInvalidMutationOrigin).mockReturnValue(null);
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
    } as never);
    findUnique.mockResolvedValue(null);
    findManyProducts.mockResolvedValue([]);
    findManyCategories.mockResolvedValue([]);
    upsert.mockResolvedValue({});
  });

  it('payload no autorizado se rechaza', async () => {
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const req = new Request('http://localhost/api/config/homepage', {
      method: 'PUT',
      body: JSON.stringify({
        key: 'homepage_free_shipping',
        value: { enabled: true, text: 'Envío gratis por MRW' },
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it('rechaza origin inválido', async () => {
    vi.mocked(rejectInvalidMutationOrigin).mockReturnValue(
      NextResponse.json({ error: 'Invalid origin' }, { status: 403 }),
    );
    const req = new Request('http://localhost/api/config/homepage', {
      method: 'PUT',
      body: JSON.stringify({
        key: 'homepage_free_shipping',
        value: { enabled: true, text: 'Envío gratis por MRW' },
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it('rechaza texto MRW vacío', async () => {
    const req = new Request('http://localhost/api/config/homepage', {
      method: 'PUT',
      body: JSON.stringify({
        key: 'homepage_free_shipping',
        value: { enabled: true, text: '   ' },
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('rechaza shelves con más de 8 destacados', async () => {
    const res = await putShelves(
      Array.from({ length: 9 }, (_, i) => `id-${i}`),
    );
    expect(res.status).toBe(400);
  });

  it('ID nuevo activo aceptado', async () => {
    findManyProducts.mockResolvedValue([{ id: 'new-1', isActive: true }]);
    const res = await putShelves(['new-1']);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
  });

  it('ID nuevo inactivo rechazado', async () => {
    findManyProducts.mockResolvedValue([{ id: 'new-1', isActive: false }]);
    const res = await putShelves(['new-1']);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.inactive).toContain('new-1');
  });

  it('ID nuevo inexistente rechazado', async () => {
    findManyProducts.mockResolvedValue([]);
    const res = await putShelves(['missing-1']);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing).toContain('missing-1');
  });

  it('ID guardado previamente y luego inactivo se conserva', async () => {
    findUnique.mockResolvedValue({
      value: JSON.stringify({
        ...DEFAULT_HOMEPAGE_SHELVES,
        featuredProductIds: ['old-1'],
      }),
    });
    // No se consulta producto porque old-1 no es nuevo.
    const res = await putShelves(['old-1']);
    expect(res.status).toBe(200);
    expect(findManyProducts).not.toHaveBeenCalled();
  });

  it('ID guardado previamente y luego ausente se conserva', async () => {
    findUnique.mockResolvedValue({
      value: JSON.stringify({
        ...DEFAULT_HOMEPAGE_SHELVES,
        featuredProductIds: ['ghost-1'],
      }),
    });
    const res = await putShelves(['ghost-1']);
    expect(res.status).toBe(200);
    expect(findManyProducts).not.toHaveBeenCalled();
  });

  it('IDs duplicados rechazados', async () => {
    const res = await putShelves(['a', 'a']);
    expect(res.status).toBe(400);
  });

  it('categoría nueva existente se acepta', async () => {
    findManyCategories.mockResolvedValue([{ id: 'cat-1' }]);
    const req = new Request('http://localhost/api/config/homepage', {
      method: 'PUT',
      body: JSON.stringify({
        key: 'homepage_shelves',
        value: {
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
        },
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(findManyCategories).toHaveBeenCalled();
  });

  it('categoría nueva inexistente se rechaza', async () => {
    findManyCategories.mockResolvedValue([]);
    const req = new Request('http://localhost/api/config/homepage', {
      method: 'PUT',
      body: JSON.stringify({
        key: 'homepage_shelves',
        value: {
          ...DEFAULT_HOMEPAGE_SHELVES,
          categoryShelves: [
            {
              categoryId: 'missing-cat',
              enabled: true,
              title: 'Cocina',
              badge: '',
              subtitle: '',
            },
          ],
        },
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missingCategories).toContain('missing-cat');
  });

  it('categoría guardada previamente y luego ausente se conserva', async () => {
    findUnique.mockResolvedValue({
      value: JSON.stringify({
        ...DEFAULT_HOMEPAGE_SHELVES,
        categoryShelves: [
          {
            categoryId: 'old-cat',
            enabled: true,
            title: 'Cocina',
            badge: '',
            subtitle: '',
          },
        ],
      }),
    });
    const req = new Request('http://localhost/api/config/homepage', {
      method: 'PUT',
      body: JSON.stringify({
        key: 'homepage_shelves',
        value: {
          ...DEFAULT_HOMEPAGE_SHELVES,
          categoryShelves: [
            {
              categoryId: 'old-cat',
              enabled: true,
              title: 'Cocina',
              badge: '',
              subtitle: '',
            },
          ],
        },
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(findManyCategories).not.toHaveBeenCalled();
  });
});
