import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));
vi.mock('next-auth/next', () => ({ getServerSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('Unexpected redirect'); } }));
vi.mock('@/lib/prisma', () => ({ prisma: { order: mocks } }));
vi.mock('@/components/account/OrderHistoryClient', () => ({ default: ({ orders }: { orders: unknown }) => <pre>{JSON.stringify(orders)}</pre> }));
vi.mock('@/components/account/ForbiddenBanner', () => ({ default: () => null }));
vi.mock('@/app/components/PaginationBar', () => ({ default: () => null }));
import AccountOrdersPage from '@/app/account/orders/page';

it('does not serialize internal notes, operator email or storage keys to order history', async () => {
  mocks.count.mockResolvedValue(1);
  mocks.findMany.mockResolvedValue([{
    id: 'order', orderNumber: 42, createdAt: new Date(), customerId: 'owner', customerName: 'Fixture',
    total: 20, status: 'Pendiente', paymentMethod: 'Transferencia', shippingAddress: '', shippingCity: '',
    shippingState: '', shippingZipCode: '', shippingCountry: 'Venezuela', items: [],
    notes: 'secret-internal-note', paymentVerifiedBy: 'operator@example.test', paymentProofKey: 'private-secret-key',
    paymentProofUrl: 'https://private.test/proof', casheaLastResponseCode: 'internal-provider-code',
  }]);
  const html = renderToStaticMarkup(await AccountOrdersPage({ searchParams: Promise.resolve({}) }));
  for (const value of ['secret-internal-note', 'operator@example.test', 'private-secret-key', 'https://private.test/proof', 'internal-provider-code']) expect(html).not.toContain(value);
  expect(html).toContain('Fixture');
  expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ where: { customerId: 'owner' }, take: 20 });
});
