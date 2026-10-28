import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  prisma: { review: { findFirst: vi.fn() }, category: { findFirst: vi.fn() }, banner: { findFirst: vi.fn() }, promotion: { findFirst: vi.fn() }, product: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    productMedia: { deleteMany: vi.fn(), findFirst: vi.fn() }, orderItem: { findFirst: vi.fn() },
    videoJob: { findFirst: vi.fn(), updateMany: vi.fn() }, appConfig: { findFirst: vi.fn(), upsert: vi.fn() },
    $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn() },
  permission: vi.fn(), pricing: vi.fn(), ensureCategory: vi.fn(), deleteR2: vi.fn(),
}));
vi.mock('@/lib/site-shell-cache', () => ({ CACHE_TAG_CATEGORIES: 'categories', CACHE_TAG_SITE_SHELL: 'site-shell' }));
vi.mock('@/lib/categories/admin-categories', () => ({ getCachedAdminCategoryNames: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/admin-access-server', () => ({ requirePermissionAction: h.permission }));
vi.mock('@/app/actions/configActions', () => ({ getPricingParams: h.pricing }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/app/actions/restockActions', () => ({ triggerRestockNotifications: vi.fn() }));
vi.mock('@/lib/slug-redirects', () => ({ saveSlugRedirect: vi.fn() }));
vi.mock('@/lib/indexnow', () => ({ pingIndexNow: vi.fn() }));
vi.mock('@/lib/r2', () => ({ deleteFromR2: h.deleteR2, isR2PublicUrl: (url: string) => url.startsWith('https://cdn.vitest.example/'),
  keyFromR2PublicUrl: (url: string) => url.startsWith('https://cdn.vitest.example/') ? new URL(url).pathname.slice(1) : null }));
vi.mock('@/lib/categories/ensure-product-category', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/categories/ensure-product-category');
  return { ...actual, ensureProductCategory: h.ensureCategory,
    withSerializableCategoryTransaction: (fn: unknown) => h.prisma.$transaction(fn) };
});

import { importProductsFromCSV, updateProductAction, quickUpdateStockAction, quickUpdatePriceAction, recalculateAllProductPrices } from '@/app/actions/productActions';

const oldVersion = new Date('2026-10-04T10:00:00.000Z');
type ProductState = { id: string; sku: string; name: string; slug: string; stock: number; category: string; images: string[];
  media: { type: 'IMAGE'; url: string; posterUrl: null }[]; updatedAt: Date;
  price: number; originalPrice: number | null; cost: number | null; profitMarginPct: number | null; priceBaseFactor: number };
let state: ProductState;

function form(version = oldVersion.toISOString()) {
  const f = new FormData();
  Object.entries({ expectedUpdatedAt: version, name: 'Producto', description: 'Texto editado', price: '100', stock: '3',
    category: 'Audio', brand: 'Marca', cost: '', marginPct: '', originalPrice: '', salePrice: '', sku: 'SKU1',
    imagesJson: JSON.stringify(['/placeholder-product.png']), mediaJson: '[]' }).forEach(([k, v]) => f.set(k, v));
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  state = { id: 'p1', sku: 'SKU1', name: 'Producto', slug: 'producto', stock: 3, category: 'Audio', images: ['/placeholder-product.png'],
    media: [], updatedAt: oldVersion, price: 100, originalPrice: null, cost: null, profitMarginPct: null, priceBaseFactor: 1.23 };
  h.permission.mockResolvedValue({}); h.pricing.mockResolvedValue({ factor: 1.23, marginPct: 80 });
  h.ensureCategory.mockImplementation(async (_tx, name) => ({ name, created: true }));
  h.prisma.$transaction.mockImplementation(async fn => {
    const snapshot = { ...state };
    try { return await fn(h.prisma); } catch (error) { state = snapshot; throw error; }
  });
  h.prisma.$queryRaw.mockResolvedValue([]);
  h.prisma.appConfig.findFirst.mockResolvedValue(null);
  h.prisma.product.findUnique.mockResolvedValue(state);
  h.prisma.product.findMany.mockImplementation(async () => [{ ...state }]);
  h.prisma.product.findFirst.mockResolvedValue(null);
  h.prisma.productMedia.findFirst.mockResolvedValue(null);
  h.prisma.orderItem.findFirst.mockResolvedValue(null);
  h.prisma.videoJob.findFirst.mockResolvedValue(null);
  h.prisma.product.update.mockImplementation(async ({ where, data }) => {
    if (where.updatedAt && +where.updatedAt !== +state.updatedAt) throw new Prisma.PrismaClientKnownRequestError('stale', { code: 'P2025', clientVersion: 'test' });
    state = { ...state, ...data }; return state;
  });
  h.prisma.product.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.stock !== undefined && where.stock !== state.stock) return { count: 0 };
    state = { ...state, ...data }; return { count: 1 };
  });
  h.prisma.product.upsert.mockImplementation(async ({ update }) => { state = { ...state, ...update }; return state; });
  h.prisma.$executeRaw.mockImplementation(async (sql: Prisma.Sql) => {
    if (Array.isArray(sql)) return 1;
    const [factor, ...writes] = sql.values;
    for (let i = 0; i < writes.length; i += 3) {
      if (writes[i] === state.id) state = { ...state, priceBaseFactor: Number(factor), price: Number(writes[i + 1]), originalPrice: writes[i + 2] == null ? null : Number(writes[i + 2]) };
    }
    return 1;
  });
});

describe('catalog edit and future price integrity', () => {
  it('a description edit opened before a sale cannot restore the consumed stock', async () => {
    state.stock = 2; state.updatedAt = new Date(+oldVersion + 1000);
    const result = await updateProductAction(state.id, form());
    expect(result.success).toBe(false); expect(result.message).toContain('cambió'); expect(state.stock).toBe(2);
  });
  it('internal placeholder permits saving a product without photos', async () => {
    expect((await updateProductAction(state.id, form())).success).toBe(true);
    expect(state.images).toEqual(['/placeholder-product.png']);
  });
  it('invalid gallery URL is rejected rather than silently replaced', async () => {
    const f = form(); f.set('mediaJson', JSON.stringify([{ type: 'IMAGE', url: 'https://external.example/img.jpg' }]));
    expect((await updateProductAction(state.id, f)).success).toBe(false);
    expect(h.prisma.product.update).not.toHaveBeenCalled();
  });
  it('inline absolute stock edits compare the original stock', async () => {
    state.stock = 2;
    const result = await quickUpdateStockAction(state.id, 5, 3);
    expect(result.success).toBe(false); expect(state.stock).toBe(2);
  });
  it('quick price is an explicit manual price with a current base', async () => {
    state.cost = 20; state.profitMarginPct = 50; state.originalPrice = 200; state.priceBaseFactor = 1.5;
    expect((await quickUpdatePriceAction(state.id, 100)).success).toBe(true);
    expect(state).toMatchObject({ price: 100, cost: null, profitMarginPct: null, originalPrice: null, priceBaseFactor: 1.23 });
  });
  it('CSV category is assured and manual price metadata is coherent', async () => {
    state.cost = 20; state.profitMarginPct = 50; state.priceBaseFactor = 1.5;
    const result = await importProductsFromCSV('sku,name,price,stock,category\nSKU1,Producto,100,3,Audio profesional');
    expect(result.success).toBe(true);
    expect(h.ensureCategory).toHaveBeenCalledWith(h.prisma, 'Audio profesional');
    expect(state).toMatchObject({ category: 'Audio profesional', cost: null, profitMarginPct: null, priceBaseFactor: 1.23 });
  });
  it('CSV without optional columns preserves the existing category and text', async () => {
    Object.assign(state, { brand: 'Marca original', description: 'Descripción original' });
    expect((await importProductsFromCSV('sku,name,price,stock\nSKU1,Producto,100,3')).success).toBe(true);
    expect(state).toMatchObject({ category: 'Audio', brand: 'Marca original', description: 'Descripción original' });
  });
  it('a zero profit margin is a valid explicit product margin', async () => {
    const f = form(); f.set('cost', '10'); f.set('marginPct', '0');
    expect((await updateProductAction(state.id, f)).success).toBe(true);
    expect(state).toMatchObject({ price: 12.3, profitMarginPct: 0 });
  });
  it('consecutive recalculations with the same factor preserve the price', async () => {
    state.priceBaseFactor = 1.5; h.pricing.mockResolvedValue({ factor: 2, marginPct: 80 });
    expect((await recalculateAllProductPrices()).success).toBe(true);
    const first = state.price;
    expect(first).toBe(133.35);
    expect((await recalculateAllProductPrices()).success).toBe(true);
    expect(state.price).toBe(first);
    expect(h.permission).toHaveBeenCalledWith('FINANCIAL_SETTINGS');
    expect(h.prisma.$queryRaw).toHaveBeenCalled();
  });
  it('removing an asset still used by another product never deletes the R2 object', async () => {
    state.images = ['https://cdn.vitest.example/shared.jpg'];
    state.media = [{ type: 'IMAGE', url: state.images[0], posterUrl: null }];
    h.prisma.product.findFirst.mockResolvedValue({ id: 'other-product' });
    expect((await updateProductAction(state.id, form())).success).toBe(true);
    expect(h.deleteR2).not.toHaveBeenCalled();
  });
});
