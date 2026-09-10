/**
 * Búsqueda administrativa paginada de productos para el Gestor Home.
 * No expone costo, margen ni campos financieros.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { logError } from '@/lib/safe-logger';
import { d } from '@/lib/decimal';
import { firstCardImage } from '@/lib/product-media';

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  ids: z.string().trim().max(800).optional().default(''),
  limit: z.coerce.number().int().min(1).max(24).optional().default(12),
});

const PUBLIC_SELECT = {
  id: true,
  sku: true,
  name: true,
  price: true,
  stock: true,
  isActive: true,
  images: true,
} as const;

function toDto(row: {
  id: string;
  sku: string | null;
  name: string;
  price: { toNumber(): number };
  stock: number;
  isActive: boolean;
  images: string[];
}) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    price: d(row.price),
    stock: row.stock,
    isActive: row.isActive,
    image: firstCardImage(row.images),
  };
}

export async function GET(request: Request) {
  const auth = await requirePermission('SITE_CONTENT');
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      q: url.searchParams.get('q') ?? '',
      ids: url.searchParams.get('ids') ?? '',
      limit: url.searchParams.get('limit') ?? '12',
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
    }

    const { q, ids, limit } = parsed.data;
    const idList = ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 8);

    if (idList.length > 0) {
      const rows = await prisma.product.findMany({
        where: { id: { in: idList } },
        select: PUBLIC_SELECT,
      });
      const byId = new Map(rows.map((r) => [r.id, toDto(r)]));
      // Conserva el orden solicitado.
      const products = idList
        .map((id) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));
      return NextResponse.json({ products });
    }

    const where =
      q.length > 0
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { sku: { contains: q, mode: 'insensitive' as const } },
              { id: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {};

    const rows = await prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: PUBLIC_SELECT,
    });

    return NextResponse.json({ products: rows.map(toDto) });
  } catch (error) {
    logError('admin_products_search_failed', error, {
      route: '/api/admin/products/search',
    });
    return NextResponse.json(
      { error: 'Error al buscar productos.' },
      { status: 500 },
    );
  }
}
