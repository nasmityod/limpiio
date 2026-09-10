/** Cursor compuesto para paginación estable (createdAt desc, id desc). */

export type OrderListCursor = {
  createdAt: string;
  id: string;
};

export function encodeOrderCursor(row: { createdAt: Date; id: string }): string {
  const payload: OrderListCursor = {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeOrderCursor(raw: string): OrderListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as OrderListCursor;
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') {
      return parsed;
    }
  } catch {
    // cursor inválido o legado
  }
  return null;
}

/** Condición Prisma: filas estrictamente «anteriores» al cursor en el orden compuesto. */
export function orderCursorWhere(cursor: OrderListCursor): {
  OR: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }];
} {
  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ],
  };
}
