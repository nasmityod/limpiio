import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();
const updateManyMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
    $transaction: transactionMock,
  },
}));

const verifyCasheaOrderMock = vi.fn();
class FakeCasheaVerificationNotImplemented extends Error {
  constructor(casheaOrderId: string) {
    super(`not implemented: ${casheaOrderId}`);
    this.name = 'CasheaVerificationNotImplemented';
  }
}
vi.mock('@/lib/cashea', () => ({
  verifyCasheaOrder: verifyCasheaOrderMock,
  CasheaVerificationNotImplemented: FakeCasheaVerificationNotImplemented,
}));

const sendPaymentValidatedEmailMock = vi.fn();
vi.mock('@/lib/resend', () => ({
  sendPaymentValidatedEmail: sendPaymentValidatedEmailMock,
}));

vi.mock('@/lib/safe-logger', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const { processCasheaConfirmation } = await import('@/lib/cashea-reconcile');

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 42,
    status: 'Pendiente',
    casheaStatus: 'RETURNED',
    casheaOrderId: 'CASHEA-123',
    casheaAttemptCount: 0,
    casheaConfirmedAt: null,
    customerName: 'Cliente Prueba',
    customerEmail: 'cliente@example.com',
    customer: { email: null, name: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateManyMock.mockResolvedValue({ count: 1 });
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      order: {
        updateMany: updateManyMock,
        findUnique: findUniqueMock,
      },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('processCasheaConfirmation — idempotencia y máquina de estados', () => {
  it('pedido inexistente o no-Cashea -> not_verifiable, sin llamar a verifyCasheaOrder', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const result = await processCasheaConfirmation('order-x');

    expect(result.outcome).toBe('not_verifiable');
    expect(verifyCasheaOrderMock).not.toHaveBeenCalled();
  });

  it('ya CONFIRMED -> already_final, sin efectos ni llamada a Cashea', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder({ casheaStatus: 'CONFIRMED' }));

    const result = await processCasheaConfirmation('order-1');

    expect(result).toEqual({ outcome: 'already_final', casheaStatus: 'CONFIRMED' });
    expect(verifyCasheaOrderMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('ya CANCELLED -> already_final, sin efectos ni llamada a Cashea', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder({ casheaStatus: 'CANCELLED' }));

    const result = await processCasheaConfirmation('order-1');

    expect(result).toEqual({ outcome: 'already_final', casheaStatus: 'CANCELLED' });
    expect(verifyCasheaOrderMock).not.toHaveBeenCalled();
  });

  it('estado no verificable (CREATED) -> not_verifiable, sin llamar a Cashea', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder({ casheaStatus: 'CREATED' }));

    const result = await processCasheaConfirmation('order-1');

    expect(result.outcome).toBe('not_verifiable');
    expect(verifyCasheaOrderMock).not.toHaveBeenCalled();
  });

  it('sin casheaOrderId -> not_verifiable, sin llamar a Cashea', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder({ casheaOrderId: null }));

    const result = await processCasheaConfirmation('order-1');

    expect(result.outcome).toBe('not_verifiable');
    expect(verifyCasheaOrderMock).not.toHaveBeenCalled();
  });
});

describe('processCasheaConfirmation — verifyCasheaOrder sin implementar (Sección 4/12)', () => {
  it('CasheaVerificationNotImplemented -> el pedido NUNCA se confirma, queda RETURNED', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder());
    verifyCasheaOrderMock.mockRejectedValueOnce(new FakeCasheaVerificationNotImplemented('CASHEA-123'));

    const result = await processCasheaConfirmation('order-1');

    expect(result).toEqual({ outcome: 'pending_not_implemented', casheaStatus: 'RETURNED' });
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', casheaStatus: 'VERIFYING' },
        data: expect.objectContaining({ casheaStatus: 'RETURNED', casheaAttemptCount: { increment: 1 } }),
      }),
    );
    expect(sendPaymentValidatedEmailMock).not.toHaveBeenCalled();
  });

  it('confirmed=false -> queda pendiente (RETURNED), sin confirmar ni enviar correo', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder());
    verifyCasheaOrderMock.mockResolvedValueOnce({ confirmed: false, raw: {} });

    const result = await processCasheaConfirmation('order-1');

    expect(result).toEqual({ outcome: 'pending_not_confirmed', casheaStatus: 'RETURNED' });
    expect(sendPaymentValidatedEmailMock).not.toHaveBeenCalled();
  });

  it('error inesperado de verifyCasheaOrder -> queda pendiente (fail-closed), nunca confirma', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder());
    verifyCasheaOrderMock.mockRejectedValueOnce(new Error('network down'));

    const result = await processCasheaConfirmation('order-1');

    expect(result).toEqual({ outcome: 'pending_error', casheaStatus: 'RETURNED' });
    expect(sendPaymentValidatedEmailMock).not.toHaveBeenCalled();
  });
});

describe('processCasheaConfirmation — confirmación exitosa', () => {
  it('confirmed=true -> transiciona a CONFIRMED, fija paidAt/estado y envía el correo una vez', async () => {
    findUniqueMock
      .mockResolvedValueOnce(baseOrder()) // lectura inicial
      .mockResolvedValueOnce(baseOrder({ casheaStatus: 'CONFIRMED' })); // relectura post-transacción
    verifyCasheaOrderMock.mockResolvedValueOnce({ confirmed: true, initialAmount: 25.5, raw: {} });

    const result = await processCasheaConfirmation('order-1');

    expect(result).toEqual({ outcome: 'confirmed', casheaStatus: 'CONFIRMED' });
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1', casheaStatus: 'VERIFYING' },
        data: expect.objectContaining({
          casheaStatus: 'CONFIRMED',
          status: 'En Proceso',
          casheaInitialAmount: 25.5,
        }),
      }),
    );
    expect(sendPaymentValidatedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPaymentValidatedEmailMock).toHaveBeenCalledWith(
      'cliente@example.com',
      'Cliente',
      '0042',
      'order-1',
      { casheaInitial: true },
    );
  });

  it('doble llamada concurrente no duplica confirmación ni correo (idempotencia)', async () => {
    // Primera llamada: transición VERIFYING ok, confirma ok.
    findUniqueMock
      .mockResolvedValueOnce(baseOrder())
      .mockResolvedValueOnce(baseOrder({ casheaStatus: 'CONFIRMED' }));
    verifyCasheaOrderMock.mockResolvedValueOnce({ confirmed: true, raw: {} });

    const first = await processCasheaConfirmation('order-1');
    expect(first.outcome).toBe('confirmed');
    expect(sendPaymentValidatedEmailMock).toHaveBeenCalledTimes(1);

    // Segunda llamada: el pedido ya está CONFIRMED -> already_final, sin nueva verificación ni correo.
    findUniqueMock.mockResolvedValueOnce(baseOrder({ casheaStatus: 'CONFIRMED' }));
    verifyCasheaOrderMock.mockClear();

    const second = await processCasheaConfirmation('order-1');
    expect(second).toEqual({ outcome: 'already_final', casheaStatus: 'CONFIRMED' });
    expect(verifyCasheaOrderMock).not.toHaveBeenCalled();
    expect(sendPaymentValidatedEmailMock).toHaveBeenCalledTimes(1);
  });

  it('si otra petición ya confirmó dentro de la transacción, no reenvía el correo', async () => {
    findUniqueMock
      .mockResolvedValueOnce(baseOrder())
      .mockResolvedValueOnce(baseOrder({ casheaStatus: 'CONFIRMED' }));
    verifyCasheaOrderMock.mockResolvedValueOnce({ confirmed: true, raw: {} });
    // La transición dentro de la transacción pierde la carrera (count 0).
    updateManyMock.mockImplementation(async (args: { where: { casheaStatus?: unknown } }) => {
      if (args.where.casheaStatus === 'VERIFYING') return { count: 0 };
      return { count: 1 };
    });

    const result = await processCasheaConfirmation('order-1');

    expect(result).toEqual({ outcome: 'already_final', casheaStatus: 'CONFIRMED' });
    expect(sendPaymentValidatedEmailMock).not.toHaveBeenCalled();
  });

  it('sin email de contacto disponible -> confirma igual, sin intentar enviar correo', async () => {
    findUniqueMock
      .mockResolvedValueOnce(baseOrder({ customerEmail: null, customer: { email: null, name: null } }))
      .mockResolvedValueOnce(baseOrder({ casheaStatus: 'CONFIRMED' }));
    verifyCasheaOrderMock.mockResolvedValueOnce({ confirmed: true, raw: {} });

    const result = await processCasheaConfirmation('order-1');

    expect(result.outcome).toBe('confirmed');
    expect(sendPaymentValidatedEmailMock).not.toHaveBeenCalled();
  });
});
