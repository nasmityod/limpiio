import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { AbandonedCartItem, AbandonedCartStatus } from '@/lib/definitions';
import { d } from '@/lib/decimal';
import { logError } from '@/lib/safe-logger';

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
    const existing = await prisma.abandonedCart.findFirst({
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
      await prisma.abandonedCart.update({
        where: { id: existing.id },
        data: {
          items:          items as object[],
          totalUsd,
          lastActivityAt: new Date(),
          userId:         userId ?? existing.userId,
        },
      });
    } else {
      await prisma.abandonedCart.create({
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
export async function markCartOptedOut(recoveryToken: string): Promise<void> {
  if (!recoveryToken.trim()) return;
  try {
    await prisma.abandonedCart.updateMany({
      where:  { recoveryTokenHash: hashRecoveryToken(recoveryToken.trim()) },
      data:   { status: 'OPTED_OUT' satisfies AbandonedCartStatus },
    });
  } catch (err) {
    logError('abandoned_cart_opted_out_failed', err, { operation: 'mark_cart_opted_out' });
  }
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
    return await prisma.abandonedCart.findUnique({
      where:  { recoveryTokenHash: hashRecoveryToken(recoveryToken.trim()) },
      select: { id: true, email: true, items: true, status: true },
    });
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
  const rows = await prisma.abandonedCart.findMany({
    where: {
      status:          'PENDING',
      lastActivityAt:  { lt: cutoff },
    },
    select: { id: true, email: true, items: true, totalUsd: true },
  });
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
  const rows = await prisma.abandonedCart.findMany({
    where: {
      status:      'EMAILED_24H',
      emailSentAt: { lt: cutoff },
    },
    select: { id: true, email: true, items: true, totalUsd: true },
  });
  // PRD-204: totalUsd es Decimal en BD → convertir a number
  return rows.map(r => ({ ...r, totalUsd: d(r.totalUsd) }));
}

export type MarkCartEmailedResult =
  | { claimed: true; recoveryToken: string }
  | { claimed: false };

/** Reclama el carrito para email (updateMany con guard de estado), rota el token
 *  y devuelve si esta ejecución lo reclamó — ANTES de enviar el email (PRD-211).
 *
 *  - expectedStatus 'PENDING'     → nuevo estado EMAILED_24H (oleada 24h).
 *  - expectedStatus 'EMAILED_24H' → nuevo estado EMAILED_72H (oleada 72h).
 *
 *  Si el carrito pasó a RECOVERED/OPTED_OUT o otra corrida ya lo reclamó,
 *  count !== 1 y el llamador no debe enviar correo. */
export async function markCartEmailedAndRotateToken(
  cartId: string,
  expectedStatus: 'PENDING' | 'EMAILED_24H',
): Promise<MarkCartEmailedResult> {
  const newStatus: AbandonedCartStatus =
    expectedStatus === 'PENDING' ? 'EMAILED_24H' : 'EMAILED_72H';
  const { token, hash } = generateRecoveryToken();
  const res = await prisma.abandonedCart.updateMany({
    where: { id: cartId, status: expectedStatus },
    data: {
      status:            newStatus,
      emailSentAt:       new Date(),
      recoveryTokenHash: hash,
    },
  });
  if (res.count === 1) {
    return { claimed: true, recoveryToken: token };
  }
  return { claimed: false };
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
      typeof (i as AbandonedCartItem).quantity === 'number',
  );
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
    where: { id: { in: [...new Set(snapshot.map((i) => i.id))] } },
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
