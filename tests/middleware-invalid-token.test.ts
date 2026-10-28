import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }));
import { proxy } from '@/proxy';
beforeEach(() => { vi.mocked(getToken).mockReset().mockResolvedValue(null); });
it('returns 401 for malformed admin credentials instead of throwing a server error', async () => {
  vi.mocked(getToken).mockRejectedValueOnce(new URIError('Malformed URI'));
  const response = await proxy(new NextRequest('http://localhost:3000/api/admin/stats', { headers: { authorization: 'Bearer %E0%A4%A' } }));
  expect(response.status).toBe(401);
});
it('keeps admin API requests unauthenticated without a token', async () => {
  const response = await proxy(new NextRequest('http://localhost:3000/api/admin/stats'));
  expect(response.status).toBe(401);
  expect(response.headers.get('content-security-policy')).toContain('nonce-');
});
it('redirects anonymous admin navigation to login', async () => {
  const response = await proxy(new NextRequest('http://localhost:3000/admin/orders'));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('http://localhost:3000/login');
});
it('passes an identified admin request to its authoritative route guard', async () => {
  vi.mocked(getToken).mockResolvedValueOnce({ sub: 'fixture-user' });
  const response = await proxy(new NextRequest('http://localhost:3000/api/admin/stats'));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
});
it('keeps cached public HTML CSP without request-specific nonces', async () => {
  const response = await proxy(new NextRequest('http://localhost:3000/product/fixture'));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.get('content-security-policy')).not.toContain('nonce-');
  expect(getToken).not.toHaveBeenCalled();
});
it('injects a nonce for dynamic HTML', async () => {
  const response = await proxy(new NextRequest('http://localhost:3000/login'));
  const nonce = response.headers.get('x-middleware-request-x-nonce');
  expect(nonce).toBeTruthy();
  expect(response.headers.get('content-security-policy')).toContain(`nonce-${nonce}`);
});
