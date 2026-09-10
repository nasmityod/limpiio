'use server';

import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { upsertAbandonedCart, markCartRecovered } from '@/lib/abandoned-cart';
import { rateLimit } from '@/lib/rate-limit';
import { getActionClientIp } from '@/lib/security';
import { logWarn, logError } from '@/lib/safe-logger';
import type { AbandonedCartItem } from '@/lib/definitions';

const snapshotSchema = z.object({
  email: z.string().email().max(254),
  userId: z.string().max(64).nullable(),
  items: z
    .array(
      z.object({
        id: z.string().max(64),
        slug: z.string().max(200),
        name: z.string().max(300),
        price: z.number().nonnegative(),
        quantity: z.number().int().positive().max(99),
        image: z.string().max(600).nullable(),
      }),
    )
    .min(1)
    .max(60),
  totalUsd: z.number().nonnegative().max(1_000_000),
});

/**
 * Guarda o actualiza el snapshot del carrito cuando el cliente
 * completa el paso 1 del checkout (tiene email + artículos).
 *
 * Llamada best-effort desde CheckoutFlow: los errores no deben
 * bloquear el flujo de compra.
 *
 * PRD-017: para usuarios registrados el email se toma SIEMPRE de la sesión
 * del servidor — los parámetros del cliente se ignoran para identidad.
 * FASE 4.1 (guest checkout): sin sesión, se acepta el email del formulario
 * (ya es requerido y validado por Zod en el cliente); rate limit por IP
 * previene abusos.
 */
export async function saveCartSnapshotAction(
  _email:   string,
  _userId:  string | null,
  items:    AbandonedCartItem[],
  totalUsd: number,
): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? '';
    const sessionUserId = session?.user?.id ?? null;
    const hasSession = !!sessionEmail && !!sessionUserId;

    // FASE 4.1: sin sesión, el email del formulario es la única fuente.
    // Se valida con Zod abajo; rate limit por IP protege contra abuso.
    const email = hasSession ? sessionEmail : _email?.trim().toLowerCase();
    const userId = hasSession ? sessionUserId : null;
    if (!email) return;

    const ip = await getActionClientIp();
    if (await rateLimit(`cart-snapshot:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
      logWarn('abandoned_cart_snapshot_rate_limited', { operation: 'save_cart_snapshot' });
      return;
    }

    const parsed = snapshotSchema.safeParse({
      email,
      userId,
      items,
      totalUsd,
    });
    if (!parsed.success) {
      logWarn('abandoned_cart_snapshot_invalid_payload', { operation: 'save_cart_snapshot' });
      return;
    }

    await upsertAbandonedCart(parsed.data);
  } catch (error) {
    logError('abandoned_cart_snapshot_failed', error, { operation: 'save_cart_snapshot' });
  }
}

/**
 * Marca todos los carritos activos del usuario como RECOVERED.
 * Debe llamarse justo después de crear el pedido con éxito.
 *
 * PRD-016: acción pública ('use server') — antes aceptaba cualquier email y
 * permitía sabotear el remarketing de terceros. Ahora exige sesión y opera
 * solo sobre el email de la PROPIA sesión (coherente con el snapshot).
 */
export async function markCartRecoveredAction(_email: string): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? '';
    if (!sessionEmail) return;

    const ip = await getActionClientIp();
    if (await rateLimit(`cart-recovered:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
      return;
    }

    await markCartRecovered(sessionEmail);
  } catch (error) {
    logError('abandoned_cart_recovered_action_failed', error, { operation: 'mark_cart_recovered' });
  }
}
