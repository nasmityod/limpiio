import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { appConfig: { findMany: db.findMany } } }));
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn() }));
import { readExchangeRateStatus } from '@/lib/exchange-rate-status';
import { EXCHANGE_RATE_APP_CONFIG_KEY } from '@/lib/exchange-rate';
beforeEach(() => vi.clearAllMocks());
it('labels a missing or unavailable rate as stale fallback without rejecting SSR', async () => {
  db.findMany.mockResolvedValue([]);
  expect(await readExchangeRateStatus()).toMatchObject({ valid: false, stale: true, source: 'fallback' });
  db.findMany.mockRejectedValue(new Error('offline'));
  expect(await readExchangeRateStatus()).toMatchObject({ valid: false, stale: true, source: 'fallback' });
});
it('uses the stored publication age, including an obsolete configured rate', async () => {
  db.findMany.mockResolvedValue([{ key: EXCHANGE_RATE_APP_CONFIG_KEY, value: '150.25', updatedAt: new Date(Date.now() - 200 * 3_600_000) }]);
  expect(await readExchangeRateStatus()).toMatchObject({ rate: 150.25, valid: true, stale: true, source: 'configured' });
  db.findMany.mockResolvedValue([{ key: EXCHANGE_RATE_APP_CONFIG_KEY, value: '150.25', updatedAt: new Date() }]);
  expect(await readExchangeRateStatus()).toMatchObject({ rate: 150.25, valid: true, stale: false });
});
