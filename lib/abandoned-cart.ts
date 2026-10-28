import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { AbandonedCartItem, AbandonedCartStatus } from '@/lib/definitions';
import { d } from '@/lib/decimal';
import { logError } from '@/lib/safe-logger';
import type { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// PRD-178 — Tokens de recuperación hasheados.
// En BD solo se guarda SHA-256 del token (igual que PasswordResetToken); el
// token en claro existe únicamente dentro del email enviado. Toda búsqueda por
// token debe pasar por estas funciones (hashean internamente).
// ─────────────────────────────────────────────────────────────────────────────

export function hashRecoveryToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateRecoveryToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashRecoveryToken(token) };
}

/** Crea o actualiza el snapshot de carrito para el email dado.
 *
 * - Si ya existe un registro PENDING o EMAILED_24H para ese email → actualiza ítems, total y lastActivityAt.
 * - Si no existe (o el más reciente es RECOVERED/OPTED_OUT/EMAILED_72H) → crea uno nuevo PENDING.
 *
 * Nunca lanza: los errores se registran y se tragan para no bloquear el checkout.
 */
export async function upsertAbandonedCart(params: {
  email:    string;
  userId?:  string | null;
  items:    AbandonedCartItem[];
  totalUsd: number;
}): Promise<void> {
  const { email, userId, items, totalUsd } = params;
  if (!email.trim() || items.length === 0) return;

  try {
    await prisma.$transaction(async (tx) => {
    const normalizedEmail = email.toLowerCase().trim();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'reminder:' + normalizedEmail}, 0))`;
    const preference = await tx.cartReminderPreference.findUnique({ where: { email: normalizedEmail } });
    if (preference?.optedOutAt) return;
    const existing = await tx.abandonedCart.findFirst({
      where: {
        email: email.toLowerCase().trim(),
        status: { in: ['PENDING', 'EMAILED_24H'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // PRD-177: actualizar ítems/total/actividad SIN reiniciar el ciclo de
      // emails. Antes esto devolvía EMAILED_24H → PENDING y borraba emailSentAt,
      // con lo que el cron re-enviaba el correo de 24h casi de inmediato.
      await tx.abandonedCart.update({
        where: { id: existing.id },
        data: {
          items:          items as object[],
          totalUsd,
          lastActivityAt: new Date(),
          userId:         userId ?? existing.userId,
        },
      });
    } else {
      await tx.abandonedCart.create({
        data: {
          email:    email.toLowerCase().trim(),
          userId:   userId ?? null,
          items:    items as object[],
          totalUsd,
          status:   'PENDING' satisfies AbandonedCartStatus,
          // El token definitivo se genera (y rota) al enviar cada email; este
          // valor inicial nunca sale de la BD y no es recuperable (solo hash).
          recoveryTokenHash: generateRecoveryToken().hash,
        },
      });
    }
    });
  } catch (err) {
    logError('abandoned_cart_upsert_failed', err, { operation: 'upsert_abandoned_cart' });
  }
}

/** Marca como RECOVERED todos los carritos activos del email (al completar el pedido). */
export async function markCartRecovered(email: string): Promise<void> {
  if (!email.trim()) return;
  try {
    await prisma.abandonedCart.updateMany({
      where: {
        email:  email.toLowerCase().trim(),
        status: { in: ['PENDING', 'EMAILED_24H', 'EMAILED_72H'] },
      },
      data: {
        status:      'RECOVERED' satisfies AbandonedCartStatus,
        recoveredAt: new Date(),
      },
    });
  } catch (err) {
    logError('abandoned_cart_recovered_mark_failed', err, { operation: 'mark_cart_recovered' });
  }
}

/** Marca el carrito como OPTED_OUT por su token de recuperación (enlace de baja
 *  del email). Recibe el token EN CLARO y lo hashea para buscar en BD. */
export async function markCartOptedOut(recoveryToken: string): Promise<boolean> {
  if (!recoveryToken.trim()) return false;
  try {
    const recipient = await findCartReminderRecipientByToken(recoveryToken);
    if (!recipient) return false;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'reminder:' + recipient.email}, 0))`;
      await tx.cartReminderPreference.upsert({
        where: { email: recipient.email }, create: { email: recipient.email, optedOutAt: new Date() }, update: { optedOutAt: new Date() },
      });
      await tx.abandonedCart.updateMany({ where: { email: recipient.email, status: { in: ['PENDING', 'EMAILED_24H', 'EMAILED_72H'] } }, data: { status: 'OPTED_OUT' } });
      await tx.emailDelivery.updateMany({ where: { recipient: recipient.email, kind: { in: ['ABANDONED_24H', 'ABANDONED_72H'] }, status: { in: ['PENDING', 'PROCESSING', 'REVIEW'] } }, data: { status: 'CANCELED', leaseId: null, lockedUntil: null } });
    });
    return true;
  } catch (err) {
    logError('abandoned_cart_opted_out_failed', err, { operation: 'mark_cart_opted_out' });
    return false;
  }
}

/** Unsubscribe tokens remain valid across waves and after recovery expiry. */
export async function findCartReminderRecipientByToken(token: string): Promise<{ email: string } | null> {
  if (!/^[a-f0-9]{64}$/i.test(token.trim())) return null;
  const hash = hashRecoveryToken(token.trim());
  const preference = await prisma.cartReminderPreference.findUnique({ where: { unsubscribeTokenHash: hash }, select: { email: true } });
  if (preference) return preference;
  const delivery = await prisma.emailDelivery.findUnique({ where: { recoveryTokenHash: hash }, select: { recipient: true } });
  if (delivery) return { email: delivery.recipient };
  return prisma.abandonedCart.findUnique({ where: { recoveryTokenHash: hash }, select: { email: true } });
}

/** Busca un carrito abandonado por su token en claro (para el flujo de
 *  recuperación — PRD-175, segmento 02). Hashea internamente: el llamador
 *  nunca toca el hash. Devuelve null si el token no corresponde a un carrito. */
export async function findAbandonedCartByRecoveryToken(recoveryToken: string): Promise<{
  id:     string;
  email:  string;
  items:  unknown;
  status: string;
} | null> {
  if (!recoveryToken.trim()) return null;
  try {
    const hash = hashRecoveryToken(recoveryToken.trim());
    const delivery = await prisma.emailDelivery.findUnique({ where: { recoveryTokenHash: hash }, select: { resourceId: true, tokenExpiresAt: true } });
    if (delivery && (!delivery.tokenExpiresAt || delivery.tokenExpiresAt <= new Date())) return null;
    const cart = await prisma.abandonedCart.findUnique({
      where: delivery ? { id: delivery.resourceId } : { recoveryTokenHash: hash },
      select: { id: true, email: true, items: true, status: true, createdAt: true },
    });
    if (!cart || (!delivery && Date.now() - cart.createdAt.getTime() > 30 * 24 * 60 * 60_000)) return null;
    const preference = await prisma.cartReminderPreference.findUnique({ where: { email: cart.email }, select: { optedOutAt: true } });
    if (preference?.optedOutAt) return null;
    return cart;
  } catch (err) {
    logError('abandoned_cart_find_by_token_failed', err, { operation: 'find_by_recovery_token' });
    return null;
  }
}

/** Registros elegibles para el email de 24h:
 *  - status = PENDING
 *  - lastActivityAt < ahora − 24h
 */
export async function getCartsFor24hEmail(): Promise<{
  id:       string;
  email:    string;
  items:    unknown;
  totalUsd: number;
}[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ id: string; email: string; items: unknown; totalUsd: Prisma.Decimal }>>`
    SELECT c.id, c.email, c.items, c."totalUsd" FROM "AbandonedCart" c
    WHERE c.status = 'PENDING' AND c."lastActivityAt" < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM "CartReminderPreference" p WHERE p.email = c.email AND p."optedOutAt" IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM "EmailDelivery" e
        WHERE e.kind = 'ABANDONED_24H' AND e."resourceId" = c.id
          AND e.payload->>'activityAt' = to_char(c."lastActivityAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ORDER BY c."lastActivityAt" ASC, c.id ASC LIMIT 100`;
  // PRD-204: totalUsd es Decimal en BD → convertir a number
  return rows.map(r => ({ ...r, totalUsd: d(r.totalUsd) }));
}

/** Registros elegibles para el email de 72h:
 *  - status = EMAILED_24H
 *  - emailSentAt < ahora − 48h  (es decir, 72h desde la última actividad aprox.)
 */
export async function getCartsFor72hEmail(): Promise<{
  id:       string;
  email:    string;
  items:    unknown;
  totalUsd: number;
}[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ id: string; email: string; items: unknown; totalUsd: Prisma.Decimal }>>`
    SELECT c.id, c.email, c.items, c."totalUsd" FROM "AbandonedCart" c
    WHERE c.status = 'EMAILED_24H' AND c."emailSentAt" < ${cutoff}
      AND c."lastActivityAt" < ${new Date(Date.now() - 72 * 60 * 60_000)}
      AND NOT EXISTS (SELECT 1 FROM "CartReminderPreference" p WHERE p.email = c.email AND p."optedOutAt" IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM "EmailDelivery" e
        WHERE e.kind = 'ABANDONED_72H' AND e."resourceId" = c.id
          AND e.payload->>'activityAt' = to_char(c."lastActivityAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ORDER BY c."lastActivityAt" ASC, c.id ASC LIMIT 100`;
  // PRD-204: totalUsd es Decimal en BD → convertir a number
  return rows.map(r => ({ ...r, totalUsd: d(r.totalUsd) }));
}

/** Convierte items del JSON de Prisma al tipo tipado AbandonedCartItem[].
 *  Descarta entradas malformadas para no romper la plantilla de email. */
export function parseAbandonedCartItems(raw: unknown): AbandonedCartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is AbandonedCartItem =>
      typeof i === 'object' &&
      i !== null &&
      typeof (i as AbandonedCartItem).id       === 'string' &&
      typeof (i as AbandonedCartItem).name     === 'string' &&
      typeof (i as AbandonedCartItem).price    === 'number' &&
      Number.isFinite((i as AbandonedCartItem).price) && (i as AbandonedCartItem).price >= 0 &&
      Number.isSafeInteger((i as AbandonedCartItem).quantity) && (i as AbandonedCartItem).quantity > 0,
  ).slice(0, 25);
}

/**
 * PRD-176 / PRD-181: refresca el snapshot contra el catálogo ANTES de enviar el
 * email de recuperación:
 *  - precios y nombres actuales de BD (no los del momento del abandono),
 *  - slugs actuales (un slug renombrado generaba 404 desde el correo),
 *  - descarta productos eliminados o sin stock (no se promociona lo invendible).
 * Devuelve null si no queda ningún ítem ofertable (mejor no enviar el email).
 */
export async function refreshAbandonedCartItems(
  raw: unknown,
): Promise<{ items: AbandonedCartItem[]; totalUsd: number } | null> {
  const snapshot = parseAbandonedCartItems(raw);
  if (snapshot.length === 0) return null;

  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(snapshot.map((i) => i.id))] }, isActive: true },
    select: { id: true, name: true, slug: true, price: true, stock: true, images: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const items: AbandonedCartItem[] = [];
  let totalUsd = 0;
  for (const snap of snapshot) {
    const product = productById.get(snap.id);
    if (!product || product.stock <= 0) continue;

    const quantity = Math.min(snap.quantity, product.stock);
    // PRD-204: product.price es Decimal → convertir a number
    const priceNum = d(product.price);
    items.push({
      id:       product.id,
      name:     product.name,
      slug:     product.slug?.trim() || product.id,
      price:    priceNum,
      quantity,
      image:    product.images?.[0]?.trim() || snap.image || null,
    });
    totalUsd += priceNum * quantity;
  }

  if (items.length === 0) return null;
  return { items, totalUsd: Math.round(totalUsd * 100) / 100 };
}
