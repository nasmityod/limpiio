'use server';

import { prisma } from '@/lib/prisma';
import { enqueueRestockNotifications, processEmailDeliveries } from '@/lib/email-delivery';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermissionAction } from '@/lib/admin-access-server';
import { getActionClientIp } from '@/lib/security';
import { z } from 'zod';
import { logWarn, logError, logInfo } from '@/lib/safe-logger';

const subscribeSchema = z.object({
  email:     z.string().trim().toLowerCase().email('Email inválido'),
  productId: z.string().min(1, 'Producto requerido'),
});

/**
 * Suscribe un email para recibir aviso cuando el producto vuelva a tener stock.
 * No requiere sesión — funciona para visitantes y clientes registrados.
 * Rate limit: 5 suscripciones por IP por hora.
 */
export async function subscribeRestockAction(
  email: string,
  productId: string,
): Promise<{ success: boolean; message: string }> {
  // Rate limiting por IP para evitar spam.
  // PRD-019: getActionClientIp respeta DEPLOYMENT_ENV y toma el último valor
  // de x-forwarded-for (el primero es falsificable por el cliente).
  const ip = await getActionClientIp();

  const blocked = await rateLimit(`restock:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (blocked) {
    return { success: false, message: 'Demasiados intentos. Inténtalo más tarde.' };
  }

  const parsed = subscribeSchema.safeParse({ email, productId });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const product = await prisma.product.findUnique({
      where:  { id: productId },
      select: { id: true, stock: true, isActive: true },
    });

    if (!product?.isActive) {
      return { success: false, message: 'Producto no encontrado.' };
    }

    if (product.stock > 0) {
      return { success: false, message: 'Este producto ya tiene stock disponible.' };
    }

    await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'restock:' + parsed.data.email + ':' + productId}, 0))`;
    const subscription = await tx.restockSubscription.upsert({
      where:  { email_productId: { email: parsed.data.email, productId } },
      update: {},
      create: { email: parsed.data.email, productId },
    });
    if (subscription.notifiedAt) await tx.restockSubscription.update({ where: { id: subscription.id }, data: { notifiedAt: null, generation: { increment: 1 } } });
    });

    return {
      success: true,
      message: 'Te avisaremos por email cuando el producto esté disponible.',
    };
  } catch (err) {
    logError('restock_subscribe_failed', err, { operation: 'subscribe_restock' });
    return { success: false, message: 'No se pudo registrar tu solicitud. Inténtalo de nuevo.' };
  }
}

/**
 * Envía emails a todos los suscriptores pendientes de un producto que acaba de
 * tener restock. La cola durable conserva fallos y reclamos interrumpidos;
 * `notifiedAt` solo se fija tras aceptación del proveedor.
 *
 * Debe llamarse SOLO cuando el stock pasa de 0 a > 0.
 */
export async function triggerRestockNotifications(
  productId: string,
  productName: string,
  productSlug: string | null,
  productImageUrl?: string | null,
  productPrice?: number,
): Promise<void> {
  /*
   * PRD-006: este archivo es 'use server' → toda función exportada es un
   * endpoint RPC público. Sin este guard, cualquiera podía disparar email
   * bombing a los suscriptores de restock. Los llamadores legítimos
   * (quickUpdateStockAction / updateProductAction) ya corren con sesión
   * admin, así que el guard no altera el flujo normal.
   */
  try {
    await requirePermissionAction('CATALOG');
  } catch {
    logWarn('restock_trigger_unauthorized', { operation: 'trigger_restock_notifications' });
    return;
  }

  try {
    // Build the notification from the authoritative catalogue, not RPC input.
    await enqueueRestockNotifications(productId);
    const result = await processEmailDeliveries(['RESTOCK']);
    if (result.accepted.RESTOCK) {
      logInfo('restock_notifications_accepted', { count: result.accepted.RESTOCK, operation: 'trigger_restock_notifications' });
    }
  } catch (err) {
    logError('restock_notifications_dispatch_failed', err, { operation: 'trigger_restock_notifications' });
  }
}
