/**
 * coupons.ts
 * Lógica de cupones de descuento: validación server-side, cálculo de descuento y
 * canje atómico. Regla financiera (R-checkout): el descuento SIEMPRE se calcula en
 * el servidor a partir de precios de BD; el cliente nunca fija el monto.
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Coupon as CouponClient, CouponDiscountType } from '@/lib/definitions';
import { roundMoney2 } from '@/lib/exchange-rate';
import { logWarn } from '@/lib/safe-logger';
import { d, dn } from '@/lib/decimal';
type Decimal = Prisma.Decimal;

/** Cliente Prisma o cliente de transacción: ambos exponen los modelos necesarios. */
type DbClient = Prisma.TransactionClient;

/** Mensaje genérico anti-enumeración: no revela si el código existe, expiró o agotó usos. */
export const COUPON_GENERIC_INVALID_REASON = 'Este cupón no es válido para tu pedido.';

/** Mensaje específico de límite por usuario (solo tras confirmar cupón válido). */
export const COUPON_PER_USER_LIMIT_REASON = 'Alcanzaste el límite de usos de este cupón.';

/** Normaliza el código: mayúsculas, sin espacios. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/** Acepta '' / null como null; coacciona strings ISO o datetime-local a Date. */
const optionalDate = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.date().nullable(),
);

/** Umbral de descuento alto que exige al menos maxUses o perUserLimit. */
const HIGH_DISCOUNT_PERCENT_THRESHOLD = 50;

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'El código debe tener al menos 2 caracteres.')
      .max(40, 'El código es demasiado largo.'),
    description: z.string().max(200).optional().nullable(),
    discountType: z.enum(['PERCENT', 'FIXED']),
    discountValue: z.number().positive('El valor del descuento debe ser mayor que 0.'),
    minPurchase: z.number().min(0).optional().default(0),
    maxDiscount: z.number().positive().optional().nullable(),
    maxUses: z.number().int().positive().optional().nullable(),
    perUserLimit: z.number().int().positive().optional().nullable(),
    startsAt: optionalDate.optional(),
    expiresAt: optionalDate.optional(),
    active: z.boolean().optional().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.discountType === 'PERCENT' && d.discountValue > 100) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un descuento porcentual no puede superar 100%.',
        path: ['discountValue'],
      });
    }
    if (d.discountType === 'PERCENT' && d.discountValue >= 100 && d.maxUses == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un cupón del 100% o más debe tener un límite global de usos (maxUses).',
        path: ['maxUses'],
      });
    }
    const isHighDiscount =
      (d.discountType === 'PERCENT' && d.discountValue >= HIGH_DISCOUNT_PERCENT_THRESHOLD) ||
      (d.discountType === 'FIXED' && d.discountValue >= HIGH_DISCOUNT_PERCENT_THRESHOLD);
    if (isHighDiscount && d.maxUses == null && d.perUserLimit == null) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Descuentos altos requieren al menos un límite de usos (maxUses o perUserLimit).',
        path: ['maxUses'],
      });
    }
    if (d.startsAt && d.expiresAt && d.startsAt > d.expiresAt) {
      ctx.addIssue({
        code: 'custom',
        message: 'La fecha de inicio no puede ser posterior a la de expiración.',
        path: ['expiresAt'],
      });
    }
  });

export type CouponInput = z.infer<typeof couponInputSchema>;

/** Mapea un registro Prisma de Coupon al tipo de UI. */
export function couponToClient(c: {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: Decimal | number;
  minPurchase: Decimal | number;
  maxDiscount: Decimal | number | null;
  maxUses: number | null;
  usedCount: number;
  perUserLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
  createdAt: Date;
}): CouponClient {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    discountType: c.discountType as CouponDiscountType,
    // PRD-204: convertir Decimal → number en la frontera BD→UI
    discountValue: d(c.discountValue),
    minPurchase: d(c.minPurchase),
    maxDiscount: dn(c.maxDiscount),
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
  };
}

/**
 * Descuento en USD para un subtotal dado. Función pura: el servidor la usa con
 * `subtotalUsd` calculado desde precios de BD. Nunca excede el subtotal.
 */
export function computeCouponDiscountUsd(
  coupon: { discountType: string; discountValue: number; maxDiscount: number | null },
  subtotalUsd: number,
): number {
  let discount = 0;
  if (coupon.discountType === 'PERCENT') {
    discount = subtotalUsd * (coupon.discountValue / 100);
  } else {
    discount = coupon.discountValue;
  }
  if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  discount = Math.min(discount, subtotalUsd);
  return roundMoney2(Math.max(0, discount));
}

export type ValidatedCoupon = {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxUses: number | null;
  perUserLimit: number | null;
};

export type CouponValidationResult =
  | { ok: true; coupon: ValidatedCoupon; discountUsd: number }
  | { ok: false; reason: string };

function rejectCouponGeneric(_detail: string, _code: string): CouponValidationResult {
  logWarn('coupon_rejected', { operation: 'validate_coupon' });
  return { ok: false, reason: COUPON_GENERIC_INVALID_REASON };
}

/** Cuenta canjes activos (no revertidos) de un par cupón-usuario. */
function activeRedemptionWhere(couponId: string, userId: string) {
  return { couponId, userId, revertedAt: null };
}

/**
 * Valida un cupón contra el subtotal (USD) y el usuario. NO incrementa usos
 * (eso lo hace `redeemCouponInTransaction` de forma atómica al confirmar).
 *
 * Anti-enumeración: inexistente/inactivo/expirado/maxUses agotado → mismo mensaje
 * genérico. Mensajes específicos solo para compra mínima y perUserLimit (el cupón
 * ya fue encontrado y es válido en esos aspectos; no revelan existencia del código).
 */
export async function validateCouponForCheckout(
  db: DbClient,
  rawCode: string,
  subtotalUsd: number,
  userId: string | null,
  _customerEmail?: string | null,
): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, reason: 'Ingresa un código de cupón.' };

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) {
    return rejectCouponGeneric('inexistente o inactivo', code);
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return rejectCouponGeneric('aún no activo (startsAt)', code);
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return rejectCouponGeneric('expirado', code);
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return rejectCouponGeneric('maxUses alcanzado', code);
  }
  // PRD-204: coupon.minPurchase es Decimal — convertir para comparación numérica.
  const minPurchaseNum = d(coupon.minPurchase);
  if (subtotalUsd + 0.0001 < minPurchaseNum) {
    return {
      ok: false,
      reason: `Requiere una compra mínima de $${minPurchaseNum.toFixed(2)}.`,
    };
  }
  if (coupon.perUserLimit != null) {
    // POST /api/orders exige sesión; sin userId autenticado no se permite canjear
    // cupones con límite por usuario (la rama invitado por email fue eliminada).
    if (!userId || userId === 'guest') {
      return rejectCouponGeneric('invitado con perUserLimit (checkout exige login)', code);
    }
    const used = await db.couponRedemption.count({
      where: activeRedemptionWhere(coupon.id, userId),
    });
    if (used >= coupon.perUserLimit) {
      return { ok: false, reason: COUPON_PER_USER_LIMIT_REASON };
    }
  }

  // PRD-204: normalizar campos Decimal → number antes de pasarlos a computeCouponDiscountUsd
  const couponForCalc = {
    discountType: coupon.discountType,
    discountValue: d(coupon.discountValue),
    maxDiscount: dn(coupon.maxDiscount),
  };
  const discountUsd = computeCouponDiscountUsd(couponForCalc, subtotalUsd);
  if (discountUsd <= 0) {
    return rejectCouponGeneric('sin descuento aplicable', code);
  }

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: d(coupon.discountValue),
      maxUses: coupon.maxUses,
      perUserLimit: coupon.perUserLimit,
    },
    discountUsd,
  };
}

/**
 * Incrementa `usedCount` de forma atómica (respeta `maxUses`) y registra el canje.
 * Debe ejecutarse DENTRO de la transacción de creación del pedido.
 */
export async function redeemCouponInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    couponId: string;
    maxUses: number | null;
    perUserLimit: number | null;
    orderId: string;
    userId: string | null;
    discountBs: number;
  },
): Promise<void> {
  const { couponId, maxUses, perUserLimit, orderId, userId, discountBs } = params;
  const normalizedUserId = userId && userId !== 'guest' ? userId : null;

  let perUserSlot: number | null = null;
  if (perUserLimit != null && normalizedUserId) {
    const activeCount = await tx.couponRedemption.count({
      where: activeRedemptionWhere(couponId, normalizedUserId),
    });
    if (activeCount >= perUserLimit) {
      throw new Error(COUPON_PER_USER_LIMIT_REASON);
    }
    perUserSlot = activeCount + 1;
  }

  const res = await tx.coupon.updateMany({
    where: maxUses != null ? { id: couponId, usedCount: { lt: maxUses } } : { id: couponId },
    data: { usedCount: { increment: 1 } },
  });
  if (res.count === 0) {
    throw new Error(COUPON_GENERIC_INVALID_REASON);
  }

  try {
    await tx.couponRedemption.create({
      data: {
        couponId,
        orderId,
        userId: normalizedUserId,
        perUserSlot,
        discount: roundMoney2(discountBs),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Error(COUPON_PER_USER_LIMIT_REASON);
    }
    throw err;
  }

  // Reverificación dentro de la misma tx: cierra carrera concurrente en perUserLimit.
  if (perUserLimit != null && normalizedUserId) {
    const finalCount = await tx.couponRedemption.count({
      where: activeRedemptionWhere(couponId, normalizedUserId),
    });
    if (finalCount > perUserLimit) {
      throw new Error(COUPON_PER_USER_LIMIT_REASON);
    }
  }
}

/**
 * PRD-190: revierte el canje del cupón al cancelar/eliminar un pedido.
 * Decrementa `usedCount` (sin bajar de 0) y marca el canje como revertido (auditoría
 * append-only) en lugar de borrarlo, de modo que el límite global Y el límite por
 * usuario vuelven a liberarse sin permitir reciclar cupones de stock limitado.
 * Idempotente: si el pedido no tenía cupón (o ya se revirtió), no hace nada.
 * Debe ejecutarse DENTRO de la transacción de cancelación.
 */
export async function revertCouponRedemptionInTransaction(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const redemption = await tx.couponRedemption.findUnique({
    where: { orderId },
    select: { id: true, couponId: true, revertedAt: true },
  });
  if (!redemption || redemption.revertedAt) return;

  await tx.coupon.updateMany({
    where: { id: redemption.couponId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
  await tx.couponRedemption.update({
    where: { id: redemption.id },
    data: { revertedAt: new Date() },
  });
}
