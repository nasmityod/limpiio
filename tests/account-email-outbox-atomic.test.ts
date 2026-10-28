import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emailOutboxTransaction } from '@/lib/email-outbox-context';

const h = vi.hoisted(() => ({
  user: { id: 'user', name: 'Original', email: 'old@example.test', pendingEmail: null as string | null, emailChangeToken: null as string | null },
  queued: [] as { kind: string; to: string }[], fail: '' as string,
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('next-auth/next', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'user' } })) }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/security', () => ({ hashToken: (token: string) => `hash:${token}` }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/emails/transactional/site', () => ({ emailSiteBaseUrl: () => 'https://local.example.test' }));
vi.mock('@/lib/resend', () => ({
  sendEmailChangeConfirmEmail: vi.fn(async ({ to }: { to: string }) => {
    expect(emailOutboxTransaction()).toBeTruthy();
    if (h.fail === 'confirm') throw new Error('Outbox insert unavailable');
    h.queued.push({ kind: 'confirm', to });
  }),
  sendEmailChangeNoticeEmail: vi.fn(async ({ to }: { to: string }) => {
    expect(emailOutboxTransaction()).toBeTruthy();
    if (h.fail === 'notice') throw new Error('Outbox insert unavailable');
    h.queued.push({ kind: 'notice', to });
  }),
}));
import { updateUserDetails } from '@/app/account/actions';

beforeEach(() => {
  vi.clearAllMocks(); h.fail = ''; h.queued = [];
  h.user = { id: 'user', name: 'Original', email: 'old@example.test', pendingEmail: null, emailChangeToken: null };
  h.prisma.user.findUnique.mockImplementation(async ({ where }) => where.id === 'user' || where.email === h.user.email ? { ...h.user } : null);
  h.prisma.user.update.mockImplementation(async ({ data, where }) => {
    if (where.email && where.email !== h.user.email) throw new Error('Identity changed concurrently');
    h.user = { ...h.user, ...data }; return h.user;
  });
  h.prisma.$transaction.mockImplementation(async fn => {
    const before = { ...h.user }; const queued = [...h.queued];
    try { return await fn(h.prisma); } catch (error) { h.user = before; h.queued = queued; throw error; }
  });
});

describe('account email change commits token and durable notifications together', () => {
  it('persists both notices in the transaction while preserving the current login email', async () => {
    const result = await updateUserDetails({ name: 'Nuevo', email: 'new@example.test' });
    expect(result.success).toBe(true); expect(h.user.email).toBe('old@example.test');
    expect(h.user.pendingEmail).toBe('new@example.test'); expect(h.user.emailChangeToken).toContain('hash:');
    expect(h.queued).toEqual([{ kind: 'confirm', to: 'new@example.test' }, { kind: 'notice', to: 'old@example.test' }]);
    expect(emailOutboxTransaction()).toBeUndefined();
  });
  it.each(['confirm', 'notice'])('failure to enqueue %s rolls back the profile token and every queued notice', async failure => {
    h.fail = failure;
    const result = await updateUserDetails({ name: 'Nuevo', email: 'new@example.test' });
    expect(result.success).toBe(false); expect(h.user.name).toBe('Original');
    expect(h.user.pendingEmail).toBeNull(); expect(h.user.emailChangeToken).toBeNull();
    expect(h.queued).toEqual([]);
  });
  it('name-only change remains immediate without creating an email change request', async () => {
    expect((await updateUserDetails({ name: 'Nuevo', email: 'old@example.test' })).success).toBe(true);
    expect(h.user.name).toBe('Nuevo'); expect(h.user.pendingEmail).toBeNull();
    expect(h.queued).toEqual([]); expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
});
