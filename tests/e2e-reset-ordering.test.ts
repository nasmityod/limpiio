import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ events: [] as string[], attempts: new Set<string>(), finished: undefined as (() => void) | undefined }));
vi.mock('dotenv/config', () => ({}));
vi.mock('bcrypt', () => ({ default: { hash: async () => 'fixture-password-hash' } }));
vi.mock('@/lib/security', () => ({ hashToken: (token: string) => `fixture-hash:${token}` }));
vi.mock('@/scripts/lib/script-prisma', () => ({
  createScriptPrisma: () => ({
    $queryRaw: async () => [{ current_database: 'fixture_test' }],
    $transaction: async (callback: (tx: Record<string, { deleteMany: () => Promise<{ count: number }>; create: () => Promise<{ id: string }> }>) => Promise<void>) => {
      const tx = new Proxy({}, {
        get: (_, model: string) => ({
          deleteMany: async () => { state.events.push(`delete:${model}`); if (model === 'checkoutAttempt') state.attempts.clear(); return { count: 0 }; },
          create: async () => { state.events.push(`create:${model}`); return { id: 'fixture-client' }; },
        }),
      });
      return callback(tx);
    },
    $disconnect: async () => { state.finished?.(); },
  }),
}));

async function resetWithoutDatabase() {
  vi.resetModules();
  const finished = new Promise<void>((resolve) => { state.finished = resolve; });
  await import('@/scripts/e2e-reset-db');
  await finished;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('guarded E2E reset compatibility', () => {
  it('clears new durable state before its orders/users and can repeat without inherited attempt keys', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@127.0.0.1:1/fixture_test');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    state.events = [];
    state.attempts.add('previous-e2e-checkout-attempt');
    await resetWithoutDatabase();
    expect(state.attempts.size).toBe(0);
    expect(state.events.slice(0, 4)).toEqual(['delete:emailDelivery', 'delete:checkoutAttempt', 'delete:cartReminderPreference', 'delete:reviewPhotoUpload']);
    const order = state.events.indexOf('delete:order');
    const user = state.events.indexOf('delete:user');
    expect(state.events.indexOf('delete:checkoutAttempt')).toBeLessThan(order);
    expect(state.events.indexOf('delete:emailDelivery')).toBeLessThan(order);
    expect(state.events.indexOf('delete:cartReminderPreference')).toBeLessThan(user);
    expect(state.events.indexOf('delete:reviewPhotoUpload')).toBeLessThan(user);
    expect(state.events.indexOf('delete:couponRedemption')).toBeLessThan(state.events.indexOf('delete:coupon'));
    state.events = [];
    state.attempts.add('next-e2e-checkout-attempt');
    await resetWithoutDatabase();
    expect(state.attempts.size).toBe(0);
    expect(state.events.indexOf('delete:checkoutAttempt')).toBeLessThan(state.events.indexOf('create:user'));
  });
});
