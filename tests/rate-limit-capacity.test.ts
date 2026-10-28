import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/safe-logger', () => ({ logError: vi.fn(), logWarn: vi.fn() }));
import { memoryWindow, __memoryStoreClear, __memoryStoreSize, rateLimitCritical } from '@/lib/rate-limit';
beforeEach(() => { __memoryStoreClear(); vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('caps distinct local buckets without evicting an active limited identity', () => {
  const config = { limit: 1, windowMs: 60_000 };
  for (let i = 0; i < 20_000; i++) expect(memoryWindow(String(i), config).limited).toBe(false);
  expect(memoryWindow('overflow', config).limited).toBe(true); expect(__memoryStoreSize()).toBe(20_000);
  expect(memoryWindow('0', config).limited).toBe(true);
});
it('strict distributed policy blocks sensitive operations when Redis is missing', async () => {
  vi.stubEnv('RATE_LIMIT_REQUIRE_DISTRIBUTED', 'true');
  expect(await rateLimitCritical('login:a', { limit: 5, windowMs: 1000 })).toMatchObject({ limited: true, source: 'unavailable' });
});
it('pauses repeated remote calls during an outage', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fixture');
  const fetch = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetch);
  await rateLimitCritical('a', { limit: 5, windowMs: 1000 }); await rateLimitCritical('b', { limit: 5, windowMs: 1000 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
