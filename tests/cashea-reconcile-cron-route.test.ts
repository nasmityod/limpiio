import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findManyMock = vi.fn();
const updateManyMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: findManyMock,
      updateMany: updateManyMock,
    },
  },
}));

const isCasheaEnabledMock = vi.fn();
vi.mock('@/lib/cashea-config', () => ({
  isCasheaEnabled: isCasheaEnabledMock,
}));

const processCasheaConfirmationMock = vi.fn();
vi.mock('@/lib/cashea-reconcile', () => ({
  processCasheaConfirmation: processCasheaConfirmationMock,
}));

const logInfoMock = vi.fn();
const logErrorMock = vi.fn();
vi.mock('@/lib/safe-logger', () => ({
  logInfo: logInfoMock,
  logError: logErrorMock,
}));

const { GET } = await import('@/app/api/cron/cashea-reconcile/route');

function buildRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/cron/cashea-reconcile', {
    headers: headers ?? {},
  });
}

function authorizedRequest(): Request {
  return buildRequest({ Authorization: 'Bearer vitest-cron-secret' });
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    casheaAttemptCount: 0,
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));

  isCasheaEnabledMock.mockReturnValue(true);
  findManyMock.mockResolvedValue([]);
  updateManyMock.mockResolvedValue({ count: 0 });
  processCasheaConfirmationMock.mockResolvedValue({ outcome: 'pending_not_confirmed', casheaStatus: 'RETURNED' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/cron/cashea-reconcile', () => {
  it('rechaza llamada sin Authorization', async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('rechaza Bearer incorrecto', async () => {
    const res = await GET(buildRequest({ Authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('flag CASHEA_ENABLED=false -> no-op, no toca la base de datos', async () => {
    isCasheaEnabledMock.mockReturnValue(false);

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, enabled: false, reconciled: 0, expired: 0 });
    expect(findManyMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('consulta solo pedidos RETURNED/VERIFYING con casheaOrderId y bajo el límite de intentos', async () => {
    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        casheaStatus: { in: ['RETURNED', 'VERIFYING'] },
        casheaOrderId: { not: null },
        casheaAttemptCount: { lt: 20 },
      },
      orderBy: { updatedAt: 'asc' },
      take: 50,
      select: { id: true, casheaAttemptCount: true, updatedAt: true },
    });
    expect(body.reconciled).toBe(0);
  });

  it('reintenta processCasheaConfirmation para cada candidato fuera de backoff', async () => {
    findManyMock.mockResolvedValue([candidate()]);
    processCasheaConfirmationMock.mockResolvedValueOnce({ outcome: 'confirmed', casheaStatus: 'CONFIRMED' });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(processCasheaConfirmationMock).toHaveBeenCalledWith('order-1');
    expect(body.reconciled).toBe(1);
    expect(body.confirmed).toBe(1);
  });

  it('respeta el backoff: no reintenta un pedido actualizado muy recientemente', async () => {
    findManyMock.mockResolvedValue([
      candidate({ casheaAttemptCount: 0, updatedAt: new Date('2026-07-16T11:58:00.000Z') }), // hace 2 min, backoff=5min
    ]);

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(processCasheaConfirmationMock).not.toHaveBeenCalled();
    expect(body.skippedBackoff).toBe(1);
    expect(body.reconciled).toBe(0);
  });

  it('backoff crece con casheaAttemptCount (varios intentos -> espera más)', async () => {
    findManyMock.mockResolvedValue([
      // 3 intentos previos -> backoff = 5*(3+1) = 20 min; actualizado hace 15 min: aún en backoff.
      candidate({ casheaAttemptCount: 3, updatedAt: new Date('2026-07-16T11:45:00.000Z') }),
    ]);

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(processCasheaConfirmationMock).not.toHaveBeenCalled();
    expect(body.skippedBackoff).toBe(1);
  });

  it('un error de un candidato no detiene el procesamiento de los demás', async () => {
    findManyMock.mockResolvedValue([candidate({ id: 'order-1' }), candidate({ id: 'order-2' })]);
    processCasheaConfirmationMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ outcome: 'pending_not_confirmed', casheaStatus: 'RETURNED' });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(processCasheaConfirmationMock).toHaveBeenCalledTimes(2);
    expect(body.reconcileErrors).toBe(1);
    expect(body.reconciled).toBe(1);
    expect(logErrorMock).toHaveBeenCalledWith(
      'cashea_reconcile_cron_item_failed',
      expect.anything(),
      expect.objectContaining({ orderId: 'order-1', operation: 'cashea_reconcile_cron' }),
    );
  });

  it('marca EXPIRED los pedidos CREATED/REDIRECTED/RETURNED con reserva vencida, nunca los cancela', async () => {
    updateManyMock.mockResolvedValue({ count: 3 });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        casheaStatus: { in: ['CREATED', 'REDIRECTED', 'RETURNED'] },
        casheaReservationExpiresAt: { lt: new Date('2026-07-16T12:00:00.000Z') },
      },
      data: { casheaStatus: 'EXPIRED' },
    });
    expect(body.expired).toBe(3);
    // Nunca debe tocar el estado de pedido (Order.status) ni restaurar stock aquí.
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });

  it('la expiración corre incluso sin candidatos a reconciliar', async () => {
    findManyMock.mockResolvedValue([]);
    updateManyMock.mockResolvedValue({ count: 1 });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.attempted).toBe(0);
    expect(body.expired).toBe(1);
  });

  it('error fatal de Prisma -> 500 genérico', async () => {
    findManyMock.mockRejectedValue(new Error('db down'));

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
    expect(logErrorMock).toHaveBeenCalledWith(
      'cron_cashea_reconcile_error',
      expect.anything(),
      expect.objectContaining({ operation: 'cashea_reconcile_cron' }),
    );
  });
});
