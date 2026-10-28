/** @vitest-environment jsdom */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CartProvider, useCart } from '@/context/CartContext';
import type { Product } from '@/context/ProductContext';

const h = vi.hoisted(() => ({ session: { data: null as { user: { id: string } } | null, status: 'unauthenticated' }, snapshots: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: () => h.session }));
vi.mock('@/app/actions/productSnapshotActions', () => ({ getProductSnapshots: h.snapshots }));
vi.mock('@/lib/ga4', () => ({ track: vi.fn(), toGa4Item: (x: unknown) => x, ga4ItemsValue: () => 0, GA4_CURRENCY: 'USD' }));

const product = (id: string): Product => ({ id, name: id, description: '', price: 10, stock: 10, category: 'Test', image: '/placeholder-product.png', images: [], details: {}, freeShipping: false });
let api: ReturnType<typeof useCart>;
function Harness() {
  const current = useCart();
  React.useEffect(() => { api = current; }, [current]);
  return <div>{current.cart.map(x => x.id).join(',')}</div>;
}
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); h.session = { data: null, status: 'unauthenticated' }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps a guest product added while an earlier snapshot refresh is pending', async () => {
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { api.silentAddToCart(product('old')); });
  let finish!: (value: unknown) => void;
  h.snapshots.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let refresh!: Promise<void>;
  await act(async () => { refresh = api.refreshCart(); });
  await act(async () => { api.silentAddToCart(product('new')); });
  await act(async () => { finish([product('old')]); await refresh; });
  expect(api.cart.map(x => x.id)).toEqual(['old', 'new']);
});

it('keeps a local product added while the login merge is pending', async () => {
  h.session = { data: { user: { id: 'account' } }, status: 'authenticated' };
  let finish!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { api.silentAddToCart(product('new')); });
  await act(async () => { finish({ ok: true, json: async () => ({ items: [] }) }); });
  expect(api.cart.map(x => x.id)).toEqual(['new']);
});
