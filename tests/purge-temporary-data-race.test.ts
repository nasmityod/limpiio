import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const delegates = vi.hoisted(() => {
  const table = () => ({ count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() });
  return {
    passwordResetToken: table(), user: table(), paymentUpload: table(),
    productView: table(), abandonedCart: table(), appConfig: { upsert: vi.fn() },
  };
});
vi.mock('@/lib/prisma', () => ({ prisma: delegates }));
vi.mock('@/lib/safe-logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));

const { GET } = await import('@/app/api/cron/purge-temporary-data/route');

type Row = { id: string; [field: string]: string | Date | null };
type Condition = { in?: string[]; not?: null; lt?: Date };
type Where = Record<string, string | Condition>;

// A small in-memory query delegate executes the route's predicates against the
// current row, including a deliberate interleaving after the batch read.
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (typeof condition === 'string') return value === condition;
    if (condition.in && !condition.in.includes(String(value))) return false;
    if ('not' in condition && value === condition.not) return false;
    if (condition.lt && (!(value instanceof Date) || value >= condition.lt)) return false;
    return true;
  });
}

function configureRow(table: typeof delegates.user, row: Row, renewAfterRead?: () => void) {
  let deleted = false;
  table.count.mockImplementation(async ({ where }: { where: Where }) => Number(!deleted && matches(row, where)));
  table.findMany.mockImplementation(async ({ where }: { where: Where }) => {
    const selected = !deleted && matches(row, where) ? [{ id: row.id }] : [];
    if (selected.length) renewAfterRead?.();
    return selected;
  });
  table.deleteMany.mockImplementation(async ({ where }: { where: Where }) => {
    const count = Number(!deleted && matches(row, where));
    if (count) deleted = true;
    return { count };
  });
  table.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    const count = Number(!deleted && matches(row, where));
    if (count) Object.assign(row, data);
    return { count };
  });
  return () => deleted;
}

async function runPurge() {
  const response = await GET(new NextRequest('http://localhost/api/cron/purge-temporary-data', {
    headers: { authorization: 'Bearer vitest-cron-secret' },
  }));
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    categories: Record<string, { checked: number; deleted: number }>;
  }>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  for (const table of [delegates.passwordResetToken, delegates.user, delegates.paymentUpload, delegates.productView, delegates.abandonedCart]) {
    table.count.mockReset().mockResolvedValue(0);
    table.findMany.mockReset().mockResolvedValue([]);
    table.deleteMany.mockReset().mockResolvedValue({ count: 0 });
    table.updateMany.mockReset().mockResolvedValue({ count: 0 });
  }
  delegates.appConfig.upsert.mockReset().mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe('temporary data purge respects concurrent renewal', () => {
  it('keeps a new email-change token saved after the expired token was selected', async () => {
    const row: Row = {
      id: 'user-renewed', emailChangeToken: 'expired-token',
      emailChangeTokenExpiry: new Date('2026-09-01'), pendingEmail: 'old@example.test',
    };
    configureRow(delegates.user, row, () => {
      row.emailChangeToken = 'new-token';
      row.emailChangeTokenExpiry = new Date('2026-10-08');
      row.pendingEmail = 'new@example.test';
    });
    const result = await runPurge();
    expect(result.categories.emailChangeTokens).toEqual({ checked: 1, deleted: 0 });
    expect(row.emailChangeToken).toBe('new-token');
    expect(row.pendingEmail).toBe('new@example.test');
  });

  it('keeps a pending abandoned cart whose activity was renewed after selection', async () => {
    const row: Row = { id: 'cart-renewed', status: 'PENDING', lastActivityAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') };
    const wasDeleted = configureRow(delegates.abandonedCart, row, () => {
      row.lastActivityAt = new Date();
      row.updatedAt = new Date();
    });
    const result = await runPurge();
    expect(result.categories.abandonedCartsPending).toEqual({ checked: 1, deleted: 0 });
    expect(wasDeleted()).toBe(false);
  });

  it('keeps a terminal cart that became active again after selection', async () => {
    const row: Row = { id: 'cart-reactivated', status: 'RECOVERED', lastActivityAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01') };
    const wasDeleted = configureRow(delegates.abandonedCart, row, () => {
      row.status = 'PENDING';
      row.lastActivityAt = new Date();
      row.updatedAt = new Date();
    });
    const result = await runPurge();
    expect(result.categories.abandonedCartsTerminal).toEqual({ checked: 1, deleted: 0 });
    expect(wasDeleted()).toBe(false);
  });

  it('still clears an expired email-change request when nothing renews it', async () => {
    const row: Row = { id: 'user-expired', emailChangeToken: 'old', emailChangeTokenExpiry: new Date('2026-09-01'), pendingEmail: 'old@example.test' };
    configureRow(delegates.user, row);
    const result = await runPurge();
    expect(result.categories.emailChangeTokens).toEqual({ checked: 1, deleted: 1 });
    expect(row.emailChangeToken).toBeNull();
    expect(row.pendingEmail).toBeNull();
  });
});
