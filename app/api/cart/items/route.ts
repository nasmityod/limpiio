import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { requireUser } from '@/lib/api-auth';
import { rejectInvalidMutationOrigin, safeZodIssues } from '@/lib/security';
import { upsertCartItem } from '@/lib/cart';

const bodySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(0),
});

/**
 * PATCH /api/cart/items — Inserta o actualiza un ítem en el carrito.
 * Si quantity === 0 el ítem se elimina.
 */
export async function PATCH(request: Request) {
  // PRD-011: mitigación CSRF en mutaciones del carrito.
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requireUser();
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { productId, quantity } = bodySchema.parse(body);
    await upsertCartItem(auth.session.user.id, productId, quantity);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos.', details: safeZodIssues(error.issues) }, { status: 400 });
    }
    logError('cart_items_patch_failed', error, { route: '/api/cart/items' });
    return NextResponse.json({ error: 'Error al actualizar el carrito.' }, { status: 500 });
  }
}
