import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'user', email: 'old@example.test', pendingEmail: 'new@example.test' as string | null, emailChangeToken: 'hash:old-token' as string | null, emailChangeTokenExpiry: new Date('2099-01-01') as Date | null },
  conflict: false, rotateAfterRead: false, resetTokens: 1,
  prisma: { user: { findUnique: vi.fn(), updateMany: vi.fn() }, passwordResetToken: { deleteMany: vi.fn() }, $executeRaw: vi.fn(), $transaction: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/security', () => ({ hashToken: (token: string) => `hash:${token}` }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => false), getClientIp: () => 'local' }));
import { GET } from '@/app/api/account/confirm-email/route';

const request = () => new Request('https://local.example.test/api/account/confirm-email?token=old-token');
beforeEach(() => {
  vi.clearAllMocks(); h.conflict = false; h.rotateAfterRead = false; h.resetTokens = 1;
  h.user = { id: 'user', email: 'old@example.test', pendingEmail: 'new@example.test', emailChangeToken: 'hash:old-token', emailChangeTokenExpiry: new Date('2099-01-01') };
  h.prisma.user.findUnique.mockImplementation(async ({ where }) => {
    if (where.email) return h.conflict ? { id: 'other' } : null;
    if (where.emailChangeToken !== h.user.emailChangeToken) return null;
    const snapshot = { ...h.user };
    if (h.rotateAfterRead) h.user = { ...h.user, pendingEmail: 'newer@example.test', emailChangeToken: 'hash:new-token', emailChangeTokenExpiry: new Date('2099-02-01') };
    return snapshot;
  });
  h.prisma.user.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.emailChangeToken !== h.user.emailChangeToken || where.pendingEmail !== h.user.pendingEmail ||
        (where.emailChangeTokenExpiry?.gt && !(h.user.emailChangeTokenExpiry! > where.emailChangeTokenExpiry.gt))) return { count: 0 };
    h.user = { ...h.user, ...data }; return { count: 1 };
  });
  h.prisma.passwordResetToken.deleteMany.mockImplementation(async () => { const count = h.resetTokens; h.resetTokens = 0; return { count }; });
  h.prisma.$executeRaw.mockResolvedValue(1);
  h.prisma.$transaction.mockImplementation(async fn => {
    const user = { ...h.user }; const resets = h.resetTokens;
    try { return await fn(h.prisma); } catch (error) { h.user = user; h.resetTokens = resets; throw error; }
  });
});

describe('email confirmation uses the exact observed token', () => {
  it('promotes email, consumes token and revokes outstanding resets in one transaction', async () => {
    const response = await GET(request());
    expect(response.headers.get('location')).toContain('emailChange=success');
    expect(h.user.email).toBe('new@example.test'); expect(h.user.pendingEmail).toBeNull();
    expect(h.resetTokens).toBe(0); expect(h.prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('an older valid confirmation cannot promote or clear a newer request', async () => {
    h.rotateAfterRead = true;
    const response = await GET(request());
    expect(response.headers.get('location')).toContain('emailChange=invalid');
    expect(h.user.email).toBe('old@example.test'); expect(h.user.pendingEmail).toBe('newer@example.test');
    expect(h.user.emailChangeToken).toBe('hash:new-token'); expect(h.resetTokens).toBe(1);
  });
  it.each(['expired', 'conflict'])('cleanup of an older %s token does not clear a newer request', async branch => {
    if (branch === 'expired') h.user.emailChangeTokenExpiry = new Date(0); else h.conflict = true;
    h.rotateAfterRead = true;
    await GET(request());
    expect(h.user.pendingEmail).toBe('newer@example.test'); expect(h.user.emailChangeToken).toBe('hash:new-token');
  });
  it('failure to revoke reset tokens rolls back email promotion and token consumption', async () => {
    h.prisma.passwordResetToken.deleteMany.mockRejectedValueOnce(new Error('DB unavailable'));
    const response = await GET(request());
    expect(response.headers.get('location')).toContain('emailChange=error');
    expect(h.user.email).toBe('old@example.test'); expect(h.user.emailChangeToken).toBe('hash:old-token'); expect(h.resetTokens).toBe(1);
  });
});
