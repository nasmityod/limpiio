/**
 * Regresiones de la auditoría SEC-2026-09 (docs/SECURITY-FIXES-2026-09.md).
 * Cada bloque referencia el número de hallazgo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks compartidos (rutas que tocan sesión / BD) ──────────────────────────
const getServerSessionMock = vi.fn();
vi.mock('next-auth/next', () => ({ getServerSession: getServerSessionMock }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));

const reviewFindUniqueMock = vi.fn();
const reviewDeleteManyMock = vi.fn();
const productFindUniqueMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: { findUnique: reviewFindUniqueMock, deleteMany: reviewDeleteManyMock, update: vi.fn() },
    product: { findUnique: productFindUniqueMock },
  },
}));
vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: vi.fn().mockResolvedValue({
    authorized: false,
    response: new Response('forbidden-admin', { status: 403 }),
  }),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, rateLimit: vi.fn().mockResolvedValue(false), getClientIp: () => '1.2.3.4' };
});
vi.mock('@/lib/reviews', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reviews')>();
  return {
    ...actual,
    readReviewsAutoApprove: vi.fn().mockResolvedValue(false),
    deleteReviewPhotosFromR2: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const SITE = 'http://localhost:3000'; // = NEXTAUTH_URL en vitest.config.ts

const { DELETE: deleteReview } = await import('@/app/api/reviews/[id]/route');
const { rejectInvalidMutationOrigin } = await import('@/lib/security');
const { normalizeIpForBucket } = await import('@/lib/rate-limit');
const { toCustomerOrderDto, prismaOrderToOrder } = await import('@/lib/definitions');
const { sanitizeOrderItemImageUrl } = await import('@/lib/r2-public-url');
const { reviewToClient } = await import('@/lib/reviews');
const { safeHref, isGoogleMapsEmbedUrl } = await import('@/lib/safe-link');
const { isDeletableR2Key } = await import('@/lib/r2');
const { checkoutSchema } = await import('@/lib/checkout-order');
const { seoLocalSchema } = await import('@/lib/seo-local-schema');
const { generalSettingsApiSchema } = await import('@/lib/settings-api-schemas');

beforeEach(() => {
  vi.clearAllMocks();
  getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
  reviewFindUniqueMock.mockResolvedValue({ id: 'r1', userId: 'user-1', productId: 'p1', photos: [] });
  reviewDeleteManyMock.mockResolvedValue({ count: 1 });
  productFindUniqueMock.mockResolvedValue({ slug: 'x' });
});

describe('#2 guard de origen (rama autor de reseñas)', () => {
  it('same-origin → 200 y borra; cross-origin → 403 y no borra', async () => {
    const same = await deleteReview(
      new Request(`${SITE}/api/reviews/r1`, { method: 'DELETE', headers: { origin: SITE } }),
      { params: Promise.resolve({ id: 'r1' }) },
    );
    expect(same.status).toBe(200);
    expect(reviewDeleteManyMock).toHaveBeenCalledWith({ where: { id: 'r1', userId: 'user-1' } });

    reviewDeleteManyMock.mockClear();
    const cross = await deleteReview(
      new Request(`${SITE}/api/reviews/r1`, { method: 'DELETE', headers: { origin: 'https://evil.example' } }),
      { params: Promise.resolve({ id: 'r1' }) },
    );
    expect(cross.status).toBe(403);
    expect(reviewDeleteManyMock).not.toHaveBeenCalled();
  });

  it('semántica del helper: válido → null, inválido → 403', () => {
    const ok = new Request(`${SITE}/x`, { method: 'POST', headers: { origin: SITE } });
    const bad = new Request(`${SITE}/x`, { method: 'POST', headers: { origin: 'https://evil.example' } });
    expect(rejectInvalidMutationOrigin(ok)).toBeNull();
    expect(rejectInvalidMutationOrigin(bad)?.status).toBe(403);
  });
});

describe('#5 DTO de cliente', () => {
  it('anula notas internas, operador y ubicación del comprobante', () => {
    const order = prismaOrderToOrder({
      id: 'o1', orderNumber: 1, createdAt: new Date(), customerId: 'u1', customerName: 'Ana',
      total: 10, status: 'Pendiente', paymentMethod: 'Pago móvil',
      shippingAddress: 'a', shippingCity: 'b', shippingState: 'c', shippingZipCode: 'd', shippingCountry: 'e',
      notes: 'CLIENTE CONFLICTIVO', paymentVerifiedBy: 'operador@tienda.com',
      paymentProofKey: 'proofs/x.webp', paymentProofUrl: 'https://cdn/x', items: [],
    });
    const dto = toCustomerOrderDto(order);
    expect(dto.notes).toBeNull();
    expect(dto.paymentVerifiedBy).toBeNull();
    expect(dto.paymentProofKey).toBeNull();
    expect(dto.paymentProofUrl).toBeNull();
    expect(dto.orderNumber).toBe(1);
  });
});

describe('#11 imageUrl de líneas de pedido', () => {
  it('conserva rutas internas y CDN; descarta hosts ajenos y javascript:', () => {
    expect(sanitizeOrderItemImageUrl('/placeholder.png')).toBe('/placeholder.png');
    expect(sanitizeOrderItemImageUrl('https://cdn.vitest.example/products/a.webp')).toBe(
      'https://cdn.vitest.example/products/a.webp',
    );
    expect(sanitizeOrderItemImageUrl('https://evil.example/a.png')).toBeNull();
    expect(sanitizeOrderItemImageUrl('//evil.example/a.png')).toBeNull();
    expect(sanitizeOrderItemImageUrl('javascript:alert(1)')).toBeNull();
  });

  it('checkoutSchema sanea imageUrl y acota longitudes (#8)', () => {
    const base = {
      customerName: 'Ana',
      shippingDetails: { address: 'Calle 1', city: 'Bqto', state: 'Lara' },
      paymentMethodId: 'pago-movil',
      items: [{ productId: 'p1', quantity: 1, imageUrl: 'https://evil.example/x.png' }],
    };
    const ok = checkoutSchema.safeParse(base);
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.items[0].imageUrl).toBeNull();

    const tooLong = checkoutSchema.safeParse({ ...base, customerName: 'x'.repeat(121) });
    expect(tooLong.success).toBe(false);
  });
});

describe('#4 enlaces editables', () => {
  it('safeHref bloquea javascript:/data:/http:', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('http://insecure.example')).toBeNull();
    expect(safeHref('https://instagram.com/tienda')).toBe('https://instagram.com/tienda');
    expect(safeHref('/productos')).toBe('/productos');
  });

  it('generalSettingsApiSchema rechaza instagram con javascript:', () => {
    const res = generalSettingsApiSchema.safeParse({
      storeName: 'T', phone: '1', email: 'a@b.co', instagram: 'javascript:alert(1)',
    });
    expect(res.success).toBe(false);
  });

  it('seoLocalSchema exige https y embed real de Google Maps', () => {
    const base = { legalName: 'L', slogan: 'S', streetAddress: 'A', geo: { latitude: 1, longitude: 1 } };
    expect(seoLocalSchema.safeParse({ ...base, googleMapsUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(seoLocalSchema.safeParse({ ...base, googleMapsEmbed: 'https://evil.example/e' }).success).toBe(false);
    expect(seoLocalSchema.safeParse({ ...base, googleMapsEmbed: 'https://www.google.com/maps/embed?pb=1' }).success).toBe(true);
    expect(isGoogleMapsEmbedUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('#20 borrado en R2 acotado a carpetas de la app', () => {
  it('nunca backups/ ni proofs/', () => {
    expect(isDeletableR2Key('products/a.webp')).toBe(true);
    expect(isDeletableR2Key('reviews/a.webp')).toBe(true);
    expect(isDeletableR2Key('backups/storefront_20260914_030000.dump')).toBe(false);
    expect(isDeletableR2Key('proofs/a.webp')).toBe(false);
    expect(isDeletableR2Key('products/../backups/x')).toBe(false);
  });
});

describe('#24 IPv6 → /64', () => {
  it('agrupa direcciones del mismo /64 y respeta IPv4 y mapeadas', () => {
    expect(normalizeIpForBucket('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIpForBucket('::ffff:203.0.113.9')).toBe('203.0.113.9');
    const a = normalizeIpForBucket('2001:db8:abcd:1234::1');
    const b = normalizeIpForBucket('2001:db8:abcd:1234:ffff:ffff:ffff:ffff');
    const c = normalizeIpForBucket('2001:db8:abcd:1235::1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe('2001:0db8:abcd:1234::/64');
    expect(normalizeIpForBucket('unknown')).toBe('unknown');
  });
});

describe('userId de reseñas solo para su autor', () => {
  const row = {
    id: 'r1', productId: 'p1', userId: 'u1', authorName: 'A', rating: 5, title: null, comment: 'ok',
    status: 'APPROVED', verifiedPurchase: false, adminReply: null, photos: [], createdAt: new Date(),
  };
  it('oculta el id a terceros y lo muestra al autor y al panel', () => {
    expect(reviewToClient(row).userId).toBeNull();
    expect(reviewToClient(row, 'u2').userId).toBeNull();
    expect(reviewToClient(row, 'u1').userId).toBe('u1');
    expect(reviewToClient(row, 'admin').userId).toBe('u1');
  });
});
