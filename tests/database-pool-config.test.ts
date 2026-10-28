import { afterEach, expect, it, vi } from 'vitest';
import { databasePoolConfig } from '@/lib/database-pool-config';
afterEach(() => vi.unstubAllEnvs());
it('bounds connections and statement wait per process', () => {
  const config = databasePoolConfig(); expect(config.max).toBe(10);
  expect(config.connectionTimeoutMillis).toBe(5000); expect(config.options).toContain('statement_timeout=30000');
});
it('fails early on an unsafe pool size instead of creating unbounded connections', () => {
  vi.stubEnv('DATABASE_POOL_MAX', '1000'); expect(databasePoolConfig).toThrow('DATABASE_POOL_MAX');
});
