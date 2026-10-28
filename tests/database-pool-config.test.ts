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
it('connects to Neon transaction pooling without unsupported startup options', () => {
  const config = databasePoolConfig('postgresql://user:password@ep-test-pooler.us-east-1.aws.neon.tech/db');
  expect(config.options).toBeUndefined();
  expect(config.query_timeout).toBe(30_000);
});
it('retains server statement and lock timeouts for direct Neon connections', () => {
  const config = databasePoolConfig('postgresql://user:password@ep-test.us-east-1.aws.neon.tech/db');
  expect(config.options).toContain('statement_timeout=30000');
  expect(config.options).toContain('lock_timeout=10000');
});
