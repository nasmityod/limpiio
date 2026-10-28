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
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); vi.clearAllMocks(); h.session = { data: null, status: 'unauthenticated' }; });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const apiLine = (id: string, quantity: number) => ({ productId: id, name: id, slug: id, price: 10, originalPrice: null, stock: 10, quantity, category: 'Test', brand: null, images: [], freeShipping: false });
async function pendingLogin() {
  h.session = { data: { user: { id: 'account' } }, status: 'authenticated' };
  localStorage.setItem('cart', JSON.stringify([{ ...product('old'), quantity: 2 }]));
  const writes: { url: string; options?: RequestInit }[] = [];
  const backend = new Map<string, number>();
  let complete!: (response: unknown) => void;
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    if (url === '/api/cart/merge') return new Promise(resolve => { complete = resolve; });
    if (options?.method === 'PATCH') {
      writes.push({ url, options });
      const body = JSON.parse(String(options.body)); backend.set(body.productId, body.quantity);
    }
    if (options?.method === 'DELETE') {
      writes.push({ url, options });
      if (url === '/api/cart') backend.clear(); else backend.delete(decodeURIComponent(url.split('/').at(-1)!));
    }
    return Promise.resolve({ ok: true, json: async () => ({ items: [...backend].map(([id, quantity]) => apiLine(id, quantity)) }) });
  }));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CartProvider><Harness /></CartProvider>); });
  const finish = async () => {
    backend.set('old', 3); backend.set('account-only', 1);
    await act(async () => { complete({ ok: true, json: async () => ({ items: [...backend].map(([id, quantity]) => apiLine(id, quantity)) }) }); });
  };
  return { finish, writes, backend, view };
}

it.each([false, true])('reconciles a full account cart before a concurrent addition (delete retry=%s)', async (failDeleteOnce) => {
  h.session = { data: { user: { id: 'account' } }, status: 'authenticated' };
  const backend = new Map(Array.from({ length: 25 }, (_, i) => [`account-${i}`, 1]));
  let finish!: (value: unknown) => void;
  let failed = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/cart/merge') return new Promise(resolve => { finish = resolve; });
    if (options?.method === 'DELETE') {
      if (failDeleteOnce && !failed) { failed = true; return { ok: false, status: 503 }; }
      backend.delete(decodeURIComponent(url.split('/').at(-1)!));
    }
    if (options?.method === 'PATCH') {
      const body = JSON.parse(String(options.body));
      if (!backend.has(body.productId) && backend.size >= 25) return { ok: false, status: 409 };
      backend.set(body.productId, body.quantity);
    }
    return { ok: true, json: async () => ({ items: [...backend].map(([id, quantity]) => apiLine(id, quantity)) }) };
  }));
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { api.silentAddToCart(product('new')); await vi.advanceTimersByTimeAsync(400); });
  await act(async () => { finish({ ok: true, json: async () => ({ items: [...backend].map(([id, quantity]) => apiLine(id, quantity)) }) }); });
  await act(async () => { await api.refreshCart(); });
  expect(backend.size).toBe(25);
  expect(backend.get('new')).toBe(1);
  expect(api.cart).toHaveLength(25);
  expect(new Set(api.cart.map(item => item.id))).toEqual(new Set(backend.keys()));
  await act(async () => { await api.refreshCart(); });
  expect(api.cart.some(item => item.id === 'new')).toBe(true);
});

it('discards a late capacity deletion after the account changes', async () => {
  h.session = { data: { user: { id: 'A' } }, status: 'authenticated' };
  let mergeCount = 0;
  let finishMerge!: (value: unknown) => void;
  let finishDelete!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/cart/merge') {
      mergeCount++;
      if (mergeCount === 1) return new Promise(resolve => { finishMerge = resolve; });
      return { ok: true, json: async () => ({ items: [apiLine('B-only', 1)] }) };
    }
    if (options?.method === 'DELETE') return new Promise(resolve => { finishDelete = resolve; });
    return { ok: true, json: async () => ({ items: [apiLine('B-only', 1)] }) };
  }));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { api.silentAddToCart(product('new')); });
  await act(async () => { finishMerge({ ok: true, json: async () => ({ items: Array.from({ length: 25 }, (_, i) => apiLine(`A-${i}`, 1)) }) }); });
  h.session = { data: { user: { id: 'B' } }, status: 'authenticated' };
  await act(async () => { view.rerender(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { finishDelete({ ok: true }); });
  await act(async () => { await api.refreshCart(); });
  expect(api.cart.map(item => item.id)).toEqual(['B-only']);
  expect(mergeCount).toBe(2);
});

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

it('a quantity edited during merge waits for the merge barrier and wins after debounce', async () => {
  const fixture = await pendingLogin();
  await act(async () => { api.updateQuantity('old', 5); await vi.advanceTimersByTimeAsync(400); });
  expect(fixture.writes).toEqual([]);
  await fixture.finish();
  await act(async () => { await api.refreshCart(); });
  expect(api.cart.find(item => item.id === 'old')?.quantity).toBe(5);
  expect(fixture.backend.get('old')).toBe(5);
});

it('removing during merge does not revive the removed line from the older merge response', async () => {
  const fixture = await pendingLogin();
  await act(async () => { api.removeFromCart('old'); });
  expect(fixture.writes).toEqual([]);
  await fixture.finish();
  await act(async () => { await api.refreshCart(); });
  expect(api.cart.map(item => item.id)).toEqual(['account-only']);
  expect(fixture.backend.has('old')).toBe(false);
});

it('clearing during merge removes account-only lines which were not visible yet', async () => {
  const fixture = await pendingLogin();
  await act(async () => { api.clearCart(); });
  await fixture.finish();
  await act(async () => { await api.refreshCart(); });
  expect(api.cart).toEqual([]); expect(fixture.backend.size).toBe(0);
});

it('clear followed by a new addition during merge preserves only the new intent in UI and DB', async () => {
  const fixture = await pendingLogin();
  await act(async () => { api.clearCart(); api.silentAddToCart(product('new')); await vi.advanceTimersByTimeAsync(400); });
  expect(fixture.writes).toEqual([]);
  await fixture.finish();
  await act(async () => { await api.refreshCart(); });
  expect(api.cart.map(item => item.id)).toEqual(['new']);
  expect([...fixture.backend]).toEqual([['new', 1]]);
  expect(fixture.writes.map(request => request.options?.method)).toEqual(['DELETE', 'PATCH']);
});

it('session revalidation while the initial merge waits does not discard local edits', async () => {
  const fixture = await pendingLogin();
  await act(async () => { api.updateQuantity('old', 5); });
  h.session = { data: null, status: 'loading' };
  await act(async () => { fixture.view.rerender(<CartProvider><Harness /></CartProvider>); });
  await fixture.finish();
  h.session = { data: { user: { id: 'account' } }, status: 'authenticated' };
  await act(async () => { fixture.view.rerender(<CartProvider><Harness /></CartProvider>); await api.refreshCart(); });
  expect(api.cart.find(item => item.id === 'old')?.quantity).toBe(5);
  expect(fixture.backend.get('old')).toBe(5);
});

it('a failed login merge followed by refresh preserves and retries the unmerged guest selection', async () => {
  h.session = { data: { user: { id: 'account' } }, status: 'authenticated' };
  localStorage.setItem('cart', JSON.stringify([{ ...product('guest'), quantity: 2 }]));
  const backend = new Map<string, number>([['account-only', 1]]);
  let attempts = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/cart/merge') {
      attempts++;
      if (attempts === 1) return { ok: false, status: 503 };
      for (const item of JSON.parse(String(options?.body)).items) backend.set(item.productId, item.quantity);
    }
    return { ok: true, json: async () => ({ items: [...backend].map(([id, quantity]) => apiLine(id, quantity)) }) };
  }));
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  expect(api.cart.map(item => item.id)).toEqual(['guest']);
  await act(async () => { await api.refreshCart(); });
  expect(api.cart.map(item => item.id)).toContain('guest');
  expect(backend.get('guest')).toBe(2);
});
