import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/safe-logger', () => ({ logWarn: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PHASE', '');
  vi.stubEnv('E2E_MODE', '');
  vi.stubEnv('NEXTAUTH_SECRET', 'runtime-test-secret-at-least-32-characters');
  vi.stubEnv('DEPLOYMENT_ENV', 'vercel');
  vi.stubEnv('CHECKOUT_MODE', 'full');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://store.example.com');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  for (const key of Object.keys(process.env).filter((key) => key.startsWith('R2_'))) {
    vi.stubEnv(key, '');
  }
});

afterEach(() => vi.unstubAllEnvs());

it('allows database and login services to start before optional file storage is connected', async () => {
  await expect(import('@/lib/env-validation')).resolves.toBeDefined();
});

it('still blocks file uploads when storage credentials are missing', async () => {
  const { buildKey } = await import('@/lib/r2');
  expect(() => buildKey('products', 'webp')).toThrow('R2_ENDPOINT');
});

it('still refuses production startup without database credentials', async () => {
  vi.stubEnv('DATABASE_URL', '');
  await expect(import('@/lib/env-validation')).rejects.toThrow('DATABASE_URL');
});

it('still refuses production startup without distributed login protection', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  await expect(import('@/lib/env-validation')).rejects.toThrow('UPSTASH_REDIS_REST_TOKEN');
});
