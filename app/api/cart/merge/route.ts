import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { rejectInvalidMutationOrigin, safeZodIssues } from '@/lib/security';
import { mergeCart } from '@/lib/cart';

const bodySchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1),
    }),
  ),
});

/**
 * POST /api/cart/merge
 * Fusiona el carrito de localStorage con el carrito en BD al hacer login.
 * Devuelve el carrito resultante enriquecido con datos de producto actualizados.
 */
export async function POST(request: Request) {
  // PRD-011: mitigación CSRF en mutaciones del carrito.
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requireUser();
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { items } = bodySchema.parse(body);
    const merged = await mergeCart(auth.session.user.id, items);
    return NextResponse.json({ items: merged });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos.', details: safeZodIssues(error.issues) }, { status: 400 });
    }
    logError('cart_merge_failed', error, { route: '/api/cart/merge' });
    return NextResponse.json({ error: 'Error al fusionar el carrito.' }, { status: 500 });
  }
}
