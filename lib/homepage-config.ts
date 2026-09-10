/**
 * Configuración editorial del inicio (estanterías + franja MRW).
 * Una sola fuente de verdad para API, caché, admin y tests.
 * No persiste en lectura: la migración V2 ocurre solo al guardar.
 */
import { z } from 'zod';

export const HOME_SHELF_KEYS = ['offers', 'newest', 'featured'] as const;
export type HomeShelfKey = (typeof HOME_SHELF_KEYS)[number];

export const MAX_CATEGORY_SHELVES = 6;

export interface HomeShelfSettings {
  enabled: boolean;
  title: string;
  badge: string;
  subtitle: string;
}

/** Estantería extra en home: productos de una categoría del catálogo. */
export interface HomeCategoryShelf {
  categoryId: string;
  enabled: boolean;
  title: string;
  badge: string;
  subtitle: string;
}

export interface HomepageShelvesConfig {
  order: HomeShelfKey[];
  shelves: {
    offers: HomeShelfSettings;
    newest: HomeShelfSettings;
    featured: HomeShelfSettings;
  };
  featuredProductIds: string[];
  categoryShelves: HomeCategoryShelf[];
}

export interface HomepageFreeShippingConfig {
  enabled: boolean;
  text: string;
}

/** Forma antigua persistida en AppConfig.homepage_shelves. */
interface LegacyShelfRow {
  title?: unknown;
  badge?: unknown;
  subtitle?: unknown;
}

interface LegacyHomepageShelves {
  bestsellers?: LegacyShelfRow;
  newest?: LegacyShelfRow;
  recommended?: LegacyShelfRow;
}

export const DEFAULT_HOMEPAGE_SHELVES: HomepageShelvesConfig = {
  order: ['offers', 'newest', 'featured'],
  shelves: {
    offers: {
      enabled: true,
      title: 'Ofertas del Día',
      badge: 'Ofertas',
      subtitle: 'Precios especiales por tiempo limitado',
    },
    newest: {
      enabled: true,
      title: 'Novedades en MundoTech',
      badge: 'Recién llegados',
      subtitle: '',
    },
    featured: {
      enabled: true,
      title: 'Selección MundoTech',
      badge: 'Destacados',
      subtitle: 'Productos seleccionados por nuestro equipo',
    },
  },
  featuredProductIds: [],
  categoryShelves: [],
};

export const DEFAULT_HOMEPAGE_FREE_SHIPPING: HomepageFreeShippingConfig = {
  enabled: true,
  text: 'Envío gratis por MRW',
};

const homeShelfKeySchema = z.enum(HOME_SHELF_KEYS);

const homeShelfSettingsSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(80),
  badge: z.string().trim().max(40).default(''),
  subtitle: z.string().trim().max(160).default(''),
});

export const homepageShelvesConfigSchema = z
  .object({
    order: z.array(homeShelfKeySchema).min(1).max(3),
    shelves: z.object({
      offers: homeShelfSettingsSchema,
      newest: homeShelfSettingsSchema,
      featured: homeShelfSettingsSchema,
    }),
    featuredProductIds: z
      .array(z.string().trim().min(1).max(64))
      .max(8)
      .default([]),
    categoryShelves: z
      .array(
        z.object({
          categoryId: z.string().trim().min(1).max(64),
          enabled: z.boolean(),
          title: z.string().trim().min(1).max(80),
          badge: z.string().trim().max(40).default(''),
          subtitle: z.string().trim().max(160).default(''),
        }),
      )
      .max(MAX_CATEGORY_SHELVES)
      .default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<HomeShelfKey>();
    for (const key of data.order) {
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Clave duplicada en order: ${key}`,
          path: ['order'],
        });
        return;
      }
      seen.add(key);
    }

    const ids = new Set<string>();
    for (const id of data.featuredProductIds) {
      if (ids.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'featuredProductIds no puede contener duplicados.',
          path: ['featuredProductIds'],
        });
        return;
      }
      ids.add(id);
    }

    const catIds = new Set<string>();
    for (const [index, shelf] of data.categoryShelves.entries()) {
      if (catIds.has(shelf.categoryId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'categoryShelves no puede contener categorías duplicadas.',
          path: ['categoryShelves', index, 'categoryId'],
        });
        return;
      }
      catIds.add(shelf.categoryId);
    }
  });

export const homepageFreeShippingSchema = z
  .object({
    enabled: z.boolean(),
    text: z.string().trim().min(1).max(80),
  })
  .strict();

function asTrimmedString(value: unknown, max: number, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : fallback;
}

function asOptionalString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isLegacyHomepageShelves(raw: unknown): raw is LegacyHomepageShelves {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  if ('order' in obj || 'shelves' in obj || 'featuredProductIds' in obj) {
    return false;
  }
  return (
    'bestsellers' in obj ||
    'newest' in obj ||
    'recommended' in obj
  );
}

function isHomeShelfKey(value: unknown): value is HomeShelfKey {
  return (
    value === 'offers' || value === 'newest' || value === 'featured'
  );
}

/** Completa order con claves faltantes al final, sin duplicados ni desconocidas. */
export function normalizeShelfOrder(order: unknown): HomeShelfKey[] {
  const result: HomeShelfKey[] = [];
  const seen = new Set<HomeShelfKey>();

  if (Array.isArray(order)) {
    for (const key of order) {
      if (!isHomeShelfKey(key) || seen.has(key)) continue;
      seen.add(key);
      result.push(key);
    }
  }

  for (const key of HOME_SHELF_KEYS) {
    if (!seen.has(key)) result.push(key);
  }

  return result;
}

function normalizeFeaturedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 8) break;
  }
  return ids;
}

export function normalizeCategoryShelves(raw: unknown): HomeCategoryShelf[] {
  if (!Array.isArray(raw)) return [];
  const shelves: HomeCategoryShelf[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.categoryId !== 'string') continue;
    const categoryId = obj.categoryId.trim().slice(0, 64);
    if (!categoryId || seen.has(categoryId)) continue;
    const title = asTrimmedString(obj.title, 80, '');
    if (!title) continue;
    seen.add(categoryId);
    shelves.push({
      categoryId,
      enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
      title,
      badge: asOptionalString(obj.badge, 40),
      subtitle: asOptionalString(obj.subtitle, 160),
    });
    if (shelves.length >= MAX_CATEGORY_SHELVES) break;
  }
  return shelves;
}

function shelfFromPartial(
  raw: unknown,
  defaults: HomeShelfSettings,
): HomeShelfSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...defaults };
  }
  const obj = raw as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : defaults.enabled,
    title: asTrimmedString(obj.title, 80, defaults.title),
    badge: asOptionalString(obj.badge, 40) || defaults.badge,
    subtitle: asOptionalString(obj.subtitle, 160),
  };
}

/**
 * Normaliza cualquier JSON guardado (V2 o legacy) a HomepageShelvesConfig.
 * No escribe en AppConfig — solo transforma en memoria.
 */
export function normalizeHomepageShelves(raw: unknown): HomepageShelvesConfig {
  const defaults = DEFAULT_HOMEPAGE_SHELVES;

  if (raw == null) {
    return structuredClone(defaults);
  }

  if (isLegacyHomepageShelves(raw)) {
    const newestDefaults = defaults.shelves.newest;
    const featuredDefaults = defaults.shelves.featured;
    const recommended = raw.recommended ?? {};

    return {
      order: [...defaults.order],
      shelves: {
        offers: { ...defaults.shelves.offers },
        newest: {
          enabled: true,
          title: asTrimmedString(raw.newest?.title, 80, newestDefaults.title),
          badge: asOptionalString(raw.newest?.badge, 40) || newestDefaults.badge,
          subtitle: asOptionalString(raw.newest?.subtitle, 160),
        },
        featured: {
          enabled: true,
          title: asTrimmedString(
            recommended.title,
            80,
            featuredDefaults.title,
          ),
          badge:
            asOptionalString(recommended.badge, 40) || featuredDefaults.badge,
          subtitle: asOptionalString(
            recommended.subtitle,
            160,
          ) || featuredDefaults.subtitle,
        },
      },
      featuredProductIds: [],
      categoryShelves: [],
    };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return structuredClone(defaults);
  }

  const obj = raw as Record<string, unknown>;
  const shelvesRaw =
    obj.shelves && typeof obj.shelves === 'object' && !Array.isArray(obj.shelves)
      ? (obj.shelves as Record<string, unknown>)
      : {};

  return {
    order: normalizeShelfOrder(obj.order),
    shelves: {
      offers: shelfFromPartial(shelvesRaw.offers, defaults.shelves.offers),
      newest: shelfFromPartial(shelvesRaw.newest, defaults.shelves.newest),
      featured: shelfFromPartial(shelvesRaw.featured, defaults.shelves.featured),
    },
    featuredProductIds: normalizeFeaturedIds(obj.featuredProductIds),
    categoryShelves: normalizeCategoryShelves(obj.categoryShelves),
  };
}

export function normalizeHomepageFreeShipping(
  raw: unknown,
): HomepageFreeShippingConfig {
  const defaults = DEFAULT_HOMEPAGE_FREE_SHIPPING;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...defaults };
  }
  const obj = raw as Record<string, unknown>;
  const text =
    typeof obj.text === 'string' && obj.text.trim().length > 0
      ? obj.text.trim().slice(0, 80)
      : defaults.text;
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : defaults.enabled,
    text,
  };
}

/** Validación estricta para PUT — autoridad del servidor. */
export function parseHomepageShelvesForSave(raw: unknown): {
  success: true;
  data: HomepageShelvesConfig;
} | {
  success: false;
  error: z.ZodError;
} {
  // Legacy se normaliza en memoria; V2 se valida sin “arreglar” errores silenciosamente.
  if (isLegacyHomepageShelves(raw)) {
    const normalized = normalizeHomepageShelves(raw);
    const parsed = homepageShelvesConfigSchema.safeParse(normalized);
    if (!parsed.success) return { success: false, error: parsed.error };
    return { success: true, data: parsed.data };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: 'custom',
          message: 'Configuración de estanterías inválida.',
          path: [],
        },
      ]),
    };
  }

  const obj = raw as Record<string, unknown>;

  // Rechazar claves desconocidas en order (antes de normalizar).
  if (Array.isArray(obj.order)) {
    for (const key of obj.order) {
      if (!isHomeShelfKey(key)) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: `Clave de estantería inválida: ${String(key)}`,
              path: ['order'],
            },
          ]),
        };
      }
    }
    const seen = new Set<string>();
    for (const key of obj.order) {
      if (seen.has(String(key))) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: `Clave duplicada en order: ${String(key)}`,
              path: ['order'],
            },
          ]),
        };
      }
      seen.add(String(key));
    }
  }

  // Rechazar duplicados / exceso en featuredProductIds antes de deduplicar.
  if (Array.isArray(obj.featuredProductIds)) {
    if (obj.featuredProductIds.length > 8) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            message: 'Máximo 8 productos destacados.',
            path: ['featuredProductIds'],
          },
        ]),
      };
    }
    const seenIds = new Set<string>();
    for (const id of obj.featuredProductIds) {
      if (typeof id !== 'string' || !id.trim()) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: 'ID de producto destacado inválido.',
              path: ['featuredProductIds'],
            },
          ]),
        };
      }
      const trimmed = id.trim();
      if (seenIds.has(trimmed)) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: 'featuredProductIds no puede contener duplicados.',
              path: ['featuredProductIds'],
            },
          ]),
        };
      }
      seenIds.add(trimmed);
    }
  }

  if (Array.isArray(obj.categoryShelves)) {
    if (obj.categoryShelves.length > MAX_CATEGORY_SHELVES) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            message: `Máximo ${MAX_CATEGORY_SHELVES} estanterías por categoría.`,
            path: ['categoryShelves'],
          },
        ]),
      };
    }
    const seenCats = new Set<string>();
    for (const [index, entry] of obj.categoryShelves.entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: 'Estantería de categoría inválida.',
              path: ['categoryShelves', index],
            },
          ]),
        };
      }
      const row = entry as Record<string, unknown>;
      if (typeof row.categoryId !== 'string' || !row.categoryId.trim()) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: 'ID de categoría inválido.',
              path: ['categoryShelves', index, 'categoryId'],
            },
          ]),
        };
      }
      const catId = row.categoryId.trim();
      if (typeof row.title !== 'string' || !row.title.trim()) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: 'El título de la estantería de categoría es obligatorio.',
              path: ['categoryShelves', index, 'title'],
            },
          ]),
        };
      }
      if (seenCats.has(catId)) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              message: 'categoryShelves no puede contener categorías duplicadas.',
              path: ['categoryShelves', index, 'categoryId'],
            },
          ]),
        };
      }
      seenCats.add(catId);
    }
  }

  const candidate = {
    ...obj,
    order: normalizeShelfOrder(obj.order),
    featuredProductIds: normalizeFeaturedIds(obj.featuredProductIds),
    categoryShelves: normalizeCategoryShelves(obj.categoryShelves),
  };

  const parsed = homepageShelvesConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }
  return {
    success: true,
    data: {
      ...parsed.data,
      order: normalizeShelfOrder(parsed.data.order),
      featuredProductIds: normalizeFeaturedIds(parsed.data.featuredProductIds),
      categoryShelves: normalizeCategoryShelves(parsed.data.categoryShelves),
    },
  };
}

export function parseHomepageFreeShippingForSave(raw: unknown): {
  success: true;
  data: HomepageFreeShippingConfig;
} | {
  success: false;
  error: z.ZodError;
} {
  const parsed = homepageFreeShippingSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }
  return { success: true, data: parsed.data };
}

export const SHELF_BADGE_COLORS: Record<
  HomeShelfKey,
  'yellow' | 'blue' | 'red' | 'green'
> = {
  offers: 'red',
  newest: 'yellow',
  featured: 'blue',
};

export const SHELF_VIEW_ALL: Record<
  HomeShelfKey,
  { href: string; label: string; shortLabel: string }
> = {
  offers: {
    href: '/ofertas',
    label: 'Ver todas las ofertas',
    shortLabel: 'Ver todos',
  },
  newest: {
    href: '/productos',
    label: 'Ver todas las novedades',
    shortLabel: 'Ver todos',
  },
  featured: {
    href: '/productos',
    label: 'Ver todo el catálogo',
    shortLabel: 'Ver todos',
  },
};
