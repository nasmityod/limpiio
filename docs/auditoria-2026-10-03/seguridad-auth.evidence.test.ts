import { describe, expect, it, vi } from 'vitest';

// Evidence test: users and mail provider are memory-only mocks.
const state = vi.hoisted(() => ({ user: null as any, lookups: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: {
  findUnique: state.lookups,
  create: async ({ data }: any) => { state.user = { id: 'pre-registered-user', isSuperAdmin: false,
    permissionsUpdatedAt: null, ...data }; return state.user; },
  upsert: async ({ update, create }: any) => {
    state.user = state.user ? { ...state.user, ...update } : { id: 'new-user', ...create }; return state.user;
  },
} } }));
vi.mock('next-auth', () => ({ default: () => async () => new Response('mock') }));
vi.mock('next-auth/providers/credentials', () => ({ default: (options: any) => ({ ...options, id: 'credentials' }) }));
vi.mock('next-auth/providers/google', () => ({ default: (options: any) => ({ ...options, id: 'google' }) }));
vi.mock('bcrypt', () => ({ default: {
  hashSync: () => 'dummy-hash', hash: async (value: string) => `hashed:${value}`,
  compare: async (value: string, hashed: string) => hashed === `hashed:${value}`,
} }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitCritical: async () => ({ limited: false }),
  getClientIp: () => 'test', hashForBucket: (x: string) => x }));
vi.mock('@/lib/security', () => ({ getActionClientIp: async () => 'test', hashToken: (x: string) => x,
  buildRateLimitedResponse: () => new Response('', { status: 429 }) }));
vi.mock('@/lib/safe-logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/resend', () => ({ sendWelcomeEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));

const { registerUserAction } = await import('@/app/actions/authActions');
const { authOptions } = await import('@/app/api/auth/[...nextauth]/route');

describe('Auditoria autenticacion con dependencias aisladas', () => {
  it('Google fusiona email con cuenta no verificada y conserva la contraseña del pre-registrador', async () => {
    state.lookups.mockImplementation(async () => state.user);
    const registered = await registerUserAction({ name: 'Attacker', email: 'victim@example.test', password: 'attacker-password' });
    expect(registered.success).toBe(true);
    const originalId = state.user.id;
    const originalPasswordHash = state.user.password;
    const accepted = await authOptions.callbacks!.signIn!({ account: { provider: 'google' },
      profile: { email_verified: true } } as any);
    expect(accepted).toBe(true);
    const token = await authOptions.callbacks!.jwt!({ token: {}, user: { email: 'victim@example.test', name: 'Victim' },
      account: { provider: 'google' } } as any);
    expect(token.id).toBe(originalId);
    expect(state.user.password).toBe(originalPasswordHash);
    const credentials: any = authOptions.providers.find((p: any) => p.id === 'credentials');
    const attackerLogin = await credentials.authorize({ email: 'victim@example.test', password: 'attacker-password' });
    expect(attackerLogin.id).toBe(originalId);
    expect(state.user.name).toBe('Victim');
  });
});
