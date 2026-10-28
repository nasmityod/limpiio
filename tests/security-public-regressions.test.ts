import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  userFind: vi.fn(), userUpsert: vi.fn(), session: vi.fn(), permission: vi.fn(),
  videoFind: vi.fn(), videoUpdate: vi.fn(), videoUpdateMany: vi.fn(), configUpsert: vi.fn(),
  deleteR2: vi.fn(), reviewCount: vi.fn(), referenceCount: vi.fn(),
  photoFind: vi.fn(), photoUpdate: vi.fn(), configUpdate: vi.fn(),
}));
const tx = {
  $executeRaw: vi.fn(), videoJob: { findFirst: m.videoFind, findUnique: m.videoFind, update: m.videoUpdate, updateMany: m.videoUpdateMany },
  appConfig: { upsert: m.configUpsert, findFirst: m.referenceCount, update: m.configUpdate }, product: { findFirst: m.referenceCount },
  productMedia: { findFirst: m.referenceCount }, orderItem: { findFirst: m.referenceCount },
  category: { findFirst: m.referenceCount }, banner: { findFirst: m.referenceCount }, promotion: { findFirst: m.referenceCount },
  review: { findFirst: m.referenceCount, count: m.reviewCount },
  reviewPhotoUpload: { findUnique: m.photoFind, update: m.photoUpdate },
};
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: m.userFind, upsert: m.userUpsert },
  videoJob: { updateMany: m.videoUpdateMany }, review: { count: m.reviewCount },
  reviewPhotoUpload: { updateMany: m.photoUpdate },
  $transaction: async (fn: (client: unknown) => unknown) => fn(tx),
} }));
vi.mock('next-auth', () => ({ default: () => vi.fn() }));
vi.mock('next-auth/next', () => ({ getServerSession: m.session }));
vi.mock('next-auth/providers/google', () => ({ default: (o: unknown) => o }));
vi.mock('next-auth/providers/credentials', () => ({ default: (o: unknown) => o }));
vi.mock('@/lib/admin-access-server', () => ({ requirePermission: m.permission }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => false, rateLimitCritical: vi.fn(), getClientIp: () => 'test', hashForBucket: (s: string) => s }));
vi.mock('@/lib/security', () => ({ rejectInvalidMutationOrigin: () => null, buildRateLimitedResponse: vi.fn() }));
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock('@/lib/r2', async original => ({ ...await original<typeof import('@/lib/r2')>(), deleteFromR2: m.deleteR2 }));

const { authOptions } = await import('@/app/api/auth/[...nextauth]/route');
const { DELETE: deleteVideo } = await import('@/app/api/upload-video/route');
const { reviewPhotoPrefix, reviewPhotosBelongToUser, deleteReviewPhotosFromR2 } = await import('@/lib/reviews');
const { generalSettingsApiSchema, pickGeneralSettingsDto } = await import('@/lib/settings-api-schemas');
const { ADMIN_PERMISSION_HOME } = await import('@/lib/admin-permissions');
const { isR2PublicHttpsUrl } = await import('@/lib/r2-public-url');
const videoUrl = 'https://cdn.vitest.example/products/temporary.mp4';
const posterUrl = 'https://cdn.vitest.example/products/temporary.webp';

beforeEach(() => {
  vi.clearAllMocks();
  m.permission.mockResolvedValue({ authorized: true, access: { userId: 'catalog-1', isSuperAdmin: false } });
  m.videoFind.mockResolvedValue({ id: 'video-1', uploadedById: 'catalog-1', status: 'READY', videoUrl, posterUrl });
  m.referenceCount.mockResolvedValue(null); m.reviewCount.mockResolvedValue(0);
  m.photoFind.mockImplementation(async ({ where }: { where: { url: string } }) => ({ id: 'photo-1', userId: 'attacker', url: where.url, objectKey: where.url.split('https://cdn.vitest.example/')[1], status: 'LINKED' }));
  m.videoUpdateMany.mockResolvedValue({ count: 1 }); m.deleteR2.mockResolvedValue(undefined);
});

describe('SEC01: verified Google identity cannot implicitly acquire a local account', () => {
  it('rejects an unverified identity before looking up an account', async () => {
    expect(await authOptions.callbacks!.signIn!({ account: { provider: 'google', providerAccountId: 'google-1' }, profile: { email: 'victim@example.test', email_verified: false } } as never)).toBe(false);
    expect(m.userFind).not.toHaveBeenCalled();
  });
  it('guides an existing local account to password recovery without linking it', async () => {
    m.userFind.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'pre-registered' });
    expect(await authOptions.callbacks!.signIn!({ account: { provider: 'google', providerAccountId: 'google-1' }, profile: { email: 'victim@example.test', email_verified: true } } as never)).toBe('/login?error=OAuthAccountNotLinked');
    expect(m.userUpsert).not.toHaveBeenCalled();
  });
  it('uses provider subject for returning identities even if their email changes', async () => {
    m.userFind.mockResolvedValueOnce({ id: 'linked' });
    expect(await authOptions.callbacks!.signIn!({ account: { provider: 'google', providerAccountId: 'google-1' }, profile: { email: 'changed@example.test', email_verified: true } } as never)).toBe(true);
    expect(m.userFind).toHaveBeenCalledWith({ where: { googleSubject: 'google-1' }, select: { id: true } });
  });
  it('creates OAuth identities by subject and never updates a local password by email', async () => {
    m.userUpsert.mockResolvedValue({ id: 'new-google', email: 'victim@example.test', password: 'hash', role: 'CLIENT', isSuperAdmin: false, permissionsUpdatedAt: null });
    await authOptions.callbacks!.jwt!({ token: {}, user: { email: 'victim@example.test' }, account: { provider: 'google', providerAccountId: 'google-1' } } as never);
    const args = m.userUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ googleSubject: 'google-1' });
    expect(args.update).not.toHaveProperty('password');
  });
  it('invalidates a previously issued JWT when the account email changes', async () => {
    m.userFind.mockResolvedValueOnce({ password: 'hash', role: 'CLIENT', email: 'new@example.test', isSuperAdmin: false, permissionsUpdatedAt: null });
    const token = await authOptions.callbacks!.jwt!({ token: { id: 'account', email: 'old@example.test', role: 'ADMIN', isSuperAdmin: true, pwvAt: 0 } } as never);
    expect(token).not.toHaveProperty('id');
    expect(token).not.toHaveProperty('isSuperAdmin');
    expect(token).not.toHaveProperty('email');
  });
});

describe('SEC02: review photo ownership and referenced-file preservation', () => {
  const url = (owner: string) => `https://cdn.vitest.example/${reviewPhotoPrefix(owner)}photo.webp`;
  it('rejects another account namespace and preserves unchanged legacy photos', () => {
    expect(reviewPhotosBelongToUser([url('victim')], 'attacker')).toBe(false);
    expect(reviewPhotosBelongToUser([url('attacker')], 'attacker')).toBe(true);
    expect(reviewPhotosBelongToUser(['https://cdn.vitest.example/reviews/legacy.webp'], 'attacker', ['https://cdn.vitest.example/reviews/legacy.webp'])).toBe(true);
  });
  it('cannot delete foreign or legacy objects through a historical review', async () => {
    await deleteReviewPhotosFromR2([url('victim'), 'https://cdn.vitest.example/reviews/legacy.webp'], 'attacker');
    expect(m.deleteR2).not.toHaveBeenCalled();
  });
  it('keeps an owned file referenced by a different review', async () => {
    m.reviewCount.mockResolvedValue(1);
    await deleteReviewPhotosFromR2([url('attacker')], 'attacker');
    expect(m.deleteR2).not.toHaveBeenCalled();
    expect(m.reviewCount).toHaveBeenCalledTimes(1);
  });
});

describe('R2 references have a single canonical identity', () => {
  it('rejects URL aliases that could bypass reference checks', () => {
    expect(isR2PublicHttpsUrl(videoUrl)).toBe(true);
    for (const url of [videoUrl + '?a=1', videoUrl + '#x', videoUrl.replace('https://', 'https://user@'), videoUrl.replace('example/', 'example:443/'), videoUrl.replace('/products/', '/products//'), videoUrl.replace('temporary', '%74emporary')]) expect(isR2PublicHttpsUrl(url)).toBe(false);
    expect(isR2PublicHttpsUrl('https://cdn.vitest.example/products/file.webp', 'https://cdn.vitest.example/media')).toBe(false);
  });
});

describe('SEC03: catalog permission is scoped to registered uploaded videos', () => {
  const request = (url = videoUrl, suppliedPoster = posterUrl) => new Request('http://localhost:3000/api/upload-video', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, posterUrl: suppliedPoster }) });
  it('rejects an unregistered banner and an upload owned by a different operator', async () => {
    m.videoFind.mockResolvedValueOnce(null);
    expect((await deleteVideo(request('https://cdn.vitest.example/banners/hero.webp'))).status).toBe(403);
    m.videoFind.mockResolvedValue({ id: 'video-1', uploadedById: 'another-admin' });
    expect((await deleteVideo(request())).status).toBe(403);
    expect(m.deleteR2).not.toHaveBeenCalled();
  });
  it('rejects a referenced or still processing upload', async () => {
    m.referenceCount.mockResolvedValue(1);
    expect((await deleteVideo(request())).status).toBe(409);
    m.videoFind.mockResolvedValue({ id: 'video-1', uploadedById: 'catalog-1', status: 'PROCESSING', videoUrl, posterUrl });
    expect((await deleteVideo(request())).status).toBe(409);
    expect(m.deleteR2).not.toHaveBeenCalled();
  });
  it('deletes only the canonical pair and persists tombstones before R2', async () => {
    expect((await deleteVideo(request(videoUrl, 'https://cdn.vitest.example/assets/binance-qr.webp'))).status).toBe(200);
    expect(m.deleteR2.mock.calls.map(args => args[0])).toEqual(['products/temporary.mp4', 'products/temporary.webp']);
    expect(m.configUpsert).toHaveBeenCalledTimes(2);
    expect(m.videoUpdate).toHaveBeenCalledWith({ where: { id: 'video-1' }, data: { status: 'DELETING' } });
  });
  it('retains the deleting reservation if storage fails, allowing a safe retry', async () => {
    m.deleteR2.mockRejectedValue(new Error('mock storage unavailable'));
    expect((await deleteVideo(request())).status).toBe(500);
    expect(m.configUpsert).toHaveBeenCalledTimes(2);
    expect(m.videoUpdateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'DELETED' } }));
  });
});

describe('SEC06/07: delegated entry and fresh installation settings', () => {
  it('gives operations its own authorized page', () => expect(ADMIN_PERMISSION_HOME.OPERATIONS).toBe('/admin/operations'));
  it('reads blank defaults while rejecting whitespace in a settings write', () => {
    const settings = { storeName: 'Store', tagline: '', phone: '', phone2: '', email: '', address: '', instagram: '', facebook: '', labelWidthMm: 100, labelHeightMm: 150, whatsappOrderPhone: '' };
    expect(pickGeneralSettingsDto(settings)).toMatchObject({ phone: '', email: '' });
    expect(generalSettingsApiSchema.safeParse({ ...settings, phone: '   ', email: 'store@example.test' }).success).toBe(false);
  });
});
