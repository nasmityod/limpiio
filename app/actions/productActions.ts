'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requirePermissionAction } from '@/lib/admin-access-server';
import { z } from 'zod';
import Papa from 'papaparse';
import { slugify } from '@/lib/slugify';
import { Prisma, ProductMediaType } from '@prisma/client';
import { deriveLegacyImagesFromSlots } from '@/lib/product-media';
import { sortMediaImagesFirst } from '@/lib/media';
import { triggerRestockNotifications } from '@/app/actions/restockActions';
import { parseProductSpecs } from '@/lib/definitions';
import { saveSlugRedirect } from '@/lib/slug-redirects';
import { d, dn } from '@/lib/decimal';
import { normalizeCsvFreeShipping, parseFreeShippingFormValue } from '@/lib/csv-free-shipping';
import { PRODUCT_CARD_SELECT, PRODUCT_ADMIN_DETAIL_SELECT } from '@/lib/product-select';
import {
  ADMIN_LOW_STOCK_THRESHOLD,
  ADMIN_PRODUCTS_PAGE_SIZE,
  queryAdminProducts,
  type AdminProductListParams,
  type AdminProductListResult,
} from '@/lib/products/admin-product-query';
import { getCachedAdminCategoryNames } from '@/lib/categories/admin-categories';
import { deleteFromR2, isR2PublicUrl, keyFromR2PublicUrl } from '@/lib/r2';
import { calcSellingPriceUsd, roundUpToStep } from '@/lib/pricing-formula';
import { getPricingParams } from '@/app/actions/configActions';
import { pingIndexNow } from '@/lib/indexnow';
import { logError } from '@/lib/safe-logger';
import { rateLimit } from '@/lib/rate-limit';
import { getActionClientIp } from '@/lib/security';
import {
  CategoryNameError,
  ensureProductCategory,
  normalizeCategoryName,
  withSerializableCategoryTransaction,
} from '@/lib/categories/ensure-product-category';
import { CACHE_TAG_CATEGORIES, CACHE_TAG_SITE_SHELL } from '@/lib/site-shell-cache';

const absoluteUrl = z.string().refine(
  (s) => {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'URL inválida' },
);

/** Slots de galería enviados desde el modal (imágenes y videos). */
const gallerySlotSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('IMAGE'), url: absoluteUrl }),
  z.object({
    type: z.literal('VIDEO'),
    url: absoluteUrl,
    posterUrl: absoluteUrl.optional(),
  }),
]);

function parseSpecsFromFormData(formData: FormData) {
  const raw = formData.get('specsJson');
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    return parseProductSpecs(JSON.parse(raw));
  } catch {
    return [];
  }
}

function parseGallerySlots(
  formData: FormData,
  imageUrls: string[],
): z.infer<typeof gallerySlotSchema>[] {
  const raw = formData.get('mediaJson');
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = z.array(gallerySlotSchema).max(6).safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.length > 0) {
        return sortMediaImagesFirst(parsed.data);
      }
    } catch {
      /* ignore */
    }
  }
  const base = imageUrls.length > 0 ? imageUrls : ['/placeholder-product.png'];
  return base.map((url) => ({ type: 'IMAGE' as const, url }));
}

const productSchema = z.object({
  name:        z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().min(1, 'La descripción es obligatoria'),
  price:       z.coerce.number().positive('El precio debe ser un número positivo'),
  cost: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().positive('El costo debe ser un número positivo').optional(),
  ),
  originalPrice: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.coerce.number().positive('El precio anterior debe ser un número positivo').nullable().optional(),
  ),
  salePrice: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().positive('El precio de oferta debe ser positivo').optional(),
  ),
  marginPct: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().min(0, 'El margen no puede ser negativo').max(1000, 'Margen fuera de rango').optional(),
  ),
  stock:       z.coerce.number().int().nonnegative('El stock debe ser un entero no negativo'),
  category: z
    .string()
    .transform(normalizeCategoryName)
    .pipe(
      z
        .string()
        .min(1, 'La categoría es obligatoria')
        .max(80, 'La categoría no puede superar 80 caracteres')
        .refine((s) => /[\p{L}\p{N}]/u.test(s), {
          message: 'La categoría debe contener al menos una letra o número',
        }),
    ),
  brand: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : 'Sin Marca'),
    z.string().min(1),
  ),
  sku: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().min(1).nullable().optional()
  ),
  /** true = elegible para envío gratis exclusivamente por MRW; false = sin beneficio MRW (default). */
  freeShipping: z.preprocess(parseFreeShippingFormValue, z.boolean()),
  // imagesJson: JSON array of URLs sent from the modal
  imagesJson: z.preprocess(
    (v) => {
      if (typeof v !== 'string' || v.trim() === '') return [];
      try { return JSON.parse(v); } catch { return []; }
    },
    z.array(z.string().url('URL de imagen inválida')).max(6).default([])
  ),
});

async function verifyAdminSession() {
  return requirePermissionAction('CATALOG');
}

async function safeDeleteR2ByUrl(url: string, context: string): Promise<void> {
  const key = keyFromR2PublicUrl(url);
  if (!key) return;
  try {
    await deleteFromR2(key);
  } catch (err) {
    logError('product_r2_delete_failed', err, { operation: context, provider: 'r2' });
  }
}

async function markVideoJobDeleted(videoUrl: string, context: string): Promise<void> {
  try {
    await prisma.videoJob.updateMany({
      where: { videoUrl },
      data: { status: 'DELETED' },
    });
  } catch (err) {
    logError('product_video_job_mark_failed', err, { operation: context });
  }
}

/** Borra de R2 los medios eliminados tras un update exitoso (best-effort). */
async function cleanupRemovedProductMedia(
  previousMedia: { type: ProductMediaType; url: string; posterUrl: string | null }[],
  previousImages: string[],
  incomingSlots: z.infer<typeof gallerySlotSchema>[],
): Promise<void> {
  const incomingUrls = new Set(incomingSlots.map((s) => s.url));

  for (const prev of previousMedia) {
    if (incomingUrls.has(prev.url)) continue;

    if (prev.type === ProductMediaType.VIDEO) {
      await safeDeleteR2ByUrl(prev.url, 'updateProductAction');
      if (prev.posterUrl) await safeDeleteR2ByUrl(prev.posterUrl, 'updateProductAction');
      await markVideoJobDeleted(prev.url, 'updateProductAction');
    } else if (isR2PublicUrl(prev.url)) {
      await safeDeleteR2ByUrl(prev.url, 'updateProductAction');
    }
  }

  const incomingImageUrls = new Set(
    incomingSlots.filter((s) => s.type === 'IMAGE').map((s) => s.url),
  );
  for (const imgUrl of previousImages) {
    if (incomingImageUrls.has(imgUrl)) continue;
    if (isR2PublicUrl(imgUrl)) {
      await safeDeleteR2ByUrl(imgUrl, 'updateProductAction');
    }
  }
}

/** Genera un slug único para un nuevo producto consultando la BD. */
async function getUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  if (!base) return `producto-${Date.now()}`;

  let candidate = base;
  let counter   = 2;

  while (true) {
    const existing = await prisma.product.findUnique({
      where:  { slug: candidate },
      select: { id: true },
    });
    // Si no existe, o el que existe es el mismo producto que estamos editando → OK
    if (!existing || existing.id === excludeId) break;
    candidate = `${base}-${counter}`;
    counter++;
  }

  return candidate;
}

/** Genera un SKU único tipo "MT-XXXXXX" verificando contra la BD. */
async function getUniqueSku(): Promise<string> {
  while (true) {
    const candidate =
      `MT-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const existing = await prisma.product.findUnique({ where: { sku: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
}

export async function createProductAction(formData: FormData) {
  try {
    await verifyAdminSession();

    const data = {
      name:        formData.get('name'),
      description: formData.get('description'),
      price:       formData.get('price'),
      cost:        formData.get('cost'),
      originalPrice: formData.get('originalPrice'),
      salePrice:   formData.get('salePrice'),
      marginPct:   formData.get('marginPct'),
      stock:       formData.get('stock'),
      category:    formData.get('category'),
      brand:       formData.get('brand'),
      sku:         formData.get('sku'),
      freeShipping: formData.get('freeShipping'),
      imagesJson:  formData.get('imagesJson'),
    };

    const validated = productSchema.safeParse(data);
    if (!validated.success) {
      return { success: false, message: validated.error.issues.map(e => e.message).join(', ') };
    }

    const { factor } = await getPricingParams();
    // El margen es SOLO el elegido para este producto. Nunca global.
    const effectiveMargin = validated.data.marginPct ?? null;
    if (validated.data.cost != null && !(typeof effectiveMargin === 'number' && effectiveMargin > 0)) {
      return { success: false, message: 'Indica el margen de ganancia (%) para calcular el precio desde el costo.' };
    }
    const normalPrice = validated.data.cost != null
      ? calcSellingPriceUsd(validated.data.cost, effectiveMargin as number, factor)
      : roundUpToStep(validated.data.price);

    // Oferta: si llega un salePrice válido y MENOR al precio normal, ese pasa a ser
    // el precio actual y el normal queda como "precio anterior" tachado.
    let finalPrice = normalPrice;
    let finalOriginalPrice: number | null = null;
    if (validated.data.salePrice != null && validated.data.salePrice < normalPrice) {
      finalPrice = roundUpToStep(validated.data.salePrice);
      finalOriginalPrice = normalPrice;
    }

    const slots  = parseGallerySlots(formData, validated.data.imagesJson);
    const images = deriveLegacyImagesFromSlots(slots);
    const specs  = parseSpecsFromFormData(formData);

    const { imagesJson: _, sku, originalPrice: _op, salePrice: _sp, marginPct: _mp, category: _cat, ...rest } = validated.data;
    const slug = await getUniqueSlug(validated.data.name);
    const finalSku = sku ?? await getUniqueSku();

    const { categoryCreated, categoryName } = await withSerializableCategoryTransaction(
      async (tx) => {
        const ensuredCategory = await ensureProductCategory(tx, validated.data.category);
        await tx.product.create({
          data: {
            ...rest,
            category: ensuredCategory.name,
            price: finalPrice,
            cost: validated.data.cost ?? null,
            profitMarginPct: validated.data.cost != null ? effectiveMargin : null,
            priceBaseFactor: factor,
            slug,
            originalPrice: finalOriginalPrice,
            sku:   finalSku,
            images,
            // Cast requerido: los interfaces TS no satisfacen InputJsonValue de Prisma
            specs: specs.length > 0 ? (specs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            media: {
              create: slots.map((s, i) => ({
                type:
                  s.type === 'VIDEO' ? ProductMediaType.VIDEO : ProductMediaType.IMAGE,
                url: s.url,
                posterUrl: s.type === 'VIDEO' ? s.posterUrl ?? null : null,
                sortOrder: i,
              })),
            },
          },
        });
        return {
          categoryCreated: ensuredCategory.created,
          categoryName: ensuredCategory.name,
        };
      },
    );

    revalidatePath('/admin/products');
    revalidatePath('/admin/categories');
    revalidatePath('/');
    revalidatePath('/productos');
    revalidatePath('/categoria/[slug]', 'page');
    revalidatePath(`/product/${slug}`);
    revalidateTag('catalog', 'default');
    revalidateTag(CACHE_TAG_CATEGORIES, 'default');
    if (categoryCreated) {
      revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    }
    // FASE 3 (SEO): notificar la ficha nueva a IndexNow (no-op sin INDEXNOW_KEY).
    void pingIndexNow([`/product/${slug}`, '/productos']);
    return {
      success: true,
      message: categoryCreated
        ? `Producto añadido y categoría "${categoryName}" creada.`
        : 'Producto añadido con éxito.',
      category: {
        name: categoryName,
        created: categoryCreated,
      },
    };
  } catch (error) {
    logError('product_create_failed', error, { operation: 'create_product' });
    if (error instanceof CategoryNameError) {
      return { success: false, message: error.message };
    }
    if (error instanceof Error && error.message.startsWith('No autorizado')) {
      return { success: false, message: 'No tienes permiso para realizar esta acción.' };
    }
    return { success: false, message: 'No se pudo crear el producto.' };
  }
}

export async function updateProductAction(productId: string, formData: FormData) {
  try {
    await verifyAdminSession();

    const data = {
      name:        formData.get('name'),
      description: formData.get('description'),
      price:       formData.get('price'),
      cost:        formData.get('cost'),
      originalPrice: formData.get('originalPrice'),
      salePrice:   formData.get('salePrice'),
      marginPct:   formData.get('marginPct'),
      stock:       formData.get('stock'),
      category:    formData.get('category'),
      brand:       formData.get('brand'),
      sku:         formData.get('sku'),
      freeShipping: formData.get('freeShipping'),
      imagesJson:  formData.get('imagesJson'),
    };

    const validated = productSchema.safeParse(data);
    if (!validated.success) {
      return { success: false, message: validated.error.issues.map(e => e.message).join(', ') };
    }

    const { factor } = await getPricingParams();
    // El margen es SOLO el elegido para este producto. Nunca global.
    const effectiveMargin = validated.data.marginPct ?? null;
    if (validated.data.cost != null && !(typeof effectiveMargin === 'number' && effectiveMargin > 0)) {
      return { success: false, message: 'Indica el margen de ganancia (%) para calcular el precio desde el costo.' };
    }
    const normalPrice = validated.data.cost != null
      ? calcSellingPriceUsd(validated.data.cost, effectiveMargin as number, factor)
      : roundUpToStep(validated.data.price);

    // Oferta: si llega un salePrice válido y MENOR al precio normal, ese pasa a ser
    // el precio actual y el normal queda como "precio anterior" tachado.
    let finalPrice = normalPrice;
    let finalOriginalPrice: number | null = null;
    if (validated.data.salePrice != null && validated.data.salePrice < normalPrice) {
      finalPrice = roundUpToStep(validated.data.salePrice);
      finalOriginalPrice = normalPrice;
    }

    const slots  = parseGallerySlots(formData, validated.data.imagesJson);
    const images = deriveLegacyImagesFromSlots(slots);
    const specs  = parseSpecsFromFormData(formData);

    // freeShipping viaja dentro de `rest` (no se excluye) — se persiste igual
    // que name/description/stock/category/brand, sin tocar ningún campo de precios.
    const { imagesJson: _, sku, originalPrice: _op, salePrice: _sp, marginPct: _mp, category: _cat, ...rest } = validated.data;

    const current = await prisma.product.findUnique({
      where:  { id: productId },
      select: {
        name: true,
        slug: true,
        sku: true,
        stock: true,
        category: true,
        images: true,
        media: { select: { type: true, url: true, posterUrl: true } },
      },
    });
    const previousStock = current?.stock ?? 0;
    const previousMedia = current?.media ?? [];
    const previousImages = current?.images ?? [];
    const previousCategory = current?.category ?? null;

    const slug = (current?.name !== validated.data.name || !current?.slug)
      ? await getUniqueSlug(validated.data.name, productId)
      : current.slug;

    const finalSku = sku ?? current?.sku ?? await getUniqueSku();

    const { categoryCreated, categoryName } = await withSerializableCategoryTransaction(
      async (tx) => {
        const ensuredCategory = await ensureProductCategory(tx, validated.data.category);
        await tx.productMedia.deleteMany({ where: { productId } });
        await tx.product.update({
          where: { id: productId },
          data: {
            ...rest,
            category: ensuredCategory.name,
            price: finalPrice,
            cost: validated.data.cost ?? null,
            profitMarginPct: validated.data.cost != null ? effectiveMargin : null,
            priceBaseFactor: factor,
            slug,
            originalPrice: finalOriginalPrice,
            sku:   finalSku,
            images,
            specs: specs.length > 0 ? (specs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            media: {
              create: slots.map((s, i) => ({
                type:
                  s.type === 'VIDEO' ? ProductMediaType.VIDEO : ProductMediaType.IMAGE,
                url: s.url,
                posterUrl: s.type === 'VIDEO' ? s.posterUrl ?? null : null,
                sortOrder: i,
              })),
            },
          },
        });
        return {
          categoryCreated: ensuredCategory.created,
          categoryName: ensuredCategory.name,
        };
      },
    );

    await cleanupRemovedProductMedia(previousMedia, previousImages, slots);

    // Notificar suscriptores si el producto pasó de agotado a disponible
    if (previousStock === 0 && validated.data.stock > 0) {
      void triggerRestockNotifications(
        productId,
        validated.data.name,
        slug,
        images[0] ?? null,
        finalPrice,
      );
    }

    // PRD-066: al renombrar el slug, registrar redirect 301 para que la URL
    // vieja (indexada o compartida) siga funcionando en la ficha de producto.
    const slugChanged = !!current?.slug && current.slug !== slug;
    if (slugChanged && current?.slug) {
      await saveSlugRedirect(current.slug, slug);
    }

    const categoryChanged =
      previousCategory == null ||
      previousCategory.toLowerCase() !== categoryName.toLowerCase();

    revalidatePath('/admin/products');
    revalidatePath('/admin/categories');
    revalidatePath('/');
    revalidatePath('/productos');
    revalidatePath('/categoria/[slug]', 'page');
    revalidatePath(`/product/${slug}`);
    if (slugChanged && current?.slug) revalidatePath(`/product/${current.slug}`);
    revalidateTag('catalog', 'default');
    if (categoryChanged || categoryCreated) {
      revalidateTag(CACHE_TAG_CATEGORIES, 'default');
    }
    if (categoryCreated) {
      revalidateTag(CACHE_TAG_SITE_SHELL, 'default');
    }
    // FASE 3 (SEO): re-indexación rápida de la ficha editada (no-op sin key).
    void pingIndexNow([`/product/${slug}`]);
    return {
      success: true,
      message: categoryCreated
        ? `Producto actualizado y categoría "${categoryName}" creada.`
        : 'Producto actualizado con éxito.',
      category: {
        name: categoryName,
        created: categoryCreated,
      },
    };
  } catch (error) {
    logError('product_update_failed', error, { operation: 'update_product' });
    if (error instanceof CategoryNameError) {
      return { success: false, message: error.message };
    }
    if (error instanceof Error && error.message.startsWith('No autorizado')) {
      return { success: false, message: 'No tienes permiso para realizar esta acción.' };
    }
    return { success: false, message: 'No se pudo actualizar el producto.' };
  }
}

export async function deleteProductAction(productId: string) {
  try {
    await verifyAdminSession();

    const current = await prisma.product.findUnique({
      where: { id: productId },
      select: { slug: true },
    });
    if (!current) {
      return { success: false, message: 'El producto ya no existe.' };
    }

    // ¿Está referenciado por algún pedido? FK RESTRICT → no se puede borrar en duro
    // y, además, romperíamos la auditoría financiera. En ese caso se despublica.
    const orderItemCount = await prisma.orderItem.count({ where: { productId } });

    // PRD-233: invalidar caches públicas ANTES de mutar (evita la página fantasma).
    if (current.slug) revalidatePath(`/product/${current.slug}`);
    revalidatePath('/productos');
    revalidatePath('/');
    revalidateTag('catalog', 'default');
    revalidateTag('categories', 'default');

    if (orderItemCount > 0) {
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });
      revalidatePath('/admin/products');
      return {
        success: true,
        softDeleted: true,
        message: `Este producto aparece en ${orderItemCount} pedido${orderItemCount !== 1 ? 's' : ''}, así que se DESPUBLICÓ (ya no se muestra en la tienda) en lugar de borrarlo, para conservar el historial de esas ventas.`,
      };
    }

    // Sin historial → borrado duro real.
    try {
      await prisma.product.delete({ where: { id: productId } });
    } catch (err) {
      // Red de seguridad: si una FK impide el borrado, despublicar en su lugar.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
        revalidatePath('/admin/products');
        return {
          success: true,
          softDeleted: true,
          message: 'El producto tiene referencias en la base de datos, así que se DESPUBLICÓ en lugar de borrarlo.',
        };
      }
      throw err;
    }

    revalidatePath('/admin/products');
    return { success: true, softDeleted: false, message: 'Producto eliminado con éxito.' };
  } catch (error) {
    logError('product_delete_failed', error, { operation: 'delete_product' });
    if (error instanceof Error && error.message.startsWith('No autorizado')) {
      return { success: false, message: 'No tienes permiso para realizar esta acción.' };
    }
    return { success: false, message: 'No se pudo eliminar el producto.' };
  }
}

export async function setProductActiveAction(productId: string, isActive: boolean) {
  try {
    await verifyAdminSession();

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isActive },
      select: { slug: true },
    });

    revalidatePath('/admin/products');
    revalidatePath('/');
    revalidatePath('/productos');
    if (updated.slug) revalidatePath(`/product/${updated.slug}`);
    revalidateTag('catalog', 'default');
    revalidateTag('categories', 'default');

    return {
      success: true,
      message: isActive
        ? 'Producto reactivado: ya vuelve a verse en la tienda.'
        : 'Producto despublicado.',
    };
  } catch (error) {
    logError('product_visibility_failed', error, { operation: 'toggle_product_visibility' });
    if (error instanceof Error && error.message.startsWith('No autorizado')) {
      return { success: false, message: 'No tienes permiso para realizar esta acción.' };
    }
    return { success: false, message: 'No se pudo actualizar la visibilidad del producto.' };
  }
}

/**
 * Catálogo PÚBLICO (lo consume ProductContext sin auth).
 * PRD-012 / PRD-104: `select` acotado a los campos que la tienda muestra —
 * sin `sku`, `specs` ni timestamps internos. El inventario completo solo se
 * obtiene vía `getProductsAdmin()` (con sesión admin).
 */
export async function getProducts(searchTerm?: string, categoryFilter?: string) {
  // SEC-01 (AUDITORIA-2026-07): Server Action pública invocable como RPC —
  // rate limit por IP contra scraping masivo del catálogo.
  const ip = await getActionClientIp();
  if (await rateLimit(`get-products:ip:${ip}`, { limit: 30, windowMs: 60_000 })) {
    return { products: [], categories: [] };
  }

  const where: Record<string, unknown> = { isActive: true };

  if (searchTerm) {
    where.name = { contains: searchTerm, mode: 'insensitive' };
  }
  if (categoryFilter) {
    where.category = categoryFilter;
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: PRODUCT_CARD_SELECT,
  });

  const categories = await prisma.product
    .findMany({ distinct: ['category'], select: { category: true } })
    .then(res => res.map(p => p.category));

  return { products, categories };
}

// ── CSV Import ──────────────────────────────────────────────────────────────
// PRD-153: round-trip completo con el export del panel — el SKU es la clave de
//          upsert (obligatorio en importación CSV; sin SKU la fila se rechaza).
// PRD-154: en productos existentes se actualizan TODOS los campos del archivo
//          (nombre, precio, stock, categoría, marca, descripción y SKU).
// PRD-155: aplicación transaccional todo-o-nada — un error revierte el import
//          completo, nunca queda inventario a medias.

/** Cabeceras aceptadas (canónicas en inglés + alias en español de exports previos). */
const CSV_HEADER_ALIASES: Record<string, string> = {
  sku: 'sku',
  name: 'name', nombre: 'name',
  brand: 'brand', marca: 'brand',
  category: 'category', categoria: 'category', 'categoría': 'category',
  price: 'price', precio: 'price', 'precio usd': 'price',
  stock: 'stock',
  description: 'description', descripcion: 'description', 'descripción': 'description',
  imageurl: 'imageUrl', imagen: 'imageUrl', 'image url': 'imageUrl',
  freeshipping: 'freeShipping',
  enviogratis: 'freeShipping', 'envío gratis': 'freeShipping', 'envio gratis': 'freeShipping',
  'envíogratis': 'freeShipping',
};

function normalizeCsvHeader(header: string): string {
  const key = header.trim().toLowerCase();
  return CSV_HEADER_ALIASES[key] ?? header.trim();
}

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const csvProductSchema = z.object({
  sku: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
    z.string()
      .min(1, 'sku es obligatorio (clave de upsert para importación CSV; exporta el inventario para obtener SKUs)')
      .max(64),
  ),
  name:  z.string().trim().min(1, 'name es obligatorio'),
  price: z.coerce.number().positive('price debe ser mayor que 0'),
  stock: z.coerce.number().int().nonnegative('stock debe ser un entero ≥ 0'),
  category:    z.preprocess(emptyToUndef, z.string().trim().min(1).default('General')),
  brand:       z.preprocess(emptyToUndef, z.string().trim().min(1).default('Sin Marca')),
  description: z.preprocess(emptyToUndef, z.string().trim().min(1).default('Sin descripción')),
  imageUrl: z.preprocess(
    emptyToUndef,
    z.string().trim()
      .refine((s) => s.startsWith('/') || /^https?:\/\//i.test(s), 'imageUrl inválida')
      .default('/placeholder-product.png'),
  ),
  /** Valor crudo (sin normalizar): la normalización ocurre en normalizeCsvFreeShipping. */
  freeShipping: z.string().optional(),
});

type CsvProductRow = z.infer<typeof csvProductSchema>;

/** Slug único que además evita duplicados dentro del mismo archivo importado. */
async function getUniqueSlugForImport(
  name: string,
  taken: Set<string>,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name) || `producto-${Date.now()}`;
  let candidate = base;
  let counter = 2;
  while (true) {
    if (!taken.has(candidate)) {
      const existing = await prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) break;
    }
    candidate = `${base}-${counter}`;
    counter++;
  }
  taken.add(candidate);
  return candidate;
}

export async function importProductsFromCSV(csvData: string) {
  await verifyAdminSession();

  const parsed = Papa.parse<Record<string, string>>(csvData, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeCsvHeader,
  });

  const rows: { data: CsvProductRow; lineNo: number; freeShipping: boolean | undefined }[] = [];
  const errors: string[] = [];
  // PRD-153/freeShipping: ausente en TODO el archivo → no tocar el valor
  // actual de productos existentes al actualizar (solo `false` para nuevos).
  const freeShippingColumnPresent = (parsed.meta.fields ?? []).includes('freeShipping');

  parsed.data.forEach((raw, idx) => {
    const lineNo = idx + 2; // +1 por la cabecera, +1 por índice base 0
    const validation = csvProductSchema.safeParse(raw);
    if (!validation.success) {
      const detail = validation.error.issues
        .map((i) => `${i.path.join('.') || 'fila'}: ${i.message}`)
        .join('; ');
      const label = (raw?.name ?? '').toString().trim().slice(0, 40) || 'sin nombre';
      errors.push(`Fila ${lineNo} («${label}»): ${detail}`);
      return;
    }
    const fsResult = normalizeCsvFreeShipping(validation.data.freeShipping);
    if (!fsResult.ok) {
      const label = (raw?.name ?? '').toString().trim().slice(0, 40) || 'sin nombre';
      errors.push(
        `Fila ${lineNo} («${label}»): freeShipping tiene un valor desconocido ` +
          `("${validation.data.freeShipping}"). Usa true/false/1/0/sí/no/yes/on, o déjalo vacío.`,
      );
      return;
    }
    rows.push({ data: validation.data, lineNo, freeShipping: fsResult.value });
  });

  // Duplicados de SKU dentro del archivo → upsert ambiguo, se rechaza con detalle
  const seenSkus = new Map<string, number>();
  for (const { data, lineNo } of rows) {
    const key = data.sku.toLowerCase();
    const prev = seenSkus.get(key);
    if (prev) errors.push(`Fila ${lineNo}: SKU «${data.sku}» duplicado en el archivo (ya aparece en la fila ${prev}).`);
    else seenSkus.set(key, lineNo);
  }

  if (rows.length === 0) {
    errors.push('El archivo no contiene filas válidas. Cabeceras esperadas: sku (obligatorio), name, brand, category, price, stock, description, imageUrl.');
  }

  // PRD-155: con errores de validación no se toca la BD (todo-o-nada)
  if (errors.length > 0) {
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errors,
      message: `Importación cancelada: ${errors.length} error(es) en el archivo. No se modificó ningún producto.`,
    };
  }

  let createdCount = 0;
  let updatedCount = 0;
  const restockPlans: {
    id: string;
    name: string;
    slug: string;
    previousImage: string | null;
    price: number;
  }[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        // Matching dentro de la tx: lecturas consistentes con los upserts (idempotente ante carreras)
        const skus = rows.map((r) => r.data.sku);
        const bySkuList = await tx.product.findMany({
          where: { sku: { in: skus } },
          select: { id: true, sku: true, slug: true, name: true, stock: true, images: true },
        });
        const bySku = new Map(bySkuList.map((p) => [p.sku!.toLowerCase(), p]));

        const usedSlugs = new Set<string>();

        for (const { data, freeShipping } of rows) {
          const existing = bySku.get(data.sku.toLowerCase());
          // El slug existente se conserva (estabilidad de URL); solo se genera si faltaba
          const slug = existing?.slug
            || (await getUniqueSlugForImport(data.name, usedSlugs, existing?.id));

          const { name, price, stock, category, brand, description, sku, imageUrl } = data;

          await tx.product.upsert({
            where: { sku },
            update: {
              name, price, stock, category, brand, description, slug,
              // Columna ausente en TODO el archivo → no tocar el valor actual.
              // Columna presente → se actualiza con el valor validado de la fila.
              ...(freeShippingColumnPresent ? { freeShipping: freeShipping ?? false } : {}),
              // La galería (images/media) no se toca en updates: se gestiona en el modal
            },
            create: {
              name, price, stock, category, brand, description, sku, slug,
              // Producto nuevo sin columna → false (predeterminado).
              freeShipping: freeShipping ?? false,
              images: [imageUrl],
              media: {
                create: [{ type: ProductMediaType.IMAGE, url: imageUrl, sortOrder: 0 }],
              },
            },
          });

          if (existing) {
            updatedCount++;
            if (existing.stock === 0 && stock > 0) {
              restockPlans.push({
                id: existing.id,
                name,
                slug,
                previousImage: existing.images[0] ?? null,
                price,
              });
            }
          } else {
            createdCount++;
          }
        }
      },
      { timeout: 60_000 },
    );
  } catch (dbError) {
    logError('product_csv_import_failed', dbError, { operation: 'import_products_csv' });
    return {
      success: false,
      createdCount: 0,
      updatedCount: 0,
      errors: [`Error de base de datos: ${(dbError as Error).message}`],
      message: 'Importación revertida por un error de base de datos. No se modificó ningún producto.',
    };
  }

  // Igual que quickUpdateStockAction: avisar a suscriptores si pasó de agotado a disponible
  for (const plan of restockPlans) {
    void triggerRestockNotifications(
      plan.id,
      plan.name,
      plan.slug,
      plan.previousImage,
      plan.price,
    );
  }

  revalidatePath('/admin/products');
  revalidatePath('/');
  revalidateTag('catalog', 'default');
  revalidateTag('categories', 'default'); // category product counts in sidebar

  return {
    success: true,
    createdCount,
    updatedCount,
    errors: [],
    message: `Importación completada. Creados: ${createdCount} · Actualizados: ${updatedCount}.`,
  };
}

// ── Edición rápida desde la tabla de inventario ─────────────────────────────

export async function quickUpdateStockAction(productId: string, stock: number) {
  try {
    await verifyAdminSession();
    if (!Number.isInteger(stock) || stock < 0) {
      return { success: false, message: 'Stock debe ser un entero ≥ 0.' };
    }

    const current = await prisma.product.findUnique({
      where:  { id: productId },
      select: { stock: true, name: true, slug: true, images: true, price: true },
    });
    const previousStock = current?.stock ?? 0;

    await prisma.product.update({ where: { id: productId }, data: { stock } });

    // Notificar suscriptores si el producto pasó de agotado a disponible
    if (previousStock === 0 && stock > 0 && current) {
      void triggerRestockNotifications(
        productId,
        current.name,
        current.slug,
        current.images[0] ?? null,
        d(current.price),
      );
    }

    revalidatePath('/admin/products');
    revalidatePath('/');
    // PRD-024: sin esto, la ficha del producto y el catálogo (ISR) siguen
    // mostrando el stock anterior hasta 1 hora.
    revalidatePath(`/product/${current?.slug?.trim() || productId}`);
    revalidatePath('/productos');
    revalidateTag('catalog', 'default');
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No autorizado')) {
      return { success: false, message: 'No autorizado.' };
    }
    // RUN-08: sin log, un fallo de Prisma en producción es indiagnosticable.
    logError('product_stock_update_failed', error, { operation: 'quick_update_stock' });
    return { success: false, message: 'Error al actualizar stock.' };
  }
}

export async function quickUpdatePriceAction(productId: string, price: number) {
  try {
    await verifyAdminSession();
    if (typeof price !== 'number' || isNaN(price) || price < 0) {
      return { success: false, message: 'Precio inválido.' };
    }
    const safePrice = roundUpToStep(price);
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { price: safePrice },
      select: { slug: true },
    });
    revalidatePath('/admin/products');
    revalidatePath('/');
    // PRD-024: invalidar la ficha y el catálogo para no vender al precio viejo
    // durante la ventana de ISR.
    revalidatePath(`/product/${updated.slug?.trim() || productId}`);
    revalidatePath('/productos');
    revalidateTag('catalog', 'default');
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No autorizado')) {
      return { success: false, message: 'No autorizado.' };
    }
    logError('product_price_update_failed', error, { operation: 'quick_update_price' });
    return { success: false, message: 'Error al actualizar precio.' };
  }
}

/**
 * Una página del inventario admin.
 *
 * ANTES (auditoría de rendimiento, RC-01/RC-02/RC-04): esta acción hacía
 * `findMany` sin `take` con `PRODUCT_ADMIN_SELECT` (descripción, specs, coste,
 * margen y media de TODOS los productos) y, además, resolvía las categorías con
 * dos consultas extra en CADA llamada — es decir, en cada pulsación del buscador
 * con debounce y tras cada guardado.
 *
 * AHORA: paginación keyset (cursor) con un DTO de fila, y las categorías se
 * piden por separado vía `getAdminProductCategories()` (cacheada por tag).
 */
export async function getProductsAdmin(
  params: AdminProductListParams,
): Promise<AdminProductListResult> {
  // Las Server Actions son endpoints invocables directamente: la protección
  // del layout /admin NO aplica aquí. Sin este check, cualquiera podía
  // descargar el inventario completo (sku, specs, timestamps).
  await verifyAdminSession();

  return queryAdminProducts({
    ...params,
    lowThreshold: params.lowThreshold ?? ADMIN_LOW_STOCK_THRESHOLD,
    pageSize: params.pageSize ?? ADMIN_PRODUCTS_PAGE_SIZE,
  });
}

/**
 * Categorías para los selectores del panel (filtro del inventario y combobox
 * del modal). Cacheada e invalidada por el tag `categories`, que ya disparan
 * todas las mutaciones de producto/categoría: dejan de recalcularse en cada
 * búsqueda del inventario.
 */
export async function getAdminProductCategories(): Promise<string[]> {
  await verifyAdminSession();
  return getCachedAdminCategoryNames();
}

/** Producto completo para el modal de edición (`media` incluida y ordenada). */
export type AdminProductDetail = NonNullable<Awaited<ReturnType<typeof getAdminProductById>>>;

/**
 * Detalle completo de UN producto. Sustituye al antiguo modelo en el que el
 * listado ya traía todos los campos de edición de todos los productos.
 */
export async function getAdminProductById(productId: string) {
  await verifyAdminSession();

  if (typeof productId !== 'string' || productId.length === 0 || productId.length > 128) {
    return null;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: PRODUCT_ADMIN_DETAIL_SELECT,
  });

  if (!product) return null;

  // PRD-204: normalizar Decimal → number en la frontera servidor→cliente.
  return {
    ...product,
    price: d(product.price),
    originalPrice: dn(product.originalPrice),
    cost: dn(product.cost),
    profitMarginPct: dn(product.profitMarginPct),
    createdAt: product.createdAt.toISOString(),
    media: product.media.map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      posterUrl: m.posterUrl,
      sortOrder: m.sortOrder,
    })),
  };
}

/**
 * Recalcula el precio de TODOS los productos usando el factor actual.
 * Con costo: costo × (1 + margenGuardado/100) × factor. Sin costo (precio manual):
 * escala por razón de tasas (factor / priceBaseFactor). Ofertas conservan su % de descuento.
 */
/** Filas por sentencia en el recálculo masivo de precios. */
const RECALC_BATCH_SIZE = 500;

export async function recalculateAllProductPrices() {
  try {
    await verifyAdminSession();
    const { factor } = await getPricingParams();

    const products = await prisma.product.findMany({
      select: {
        id: true,
        price: true,
        originalPrice: true,
        cost: true,
        profitMarginPct: true,
        priceBaseFactor: true,
      },
    });

    let updated = 0;
    let skipped = 0;

    // RUN-04 (AUDITORIA-2026-07): las escrituras se aplican en UNA transacción —
    // un fallo a mitad del bucle dejaba el catálogo con precios mixtos (parte
    // reescalada, parte vieja) y priceBaseFactor inconsistente.
    //
    // Auditoría de rendimiento (RC-11): antes se acumulaba UN `prisma.product.update`
    // por producto y se pasaban todos a `prisma.$transaction([...])`. Con 10 000
    // productos eso son 10 000 sentencias en una sola transacción: agota el
    // timeout por defecto de Prisma y mantiene bloqueadas las filas durante todo
    // el proceso. Ahora se agrupan en sentencias `UPDATE … FROM (VALUES …)` por
    // lotes, dentro de la misma transacción: mismo resultado y misma atomicidad
    // con dos órdenes de magnitud menos de round-trips.
    const priceWrites: { id: string; price: number; originalPrice: number | null }[] = [];
    const calibrateOnlyIds: string[] = [];

    for (const p of products) {
      const curPrice = Number(p.price);
      const curOriginal = p.originalPrice != null ? Number(p.originalPrice) : null;
      const onOffer = curOriginal != null && curOriginal > curPrice && curPrice > 0;
      const curNormal = onOffer ? (curOriginal as number) : curPrice;

      let newNormal: number | null = null;

      if (p.cost != null && Number(p.cost) > 0 && p.profitMarginPct != null) {
        newNormal = calcSellingPriceUsd(Number(p.cost), Number(p.profitMarginPct), factor);
      } else if (p.cost == null && curNormal > 0) {
        const base = p.priceBaseFactor != null ? Number(p.priceBaseFactor) : null;
        if (base != null && base > 0) {
          newNormal = roundUpToStep(curNormal * (factor / base));
        } else {
          calibrateOnlyIds.push(p.id);
          skipped++;
          continue;
        }
      } else {
        skipped++;
        continue;
      }

      if (newNormal == null || newNormal <= 0) { skipped++; continue; }

      let newPrice = newNormal;
      let newOriginal: number | null = null;
      if (onOffer) {
        const discountFrac = 1 - curPrice / (curOriginal as number);
        newPrice = roundUpToStep(newNormal * (1 - discountFrac));
        newOriginal = newNormal;
      }

      priceWrites.push({ id: p.id, price: newPrice, originalPrice: newOriginal });
      updated++;
    }

    if (priceWrites.length > 0 || calibrateOnlyIds.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          for (let i = 0; i < priceWrites.length; i += RECALC_BATCH_SIZE) {
            const batch = priceWrites.slice(i, i + RECALC_BATCH_SIZE);
            const values = Prisma.join(
              batch.map(
                (w) =>
                  Prisma.sql`(${w.id}::text, ${w.price}::numeric(12,2), ${w.originalPrice}::numeric(12,2))`,
              ),
            );
            await tx.$executeRaw(Prisma.sql`
              UPDATE "Product" AS p
              SET price = v.price,
                  "originalPrice" = v.original_price,
                  "priceBaseFactor" = ${factor}::numeric(6,2),
                  "updatedAt" = NOW()
              FROM (VALUES ${values}) AS v(id, price, original_price)
              WHERE p.id = v.id
            `);
          }

          for (let i = 0; i < calibrateOnlyIds.length; i += RECALC_BATCH_SIZE) {
            const batch = calibrateOnlyIds.slice(i, i + RECALC_BATCH_SIZE);
            await tx.product.updateMany({
              where: { id: { in: batch } },
              data: { priceBaseFactor: factor },
            });
          }
        },
        // Recalcular el catálogo entero es una operación explícitamente masiva:
        // el timeout por defecto de Prisma (5 s) no da para miles de filas.
        { timeout: 120_000, maxWait: 15_000 },
      );
    }

    revalidatePath('/admin/products');
    revalidatePath('/');
    revalidatePath('/productos');
    revalidateTag('catalog', 'default');
    revalidateTag('categories', 'default');

    return {
      success: true,
      updated,
      skipped,
      total: products.length,
      message: `Listo: ${updated} producto(s) actualizado(s)${skipped ? `, ${skipped} omitido(s)/calibrado(s)` : ''}.`,
    };
  } catch (error) {
    logError('product_recalculate_prices_failed', error, { operation: 'recalculate_prices' });
    if (error instanceof Error && error.message.startsWith('No autorizado')) {
      return { success: false, message: 'No tienes permiso para realizar esta acción.' };
    }
    return { success: false, message: 'No se pudieron recalcular los precios.' };
  }
}
