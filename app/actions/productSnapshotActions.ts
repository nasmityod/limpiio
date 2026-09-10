'use server';

/**
 * productSnapshotActions.ts — PRD-061 / PRD-096 / PRD-234 (segmento 04-UX)
 * Server Action pública y liviana para re-validar precio/stock de los ítems
 * del carrito contra la BD (el carrito invitado vive en localStorage y las
 * fichas ISR pueden servir datos obsoletos hasta 1 hora).
 *
 * Superficie pública → validación Zod + rate limit por IP + select mínimo.
 */
import { z } from 'zod';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { d, dn } from '@/lib/decimal';
import { logError } from '@/lib/safe-logger';

export interface ProductSnapshot {
  id: string;
  slug: string | null;
  name: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  images: string[];
  /** true = MundoTech cubre el envío de este producto; false = cobro a destino. */
  freeShipping: boolean;
}

const idsSchema = z.array(z.string().trim().min(1).max(64)).min(1).max(60);

async function clientIpFromHeaders(): Promise<string> {
  const h = await headers();
  // getClientIp espera un Request: construimos uno mínimo con los headers reales.
  return getClientIp(new Request('https://internal.local', { headers: h as unknown as HeadersInit }));
}

/**
 * Devuelve el estado actual (precio/stock) de los productos indicados.
 * Retorna `null` si la entrada es inválida o se superó el rate limit —
 * el cliente conserva su snapshot anterior sin romper la UI.
 */
export async function getProductSnapshots(ids: string[]): Promise<ProductSnapshot[] | null> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return null;

  const ip = await clientIpFromHeaders();
  if (await rateLimit(`product-snapshots:${ip}`, { limit: 30, windowMs: 60_000 })) {
    return null;
  }

  try {
    const rows = await prisma.product.findMany({
      where: { id: { in: parsed.data } },
      select: {
        id: true,
        slug: true,
        name: true,
        price: true,
        originalPrice: true,
        stock: true,
        images: true,
        freeShipping: true,
      },
    });
    // PRD-204: price/originalPrice son Decimal → convertir a number
    return rows.map(p => ({
      ...p,
      price: d(p.price),
      originalPrice: dn(p.originalPrice),
      freeShipping: p.freeShipping === true,
    }));
  } catch (error) {
    logError('product_snapshot_refresh_failed', error, { operation: 'get_product_snapshots' });
    return null;
  }
}
