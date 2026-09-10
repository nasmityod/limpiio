/**
 * PUT/GET de configuración editorial del inicio.
 * Claves: homepage_benefits, homepage_flashdeals, homepage_shelves,
 * homepage_free_shipping.
 */
import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import {
  normalizeHomepageFreeShipping,
  normalizeHomepageShelves,
  parseHomepageFreeShippingForSave,
  parseHomepageShelvesForSave,
} from '@/lib/homepage-config';

export const HOMEPAGE_KEYS = [
  'homepage_benefits',
  'homepage_flashdeals',
  'homepage_shelves',
  'homepage_free_shipping',
] as const;
export type HomepageKey = (typeof HOMEPAGE_KEYS)[number];

const benefitItemSchema = z.object({
  title: z.string().min(1),
  sub: z.string().min(1),
});

const homepageBenefitsSchema = z.array(benefitItemSchema).min(1).max(8);

const homepageFlashDealsSchema = z.object({
  title: z.string().min(1),
  endHour: z.number().int().min(0).max(23),
});

const schemas: Partial<Record<HomepageKey, z.ZodTypeAny>> = {
  homepage_benefits: homepageBenefitsSchema,
  homepage_flashdeals: homepageFlashDealsSchema,
};

const MAX_PAYLOAD_BYTES = 100 * 1024;

export async function GET() {
  const auth = await requirePermission('SITE_CONTENT');
  if (!auth.authorized) return auth.response;

  try {
    const records = await prisma.appConfig.findMany({
      where: { key: { in: [...HOMEPAGE_KEYS] } },
    });

    const result: Record<string, unknown> = {};
    for (const key of HOMEPAGE_KEYS) {
      const row = records.find((r) => r.key === key);
      let parsed: unknown = null;
      try {
        parsed = row ? JSON.parse(row.value) : null;
      } catch {
        parsed = null;
      }

      // Normaliza en memoria para el editor; no sobrescribe AppConfig.
      if (key === 'homepage_shelves') {
        result[key] = normalizeHomepageShelves(parsed);
      } else if (key === 'homepage_free_shipping') {
        result[key] = normalizeHomepageFreeShipping(parsed);
      } else {
        result[key] = parsed;
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    logError('homepage_config_get_failed', error, {
      route: '/api/config/homepage',
    });
    return NextResponse.json(
      { error: 'Error al leer la configuración.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('SITE_CONTENT');
  if (!auth.authorized) return auth.response;

  const rawText = await request.text();
  if (rawText.length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `El payload supera el límite permitido de ${MAX_PAYLOAD_BYTES / 1024} KB.`,
      },
      { status: 413 },
    );
  }

  let body: { key: string; value: unknown };
  try {
    body = JSON.parse(rawText) as { key: string; value: unknown };
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!HOMEPAGE_KEYS.includes(body.key as HomepageKey)) {
    return NextResponse.json({ error: 'Clave no permitida.' }, { status: 400 });
  }

  const key = body.key as HomepageKey;
  let valueToStore: unknown;

  if (key === 'homepage_shelves') {
    const parsed = parseHomepageShelvesForSave(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos.', errors: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const ids = parsed.data.featuredProductIds;

    // Solo IDs *nuevos* deben existir y estar activos.
    // Los previamente guardados se conservan aunque estén inactivos/ausentes.
    const previousRow = await prisma.appConfig.findUnique({
      where: { key: 'homepage_shelves' },
      select: { value: true },
    });
    let previousIds = new Set<string>();
    if (previousRow?.value) {
      try {
        previousIds = new Set(
          normalizeHomepageShelves(JSON.parse(previousRow.value))
            .featuredProductIds,
        );
      } catch {
        previousIds = new Set();
      }
    }

    const newlyAddedIds = ids.filter((id) => !previousIds.has(id));
    if (newlyAddedIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: newlyAddedIds } },
        select: { id: true, isActive: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      const missing = newlyAddedIds.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: 'Uno o más productos destacados nuevos no existen.',
            missing,
          },
          { status: 400 },
        );
      }

      const inactive = newlyAddedIds.filter(
        (id) => byId.get(id)?.isActive !== true,
      );
      if (inactive.length > 0) {
        return NextResponse.json(
          {
            error:
              'No se pueden agregar productos inactivos a la selección destacada.',
            inactive,
          },
          { status: 400 },
        );
      }
    }

    let previousCategoryIds = new Set<string>();
    if (previousRow?.value) {
      try {
        previousCategoryIds = new Set(
          normalizeHomepageShelves(JSON.parse(previousRow.value)).categoryShelves
            .map((shelf) => shelf.categoryId),
        );
      } catch {
        previousCategoryIds = new Set();
      }
    }

    const newlyAddedCategoryIds = parsed.data.categoryShelves
      .map((shelf) => shelf.categoryId)
      .filter((id) => !previousCategoryIds.has(id));

    if (newlyAddedCategoryIds.length > 0) {
      const categories = await prisma.category.findMany({
        where: { id: { in: newlyAddedCategoryIds } },
        select: { id: true },
      });
      const found = new Set(categories.map((c) => c.id));
      const missingCategories = newlyAddedCategoryIds.filter(
        (id) => !found.has(id),
      );
      if (missingCategories.length > 0) {
        return NextResponse.json(
          {
            error: 'Una o más categorías nuevas no existen.',
            missingCategories,
          },
          { status: 400 },
        );
      }
    }

    valueToStore = parsed.data;
  } else if (key === 'homepage_free_shipping') {
    const parsed = parseHomepageFreeShippingForSave(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos.', errors: parsed.error.flatten() },
        { status: 400 },
      );
    }
    valueToStore = parsed.data;
  } else {
    const schema = schemas[key];
    if (!schema) {
      return NextResponse.json({ error: 'Clave no permitida.' }, { status: 400 });
    }
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos.', errors: parsed.error.flatten() },
        { status: 400 },
      );
    }
    valueToStore = parsed.data;
  }

  await prisma.appConfig.upsert({
    where: { key },
    update: { value: JSON.stringify(valueToStore) },
    create: { key, value: JSON.stringify(valueToStore) },
  });

  revalidatePath('/', 'layout');
  revalidateTag('homepage-config', 'default');

  return NextResponse.json({ success: true });
}
