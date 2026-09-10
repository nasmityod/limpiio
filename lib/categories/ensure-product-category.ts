/**
 * Get-or-create autoritativo de Category al guardar productos.
 * Product.category sigue siendo string; Category se asegura en el servidor.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/slugify';

const MAX_CATEGORY_NAME_LENGTH = 80;
const MAX_SLUG_SUFFIX_ATTEMPTS = 50;
const MAX_TX_ATTEMPTS = 3;

export class CategoryNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryNameError';
  }
}

/**
 * Normaliza el nombre de categoría para mostrar/guardar.
 * No fuerza minúsculas ni elimina acentos; colapsa espacios.
 */
export function normalizeCategoryName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/** True si el nombre normalizado es válido (1–80 chars, con letra o número). */
export function isValidNormalizedCategoryName(name: string): boolean {
  if (name.length < 1 || name.length > MAX_CATEGORY_NAME_LENGTH) return false;
  return /[\p{L}\p{N}]/u.test(name);
}

function assertValidCategoryName(normalizedName: string): void {
  if (!normalizedName || normalizedName.length < 1) {
    throw new CategoryNameError('La categoría es obligatoria');
  }
  if (normalizedName.length > MAX_CATEGORY_NAME_LENGTH) {
    throw new CategoryNameError('La categoría no puede superar 80 caracteres');
  }
  if (!/[\p{L}\p{N}]/u.test(normalizedName)) {
    throw new CategoryNameError(
      'La categoría debe contener al menos una letra o número',
    );
  }
}

export function isPrismaSerializationError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  if (error instanceof Error && 'code' in error) {
    return (error as { code?: string }).code === '40001';
  }
  return false;
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

async function resolveUniqueCategorySlug(
  tx: Prisma.TransactionClient,
  baseSlug: string,
): Promise<string> {
  let candidate = baseSlug;
  for (let n = 2; n <= MAX_SLUG_SUFFIX_ATTEMPTS + 1; n++) {
    const collision = await tx.category.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!collision) return candidate;
    candidate = `${baseSlug}-${n}`;
  }
  throw new CategoryNameError(
    'No se pudo generar un slug único para la categoría. Prueba otro nombre.',
  );
}

export type EnsuredProductCategory = {
  id: string;
  name: string;
  slug: string;
  created: boolean;
};

/**
 * Busca Category por nombre (case-insensitive) o la crea con slug único.
 * Debe ejecutarse dentro de una transacción Prisma (preferiblemente Serializable).
 *
 * Ante P2002 (carrera name/slug) la transacción de Postgres queda abortada:
 * el error se propaga para que `withSerializableCategoryTransaction` reintente
 * la operación completa; en el reintento el findFirst reutiliza la categoría
 * ya creada por el otro request (o elige el siguiente sufijo de slug).
 */
export async function ensureProductCategory(
  tx: Prisma.TransactionClient,
  rawName: string,
): Promise<EnsuredProductCategory> {
  const normalizedName = normalizeCategoryName(rawName);
  assertValidCategoryName(normalizedName);

  const existingByName = await tx.category.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (existingByName) {
    return {
      id: existingByName.id,
      name: existingByName.name,
      slug: existingByName.slug,
      created: false,
    };
  }

  const baseSlug = slugify(normalizedName);
  if (!baseSlug) {
    throw new CategoryNameError(
      'No se pudo generar un slug válido para la categoría. Usa letras o números.',
    );
  }

  const maxOrderRow = await tx.category.aggregate({ _max: { order: true } });
  const order = (maxOrderRow._max.order ?? -1) + 1;
  const uniqueSlug = await resolveUniqueCategorySlug(tx, baseSlug);

  try {
    const created = await tx.category.create({
      data: {
        name: normalizedName,
        slug: uniqueSlug,
        imageUrl: null,
        isFeatured: false,
        description: null,
        seoTitle: null,
        googleCategoryId: null,
        order,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });
    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      created: true,
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      // Intentar recuperar la categoría canónica creada por el request concurrente.
      // Si la TX ya está abortada (Postgres), la consulta puede fallar y el
      // wrapper exterior reintentará toda la transacción.
      const racedByName = await tx.category
        .findFirst({
          where: {
            name: {
              equals: normalizedName,
              mode: 'insensitive',
            },
          },
          select: { id: true, name: true, slug: true },
        })
        .catch(() => null);

      if (racedByName) {
        return {
          id: racedByName.id,
          name: racedByName.name,
          slug: racedByName.slug,
          created: false,
        };
      }
    }
    throw error;
  }
}

export type CategoryTransactionRunner = <T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
) => Promise<T>;

/**
 * Ejecuta `fn` en transacción Serializable con reintentos acotados ante
 * P2034 (serialización) y P2002 (unicidad name/slug de Category en carrera).
 *
 * `runTransaction` es inyectable para tests; por defecto usa `prisma.$transaction`.
 */
export async function withSerializableCategoryTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  runTransaction: CategoryTransactionRunner = (callback, options) =>
    prisma.$transaction(callback, options),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
    try {
      return await runTransaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      const retryable =
        isPrismaSerializationError(error) || isPrismaUniqueConstraintError(error);
      if (retryable && attempt < MAX_TX_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
