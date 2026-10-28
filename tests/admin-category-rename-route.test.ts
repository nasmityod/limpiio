import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn(), category: { create: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    product: { updateMany: vi.fn(), count: vi.fn() }, appConfig: { updateMany: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/admin-access-server', () => ({ requirePermission: vi.fn(async () => ({ authorized: true })) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => false), getClientIp: () => 'local' }));
vi.mock('@/lib/security', () => ({ rejectInvalidMutationOrigin: () => null }));
vi.mock('@/lib/site-shell-cache', () => ({ CACHE_TAG_CATEGORIES: 'categories', CACHE_TAG_SITE_SHELL: 'site-shell' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
import { POST } from '@/app/api/categories/route';
import { PUT, DELETE } from '@/app/api/categories/[id]/route';

let name = 'Audio';
let productCategory = 'audio';
const params = { params: Promise.resolve({ id: 'cat1' }) };
const request = () => new Request('http://localhost/api/categories/cat1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Audio profesional', slug: 'audio-profesional' }) });
beforeEach(() => {
  vi.clearAllMocks(); name = 'Audio'; productCategory = 'audio';
  const category = () => ({ id: 'cat1', name, slug: 'audio', isFeatured: false, order: 3 });
  h.prisma.category.findUniqueOrThrow.mockImplementation(async () => category());
  h.prisma.category.findUnique.mockImplementation(async () => category());
  h.prisma.category.findFirst.mockResolvedValue(null);
  h.prisma.category.update.mockImplementation(async ({ data }) => { name = data.name; return { ...category(), ...data }; });
  h.prisma.product.updateMany.mockImplementation(async ({ where, data }) => {
    expect(where.category).toEqual({ equals: 'Audio', mode: 'insensitive' }); productCategory = data.category; return { count: 1 };
  });
  h.prisma.product.count.mockResolvedValue(1);
  h.prisma.$transaction.mockImplementation(async fn => {
    const old = { name, productCategory };
    try { return await fn(h.prisma); } catch (error) { name = old.name; productCategory = old.productCategory; throw error; }
  });
});
describe('category identity remains consistent during editorial mutations', () => {
  it('creation returns renderable validation text', async () => {
    const res = await POST(new Request('http://localhost/api/categories', { method: 'POST', body: JSON.stringify({ name: 'x'.repeat(81), slug: 'bad' }) }));
    const body = await res.json(); expect(res.status).toBe(400); expect(typeof body.error).toBe('string');
    expect(h.prisma.category.create).not.toHaveBeenCalled();
  });
  it('creation rejects an existing category regardless of casing', async () => {
    h.prisma.category.findFirst.mockResolvedValueOnce({ id: 'existing' });
    const res = await POST(new Request('http://localhost/api/categories', { method: 'POST', body: JSON.stringify({ name: 'audio', slug: 'audio-new' }) }));
    expect(res.status).toBe(409); expect(h.prisma.category.create).not.toHaveBeenCalled();
  });
  it('rename migrates case-insensitive product names in the same transaction', async () => {
    expect((await PUT(request(), params)).status).toBe(200);
    expect(name).toBe('Audio profesional'); expect(productCategory).toBe(name);
    expect(h.prisma.appConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'slug_redirect:audio' } }));
  });
  it('a failed product migration rolls back the category rename', async () => {
    h.prisma.product.updateMany.mockRejectedValueOnce(new Error('DB unavailable'));
    expect((await PUT(request(), params)).status).toBe(500);
    expect(name).toBe('Audio'); expect(productCategory).toBe('audio');
  });
  it('rejects case-insensitive duplicate categories', async () => {
    h.prisma.category.findFirst.mockResolvedValueOnce({ id: 'other' });
    expect((await PUT(request(), params)).status).toBe(409); expect(name).toBe('Audio');
  });
  it('delete refuses to orphan products even though category is a string', async () => {
    expect((await DELETE(new Request('http://localhost/api/categories/cat1', { method: 'DELETE' }), params)).status).toBe(409);
    expect(h.prisma.category.delete).not.toHaveBeenCalled();
  });
  it('validation error has renderable text and separate structured details', async () => {
    const bad = new Request('http://localhost/api/categories/cat1', { method: 'PUT', body: JSON.stringify({ name: 'x'.repeat(81), slug: 'bad slug' }) });
    const res = await PUT(bad, params); const body = await res.json();
    expect(res.status).toBe(400); expect(typeof body.error).toBe('string'); expect(body.errors.fieldErrors.name).toBeDefined();
  });
});
