import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isCasheaEnabledMock = vi.fn();
vi.mock('@/lib/cashea-config', () => ({
  isCasheaEnabled: isCasheaEnabledMock,
}));

const createCasheaSessionMock = vi.fn();
vi.mock('@/lib/cashea-session', () => ({
  createCasheaSession: createCasheaSessionMock,
}));

const getServerSessionMock = vi.fn();
vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

const rateLimitCriticalMock = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  rateLimitCritical: rateLimitCriticalMock,
  getClientIp: () => '203.0.113.1',
  hashForBucket: (v: string) => `hashed:${v}`,
}));

const rejectInvalidMutationOriginMock = vi.fn();
vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: rejectInvalidMutationOriginMock,
  buildRateLimitedResponse: (retryAfterSeconds: number, message?: string) =>
    new Response(JSON.stringify({ message }), { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }),
}));

const logErrorMock = vi.fn();
const logWarnMock = vi.fn();
vi.mock('@/lib/safe-logger', () => ({
  logError: logErrorMock,
  logWarn: logWarnMock,
}));

const { POST } = await import('@/app/api/cashea/session/route');
const { CheckoutError } = await import('@/lib/checkout-error');

function buildRequest(body?: unknown): Request {
  return new Request('http://localhost/api/cashea/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isCasheaEnabledMock.mockReturnValue(true);
  rejectInvalidMutationOriginMock.mockReturnValue(null);
  rateLimitCriticalMock.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });
  getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
  createCasheaSessionMock.mockResolvedValue({
    orderId: 'order-1',
    publicApiKey: 'test-public-key',
    payload: { redirectUrl: 'https://mundotechve.com/checkout/cashea/return?token=abc' },
    returnToken: 'abc',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/cashea/session', () => {
  it('responde 404 si el flag está apagado (no revela la feature)', async () => {
    isCasheaEnabledMock.mockReturnValue(false);

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(404);
    expect(getServerSessionMock).not.toHaveBeenCalled();
    expect(createCasheaSessionMock).not.toHaveBeenCalled();
  });

  it('responde 403 si el origen no es válido (CSRF)', async () => {
    rejectInvalidMutationOriginMock.mockReturnValue(
      new Response(JSON.stringify({ error: 'Origen no permitido.' }), { status: 403 }),
    );

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(403);
    expect(createCasheaSessionMock).not.toHaveBeenCalled();
  });

  it('responde 429 si el rate limit por IP se excede', async () => {
    rateLimitCriticalMock.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 30 });

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(429);
    expect(getServerSessionMock).not.toHaveBeenCalled();
  });

  it('responde 401 a invitados (Cashea nunca permite invitados)', async () => {
    getServerSessionMock.mockResolvedValue({ user: null });

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(401);
    expect(createCasheaSessionMock).not.toHaveBeenCalled();
  });

  it('responde 429 si el rate limit por usuario se excede', async () => {
    rateLimitCriticalMock
      .mockResolvedValueOnce({ limited: false, retryAfterSeconds: 0 }) // IP
      .mockResolvedValueOnce({ limited: true, retryAfterSeconds: 45 }); // user

    const res = await POST(buildRequest({}));

    expect(res.status).toBe(429);
    expect(createCasheaSessionMock).not.toHaveBeenCalled();
  });

  it('propaga el status de CheckoutError (ej. cupón -> 422)', async () => {
    createCasheaSessionMock.mockRejectedValue(new CheckoutError('Los cupones no están permitidos.', 422));

    const res = await POST(buildRequest({ couponCode: 'X' }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.message).toBe('Los cupones no están permitidos.');
  });

  it('responde 500 genérico ante errores inesperados y nunca expone el detalle interno', async () => {
    createCasheaSessionMock.mockRejectedValue(new Error('CASHEA_PRIVATE_API_KEY=leaked-secret'));

    const res = await POST(buildRequest({}));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('leaked-secret');
    expect(logErrorMock).toHaveBeenCalled();
  });

  it('happy path: 200 con orderId, publicApiKey, payload y returnToken; nunca la clave privada', async () => {
    const res = await POST(buildRequest({ paymentMethodId: 'cashea' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orderId).toBe('order-1');
    expect(body.publicApiKey).toBe('test-public-key');
    expect(body.returnToken).toBe('abc');
    expect(createCasheaSessionMock).toHaveBeenCalledWith({
      userId: 'user-1',
      body: { paymentMethodId: 'cashea' },
    });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
