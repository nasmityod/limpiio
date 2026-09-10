import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getCartsFor24hEmail,
  getCartsFor72hEmail,
  markCartEmailedAndRotateToken,
  refreshAbandonedCartItems,
} from '@/lib/abandoned-cart';
import { prisma } from '@/lib/prisma';
import { sendAbandonedCartEmail } from '@/lib/resend';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

/**
 * GET /api/cron/abandoned-cart
 *
 * Envía recordatorios de carrito abandonado en dos oleadas:
 *   - 24 h: carritos PENDING con lastActivityAt > 24 h.
 *   - 72 h: carritos EMAILED_24H con emailSentAt > 48 h adicionales.
 *
 * Protección: requiere Authorization: Bearer <CRON_SECRET> (timing-safe)
 * (o el header x-vercel-cron si se ejecuta desde Vercel Cron).
 *
 * Variables de entorno necesarias:
 *   CRON_SECRET — token arbitrario para autenticar llamadas manuales.
 */
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // Llamada autenticada con el secreto (timing-safe, funciona en cualquier entorno)
  if (cronSecret && verifyBearerSecret(req, cronSecret)) return true;

  // Header de Vercel Cron: solo es confiable cuando realmente corremos EN
  // Vercel (la plataforma lo inyecta y un cliente externo no puede llegar con
  // él sin pasar por el proxy). Fuera de Vercel, cualquiera podría enviarlo.
  if (process.env.VERCEL === '1' && req.headers.get('x-vercel-cron') === '1') {
    return true;
  }

  // Sin CRON_SECRET configurado: solo permitir en desarrollo local
  return !cronSecret && process.env.NODE_ENV === 'development';
}

/**
 * FASE 3 / MEJORA 1.3: el SEGUNDO toque (oleada 72 h) incluye un cupón de un
 * solo uso (5% con tope $10, expira en 7 días) generado con el sistema de
 * cupones existente. perUserLimit=1 aplica también por email para invitados
 * (PRD-157). Si la creación falla, el email sale sin cupón (best-effort).
 */
const RECOVERY_COUPON = {
  discountType: 'PERCENT',
  discountValue: 5,
  maxDiscount: 10,
  expiryDays: 7,
} as const;

async function createRecoveryCoupon(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = `VUELVE-${randomBytes(3).toString('hex').toUpperCase()}`;
    try {
      await prisma.coupon.create({
        data: {
          code,
          description: 'Cupón de recuperación de carrito (un solo uso)',
          discountType: RECOVERY_COUPON.discountType,
          discountValue: RECOVERY_COUPON.discountValue,
          maxDiscount: RECOVERY_COUPON.maxDiscount,
          minPurchase: 0,
          maxUses: 1,
          perUserLimit: 1,
          expiresAt: new Date(Date.now() + RECOVERY_COUPON.expiryDays * 24 * 60 * 60 * 1000),
          active: true,
        },
      });
      return code;
    } catch (err) {
      // Colisión de código único (P2002) → reintenta con otro código.
      if (attempt === 2) {
        logError('cron_abandoned_cart_coupon_failed', err, { operation: 'abandoned_cart_coupon' });
      }
    }
  }
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sent24h  = 0;
  let sent72h  = 0;
  let errors24 = 0;
  let errors72 = 0;

  try {
    // ── 24 h ──────────────────────────────────────────────────────────────
    const carts24h = await getCartsFor24hEmail();

    for (const cart of carts24h) {
      // PRD-176/PRD-181: el email se arma con precios, nombres y slugs ACTUALES
      // de BD; productos eliminados o agotados se omiten. Sin ítems vigentes no
      // se envía nada (se reintenta en la próxima corrida por si hay restock).
      const refreshed = await refreshAbandonedCartItems(cart.items);
      if (!refreshed) continue;

      const firstName = cart.email.split('@')[0] ?? 'Cliente';

      // PRD-211: reclamar ANTES de enviar — guard atómico de estado evita correo
      // duplicado y no revierte RECOVERED/OPTED_OUT si cambió tras el findMany.
      const claim24 = await markCartEmailedAndRotateToken(cart.id, 'PENDING');
      if (!claim24.claimed) continue;

      try {
        await sendAbandonedCartEmail({
          email:         cart.email,
          customerName:  firstName,
          items:         refreshed.items,
          totalUsd:      refreshed.totalUsd,
          recoveryToken: claim24.recoveryToken,
        });
        sent24h++;
      } catch (err) {
        logError('cron_abandoned_cart_24h_failed', err, { operation: 'abandoned_cart_24h' });
        errors24++;
      }
    }

    // ── 72 h ──────────────────────────────────────────────────────────────
    const carts72h = await getCartsFor72hEmail();

    for (const cart of carts72h) {
      // PRD-176/PRD-181: mismo refresco contra catálogo que la oleada de 24h.
      const refreshed = await refreshAbandonedCartItems(cart.items);
      if (!refreshed) continue;

      const firstName = cart.email.split('@')[0] ?? 'Cliente';

      const claim72 = await markCartEmailedAndRotateToken(cart.id, 'EMAILED_24H');
      if (!claim72.claimed) continue;

      // MEJORA 1.3: segundo toque más agresivo — cupón de un solo uso.
      const couponCode = await createRecoveryCoupon();

      try {
        await sendAbandonedCartEmail({
          email:         cart.email,
          customerName:  firstName,
          items:         refreshed.items,
          totalUsd:      refreshed.totalUsd,
          recoveryToken: claim72.recoveryToken,
          coupon: couponCode
            ? {
                code: couponCode,
                discountLabel: `${RECOVERY_COUPON.discountValue}% de descuento (hasta $${RECOVERY_COUPON.maxDiscount})`,
                expiryDays: RECOVERY_COUPON.expiryDays,
              }
            : undefined,
        });
        sent72h++;
      } catch (err) {
        logError('cron_abandoned_cart_72h_failed', err, { operation: 'abandoned_cart_72h' });
        errors72++;
      }
    }

    logInfo('cron_abandoned_cart', { count: sent24h + sent72h, operation: 'abandoned_cart' });

    return NextResponse.json({
      ok:      true,
      sent24h,
      sent72h,
      errors24,
      errors72,
    });
  } catch (err) {
    logError('cron_abandoned_cart_error', err, { operation: 'abandoned_cart' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
