/**
 * PRD-204: helpers de conversión Prisma.Decimal → number.
 *
 * Las columnas monetarias en BD usan DECIMAL(12,2) para evitar errores de
 * redondeo binario (Float). Prisma devuelve objetos Decimal (decimal.js) que
 * no son directamente asignables a `number`. Estos helpers convierten en la
 * frontera BD→aplicación; toda la lógica interna sigue usando `number`.
 */
import { Prisma } from '@prisma/client';

type DecimalLike =
  | Prisma.Decimal
  | { toNumber(): number }
  | number
  | string
  | null
  | undefined;

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n);
}

function toNumberSafe(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return isFiniteNumber(val) ? val : null;
  if (typeof val === 'string') {
    const n = Number(val);
    return isFiniteNumber(n) ? n : null;
  }
  if (typeof val === 'object' && val !== null && typeof (val as { toNumber?: unknown }).toNumber === 'function') {
    const n = (val as { toNumber(): number }).toNumber();
    return isFiniteNumber(n) ? n : null;
  }
  const n = Number(String(val));
  return isFiniteNumber(n) ? n : null;
}

/** Convierte un Decimal de Prisma a number. Null/undefined → 0. */
export function d(val: DecimalLike): number {
  return toNumberSafe(val) ?? 0;
}

/** Convierte un Decimal nullable de Prisma a number | null. */
export function dn(val: DecimalLike): number | null {
  return toNumberSafe(val);
}
