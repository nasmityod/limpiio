import { beforeEach, describe, expect, it, vi } from 'vitest';

// Evidence only: every database/storage/mail boundary is mocked. No live data writes.
const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(), permission: vi.fn(), session: vi.fn(), backoffice: vi.fn(),
  reviewCreate: vi.fn(), reviewFind: vi.fn(), reviewDelete: vi.fn(), orderFind: vi.fn(), orderUpdate: vi.fn(),
  settingsState: null as any, initialSettings: null as any,
  writes: [] as any[],
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  product: { findUnique: vi.fn(async () => ({ id: 'product-1', slug: 'product-1' })) },
  review: { findFirst: vi.fn(async () => null), create: mocks.reviewCreate,
    findUnique: mocks.reviewFind, deleteMany: mocks.reviewDelete },
  order: { findFirst: vi.fn(async () => null), findUnique: mocks.orderFind, update: mocks.orderUpdate },
  appConfig: { findUnique: vi.fn(async () => null) },
  videoJob: { updateMany: vi.fn(async () => ({ count: 0 })) },
} }));
vi.mock('next-auth/next', () => ({ getServerSession: mocks.session }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('@/lib/admin-access-server', () => ({ requirePermission: mocks.permission, requireBackofficeAction: mocks.backoffice }));
vi.mock('next/navigation', () => ({ redirect: (target: string) => { throw new Error(`redirect:${target}`); } }));
vi.mock('@/app/admin/AdminDashboardClient', () => ({ default: () => null }));
vi.mock('@/lib/security', () => ({ rejectInvalidMutationOrigin: () => null, safeZodFlatten: (x: any) => x }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => false, getClientIp: () => 'test' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/site-shell-cache', () => ({ CACHE_TAG_SITE_SHELL: 'site-shell', CACHE_TAG_SETTINGS: 'store-settings' }));
vi.mock('@/lib/safe-logger', () => ({ logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('@/lib/resend', () => ({ sendOrderCancelledEmail: vi.fn(), sendShippingEmail: vi.fn(), sendOrderDeliveredEmail: vi.fn() }));
vi.mock('@/lib/r2', async (original) => ({
  ...await original<typeof import('@/lib/r2')>(), deleteFromR2: mocks.deleteObject,
}));
vi.mock('@/lib/data-store', async (original) => ({
  ...await original<typeof import('@/lib/data-store')>(),
  readSettings: async () => structuredClone(mocks.initialSettings),
  writeSettings: async (value: any) => { mocks.writes.push(structuredClone(value)); mocks.settingsState = value; },
}));

const { POST: createReview } = await import('@/app/api/products/[id]/reviews/route');
const { DELETE: deleteReview } = await import('@/app/api/reviews/[id]/route');
const { DELETE: deleteVideo } = await import('@/app/api/upload-video/route');
const { PUT: updateGeneral } = await import('@/app/api/settings/general/route');
const { PUT: updateFinancial } = await import('@/app/api/settings/financial/route');
const { DEFAULT_SETTINGS } = await import('@/lib/data-store');
const { pickGeneralSettingsDto, pickFinancialSettingsDto } = await import('@/lib/settings-api-schemas');
const { isDeletableR2Key } = await import('@/lib/r2');
const { default: AdminPage } = await import('@/app/admin/page');
const { PUT: updateOrderStatus } = await import('@/app/api/orders/[id]/status/route');

function request(path: string, method: string, body: any) {
  return new Request(`https://store.test${path}`, { method,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.writes = [];
  mocks.session.mockResolvedValue({ user: { id: 'attacker-client', name: 'Attacker' } });
  mocks.permission.mockImplementation(async (p: string) => p === 'REVIEWS'
    ? { authorized: false, response: new Response('', { status: 403 }) }
    : { authorized: true, session: { user: { id: 'catalog-operator' } } });
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.reviewDelete.mockResolvedValue({ count: 1 });
  mocks.initialSettings = structuredClone(DEFAULT_SETTINGS);
  mocks.initialSettings.phone = '04120000000'; mocks.initialSettings.email = 'store@example.test';
  mocks.initialSettings.pagoMovil = { bank: 'Bank-A', phone: '04120000000', idNumber: 'V12345678' };
});

describe('Auditoria evidencia segura, sin BD/R2', () => {
  it.each(['En Proceso', 'Enviado', 'Entregado'])('ORDERS puede avanzar pedido web no pagado a %s', async (target) => {
    const row: any = { id: 'unpaid-order', orderNumber: 1, createdAt: new Date(), customerId: 'client',
      customerName: 'Client', customerEmail: null, customer: null, total: 100, paymentMethod: 'Pago Móvil',
      status: 'Pendiente', stockDeducted: true, channel: 'web', paidAt: null,
      shippedAt: null, deliveredAt: null, trackingNumber: null, items: [],
      shippingAddress: 'Store', shippingCity: 'City', shippingState: 'State',
      shippingZipCode: '', shippingCountry: 'Venezuela' };
    mocks.orderFind.mockResolvedValue(row);
    mocks.orderUpdate.mockImplementation(async ({ data }: any) => ({ ...row, ...data }));
    const response = await updateOrderStatus(request('/api/orders/unpaid-order/status', 'PUT', { status: target }),
      { params: Promise.resolve({ id: 'unpaid-order' }) });
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('ORDERS');
    expect(mocks.orderUpdate.mock.calls[0][0].data.status).toBe(target);
    expect(mocks.orderUpdate.mock.calls[0][0].data.paidAt).toBeUndefined();
    expect((await response.json()).paidAt).toBe(null);
  });

  it('usuario solo OPERATIONS recibe redirección de /admin a la misma /admin', async () => {
    mocks.backoffice.mockResolvedValue({ userId: 'operations-user', role: 'ADMIN', isSuperAdmin: false,
      permissions: ['OPERATIONS'] });
    await expect(AdminPage()).rejects.toThrow('redirect:/admin');
  });

  it('el DTO general rechaza los defaults oficiales y rompe la carga de settings', () => {
    expect(DEFAULT_SETTINGS.phone).toBe('');
    expect(() => pickGeneralSettingsDto(DEFAULT_SETTINGS)).toThrow();
  });

  it('el PUT acepta teléfono con espacios, persiste vacío y deja el DTO de lectura roto', async () => {
    const general = { ...pickGeneralSettingsDto(mocks.initialSettings), phone: '   ' };
    const response = await updateGeneral(request('/api/settings/general', 'PUT', general));
    expect(response.status).toBe(200);
    expect(mocks.settingsState.phone).toBe('');
    expect(() => pickGeneralSettingsDto(mocks.settingsState)).toThrow();
  });

  it('un cliente asocia foto ajena de reviews y elimina el objeto al borrar su reseña', async () => {
    const victimPhoto = 'https://cdn.vitest.example/reviews/victim.webp';
    const row: any = { id: 'own-review', productId: 'product-1', userId: 'attacker-client',
      authorName: 'Attacker', rating: 5, title: null, comment: 'Comentario valido',
      status: 'PENDING', verifiedPurchase: false, adminReply: null, photos: [victimPhoto], createdAt: new Date() };
    mocks.reviewCreate.mockImplementation(async ({ data }: any) => ({ ...row, ...data }));
    mocks.reviewFind.mockResolvedValue(row);
    const created = await createReview(request('/api/products/product-1/reviews', 'POST',
      { rating: 5, comment: 'Comentario valido', photos: [victimPhoto] }), { params: Promise.resolve({ id: 'product-1' }) });
    expect(created.status).toBe(201);
    expect(mocks.reviewCreate.mock.calls[0][0].data.photos).toEqual([victimPhoto]);
    const removed = await deleteReview(new Request('https://store.test/api/reviews/own-review', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'own-review' }) });
    expect(removed.status).toBe(200);
    expect(mocks.permission).not.toHaveBeenCalledWith('REVIEWS');
    expect(mocks.deleteObject).toHaveBeenCalledWith('reviews/victim.webp');
  });

  it.each(['banners/hero.webp', 'assets/binance-qr.webp'])('CATALOG borra %s por la ruta de videos', async (key) => {
    expect(isDeletableR2Key(key)).toBe(true);
    const response = await deleteVideo(request('/api/upload-video', 'DELETE', { url: `https://cdn.vitest.example/${key}` }));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('CATALOG');
    expect(mocks.deleteObject).toHaveBeenCalledWith(key);
  });

  it('guardado general concurrente restaura la cuenta bancaria anterior a pesar de éxito en ambas respuestas', async () => {
    const financial = { ...pickFinancialSettingsDto(mocks.initialSettings),
      pagoMovil: { bank: 'Bank-B', phone: '04129999999', idNumber: 'V99999999' } };
    const general = { ...pickGeneralSettingsDto(mocks.initialSettings), storeName: 'Nueva tienda' };
    const [a, b] = await Promise.all([
      updateFinancial(request('/api/settings/financial', 'PUT', financial)),
      updateGeneral(request('/api/settings/general', 'PUT', general)),
    ]);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(mocks.writes).toHaveLength(2);
    expect(mocks.writes[0].pagoMovil.bank).toBe('Bank-B');
    expect(mocks.settingsState.pagoMovil.bank).toBe('Bank-A');
    expect(mocks.settingsState.storeName).toBe('Nueva tienda');
  });
});
