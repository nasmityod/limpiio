import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isCasheaEnabledMock = vi.fn();
vi.mock('@/lib/cashea-config', () => ({
  isCasheaEnabled: isCasheaEnabledMock,
}));

const getServerSessionMock = vi.fn();
vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

const findFirstMock = vi.fn();
const updateManyMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findFirst: findFirstMock,
      updateMany: updateManyMock,
    },
  },
}));

const hashTokenMock = vi.fn((raw: string) => `hash:${raw}`);
vi.mock('@/lib/security', () => ({
  hashToken: hashTokenMock,
}));

const processCasheaConfirmationMock = vi.fn();
vi.mock('@/lib/cashea-reconcile', () => ({
  processCasheaConfirmation: processCasheaConfirmationMock,
}));

vi.mock('@/lib/safe-logger', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const { GET } = await import('@/app/checkout/cashea/return/route');

function buildRequest(query: string): Request {
  return new Request(`http://localhost/checkout/cashea/return${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  isCasheaEnabledMock.mockReturnValue(true);
  getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
  findFirstMock.mockResolvedValue({ id: 'order-1', customerId: 'user-1', casheaOrderId: null });
  updateManyMock.mockResolvedValue({ count: 1 });
  processCasheaConfirmationMock.mockResolvedValue({ outcome: 'pending_not_implemented', casheaStatus: 'RETURNED' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /checkout/cashea/return', () => {
  it('flag off -> redirige a /checkout genérico, sin tocar sesión ni BD', async () => {
    isCasheaEnabledMock.mockReturnValue(false);

    const res = await GET(buildRequest('?token=abc'));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/checkout');
    expect(getServerSessionMock).not.toHaveBeenCalled();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('invitado (sin sesión) -> redirección neutra, sin consultar el pedido', async () => {
    getServerSessionMock.mockResolvedValue({ user: null });

    const res = await GET(buildRequest('?token=abc'));

    expect(new URL(res.headers.get('location')!).pathname).toBe('/checkout');
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('sin token -> redirección neutra', async () => {
    const res = await GET(buildRequest(''));

    expect(new URL(res.headers.get('location')!).pathname).toBe('/checkout');
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('idNumber con caracteres inválidos -> redirección neutra (anti path/SSRF injection)', async () => {
    const res = await GET(buildRequest('?token=abc&idNumber=../../etc/passwd'));

    expect(new URL(res.headers.get('location')!).pathname).toBe('/checkout');
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('token inexistente -> redirección neutra (anti-enumeración)', async () => {
    findFirstMock.mockResolvedValue(null);

    const res = await GET(buildRequest('?token=abc'));

    expect(new URL(res.headers.get('location')!).pathname).toBe('/checkout');
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('pedido de otro usuario -> redirección neutra, no expone el pedido ajeno', async () => {
    findFirstMock.mockResolvedValue({ id: 'order-1', customerId: 'other-user', casheaOrderId: null });

    const res = await GET(buildRequest('?token=abc'));

    expect(new URL(res.headers.get('location')!).pathname).toBe('/checkout');
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('token ya consumido concurrentemente (count 0) -> redirección neutra, no reconfirma', async () => {
    updateManyMock.mockResolvedValue({ count: 0 });

    const res = await GET(buildRequest('?token=abc&idNumber=CASHEA-123'));

    expect(new URL(res.headers.get('location')!).pathname).toBe('/checkout');
    expect(processCasheaConfirmationMock).not.toHaveBeenCalled();
  });

  it('happy path: consume el token una sola vez, guarda idNumber y llama a processCasheaConfirmation', async () => {
    const res = await GET(buildRequest('?token=raw-token&idNumber=CASHEA-123'));

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 'order-1', casheaReturnTokenHash: 'hash:raw-token' },
      data: {
        casheaReturnTokenHash: null,
        casheaReturnedAt: expect.any(Date),
        casheaStatus: 'RETURNED',
        casheaOrderId: 'CASHEA-123',
      },
    });
    expect(processCasheaConfirmationMock).toHaveBeenCalledWith('order-1');
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/checkout/success');
    expect(location.searchParams.get('orderId')).toBe('order-1');
  });

  it('no sobrescribe casheaOrderId si el pedido ya tenía uno', async () => {
    findFirstMock.mockResolvedValue({ id: 'order-1', customerId: 'user-1', casheaOrderId: 'EXISTING-ID' });

    await GET(buildRequest('?token=raw-token&idNumber=NEW-ID'));

    const call = updateManyMock.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.casheaOrderId).toBeUndefined();
  });

  it('segundo uso del mismo token no reconfirma ni expone datos (un solo consumo)', async () => {
    await GET(buildRequest('?token=raw-token&idNumber=CASHEA-123'));
    expect(processCasheaConfirmationMock).toHaveBeenCalledTimes(1);

    // Segundo intento: el token ya no existe (fue anulado) -> findFirst no lo encuentra.
    findFirstMock.mockResolvedValue(null);
    processCasheaConfirmationMock.mockClear();

    await GET(buildRequest('?token=raw-token&idNumber=CASHEA-123'));
    expect(processCasheaConfirmationMock).not.toHaveBeenCalled();
  });
});
