/**
 * SEC-2026-09 — #15 (bucket por email del login con body JSON) y #16 (tasa
 * de cambio fail-closed en checkout).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appConfigFindUniqueMock = vi.fn();
const userFindUniqueMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findUnique: appConfigFindUniqueMock },
    user: { findUnique: userFindUniqueMock, upsert: vi.fn() },
  },
}));

const rateLimitCriticalMock = vi.fn();
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    rateLimitCritical: rateLimitCriticalMock,
    getClientIp: () => '1.2.3.4',
    hashForBucket: (v: string) => `h(${v.trim().toLowerCase()})`,
  };
});

const nextAuthInnerHandler = vi.fn();
vi.mock('next-auth', () => ({
  __esModule: true,
  default: () => nextAuthInnerHandler,
}));
vi.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: (o: unknown) => o }));
vi.mock('next-auth/providers/google', () => ({ __esModule: true, default: (o: unknown) => o }));
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

const { loadExchangeRateUsdBsFromTx, ExchangeRateUnavailableError, hasStoredExchangeRate } = await import(
  '@/lib/exchange-rate'
);
const { POST: authPost } = await import('@/app/api/auth/[...nextauth]/route');

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitCriticalMock.mockResolvedValue({ limited: false, retryAfterSeconds: 0, source: 'memory' });
  nextAuthInnerHandler.mockResolvedValue(new Response('nextauth', { status: 200 }));
});

describe('#16 tasa de cambio en operaciones que congelan dinero', () => {
  const tx = { appConfig: { findUnique: appConfigFindUniqueMock } } as never;

  it('sin fila → lanza en vez de devolver el default 36,5', async () => {
    appConfigFindUniqueMock.mockResolvedValue(null);
    await expect(loadExchangeRateUsdBsFromTx(tx)).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
    await expect(hasStoredExchangeRate(tx)).resolves.toBe(false);
  });

  it('fila corrupta → lanza', async () => {
    appConfigFindUniqueMock.mockResolvedValue({ value: '36.5abc' });
    await expect(loadExchangeRateUsdBsFromTx(tx)).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
  });

  it('fila válida → devuelve la tasa', async () => {
    appConfigFindUniqueMock.mockResolvedValue({ value: '150,25' });
    await expect(loadExchangeRateUsdBsFromTx(tx)).resolves.toBe(150.25);
    await expect(hasStoredExchangeRate(tx)).resolves.toBe(true);
  });
});

describe('#15 bucket por email en /callback/credentials', () => {
  const url = 'http://localhost:3000/api/auth/callback/credentials';

  it('body urlencoded → aplica el bucket por email', async () => {
    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'Admin@Tienda.com', password: 'x', csrfToken: 't' }).toString(),
    });
    await authPost(req, {} as never);
    const keys = rateLimitCriticalMock.mock.calls.map((c) => c[0]);
    expect(keys.some((k: string) => k.startsWith('auth:email:'))).toBe(true);
  });

  it('body JSON → TAMBIÉN aplica el bucket por email (antes se saltaba)', async () => {
    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tienda.com', password: 'x', csrfToken: 't' }),
    });
    await authPost(req, {} as never);
    const keys = rateLimitCriticalMock.mock.calls.map((c) => c[0]);
    expect(keys.some((k: string) => k.startsWith('auth:email:'))).toBe(true);
  });

  it('bucket por email agotado → 429 sin llegar a NextAuth', async () => {
    rateLimitCriticalMock.mockImplementation(async (key: string) =>
      key.startsWith('auth:email:')
        ? { limited: true, retryAfterSeconds: 900, source: 'memory' }
        : { limited: false, retryAfterSeconds: 0, source: 'memory' },
    );
    const req = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tienda.com', password: 'x' }),
    });
    const res = await authPost(req, {} as never);
    expect(res.status).toBe(429);
    expect(nextAuthInnerHandler).not.toHaveBeenCalled();
  });
});
