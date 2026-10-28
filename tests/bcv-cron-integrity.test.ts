import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ fetched: vi.fn(), savedDate: vi.fn(), stored: vi.fn(), rate: vi.fn(), persist: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/bcv-rate', () => ({ fetchBcvRate: state.fetched }));
vi.mock('@/app/actions/configActions', () => ({ getExchangeRate: state.rate }));
vi.mock('@/lib/exchange-rate', () => ({ EXCHANGE_RATE_BCV_DATE_KEY: 'bcv_date', hasStoredExchangeRate: state.stored }));
vi.mock('@/lib/persist-exchange-rate', () => ({ persistExchangeRateWithBcvDate: state.persist }));
vi.mock('@/lib/prisma', () => ({ prisma: { appConfig: { findUnique: state.savedDate, upsert: state.success } } }));
vi.mock('@/lib/security', () => ({ verifyBearerSecret: () => true }));
vi.mock('@/lib/safe-logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));
import { GET } from '@/app/api/cron/update-bcv-rate/route';

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('CRON_SECRET', 'test'); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  state.fetched.mockResolvedValue({ rate: 100, date: '2026-10-04T00:00:00-04:00' });
  state.rate.mockResolvedValue(100); state.stored.mockResolvedValue(true); state.savedDate.mockResolvedValue({ value: '2026-10-04T04:00:00.000Z' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('BCV integrity recovery', () => {
  it('repairs a missing rate even if its saved publication date did not change', async () => {
    state.stored.mockResolvedValue(false); state.rate.mockResolvedValue(36.5);
    const result = await GET(new Request('http://localhost/api/cron/update-bcv-rate'));
    expect(result.status).toBe(200);
    expect(state.persist).toHaveBeenCalledWith(100, '2026-10-04T04:00:00.000Z');
  });
  it('only reports no changes when both date and persisted rate are healthy', async () => {
    const result = await GET(new Request('http://localhost/api/cron/update-bcv-rate'));
    expect(await result.json()).toEqual({ ok: true, sinCambios: true });
    expect(state.persist).not.toHaveBeenCalled();
  });
  it('never overwrites a newer saved publication with an older fallback', async () => {
    state.fetched.mockResolvedValue({ rate: 99, date: '2026-10-03T04:00:00Z' });
    const result = await GET(new Request('http://localhost/api/cron/update-bcv-rate'));
    expect(result.status).toBe(409); expect(state.persist).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
  });
  it('does not renew health for a source stalled more than a week', async () => {
    state.fetched.mockResolvedValue({ rate: 100, date: '2026-09-20T04:00:00Z' });
    const result = await GET(new Request('http://localhost/api/cron/update-bcv-rate'));
    expect(result.status).toBe(409); expect(state.success).not.toHaveBeenCalled();
  });
});
