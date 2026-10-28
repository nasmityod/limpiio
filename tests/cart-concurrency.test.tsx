/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { CartProvider, useCart } from '@/context/CartContext';
import type { Product } from '@/context/ProductContext';

const state = vi.hoisted(() => ({ session: { data: { user: { id: 'A' } } as { user: { id: string } } | null, status: 'authenticated' } }));
vi.mock('next-auth/react', () => ({ useSession: () => state.session }));
vi.mock('@/app/actions/productSnapshotActions', () => ({ getProductSnapshots: vi.fn() }));
vi.mock('@/lib/ga4', () => ({ track: vi.fn(), toGa4Item: (x: unknown) => x, ga4ItemsValue: () => 0, GA4_CURRENCY: 'USD' }));

const product: Product = { id: 'p', name: 'Test', description: '', price: 10, stock: 10, category: 'Test', image: '/placeholder-product.png', images: [], details: {}, freeShipping: false };
const line = (quantity: number, name = 'Test') => ({ productId: 'p', name, slug: 'p', price: 10, originalPrice: null, stock: 10, quantity, category: 'Test', brand: null, images: [], freeShipping: false });
let api: ReturnType<typeof useCart>;
function Harness() {
  const current = useCart();
  React.useEffect(() => { api = current; }, [current]);
  return <div>{current.cart.map(x => x.name).join(',')}</div>;
}
const requests: { url: string; options?: RequestInit }[] = [];
let backendQuantity = 0;
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); requests.length = 0; backendQuantity = 0;
  state.session = { data: { user: { id: 'A' } }, status: 'authenticated' };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url, options });
    if (options?.method === 'PATCH') backendQuantity = JSON.parse(String(options.body)).quantity;
    if (options?.method === 'DELETE') backendQuantity = 0;
    return { ok: true, json: async () => ({ items: backendQuantity ? [line(backendQuantity)] : [] }) };
  }));
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('flushes a new quantity before checkout refresh so GET does not erase it', async () => {
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { api.silentAddToCart(product); await api.refreshCart(); });
  expect(api.cart[0]?.quantity).toBe(1);
  const write = requests.findIndex(x => x.options?.method === 'PATCH');
  const read = requests.findIndex(x => x.url === '/api/cart' && x.options?.method !== 'DELETE');
  expect(write).toBeGreaterThan(-1); expect(read).toBeGreaterThan(write);
});

it('ignores an older merge after switching account, even when its fetch resolves late', async () => {
  const completions: ((value: unknown) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { completions.push(resolve); })));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CartProvider><Harness /></CartProvider>); });
  state.session = { data: { user: { id: 'B' } }, status: 'authenticated' };
  await act(async () => { view.rerender(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { completions[1]({ ok: true, json: async () => ({ items: [line(3, 'Cuenta B')] }) }); });
  await act(async () => { completions[0]({ ok: true, json: async () => ({ items: [line(2, 'Cuenta A')] }) }); });
  expect(api.cart.map(x => x.name)).toEqual(['Cuenta B']);
});

it('serializes slow PATCH before DELETE to prevent a removed item from returning', async () => {
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  let finish!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
    requests.push({ url, options });
    if (options?.method === 'PATCH') return new Promise(resolve => { finish = resolve; });
    return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
  }));
  await act(async () => { api.silentAddToCart(product); await vi.advanceTimersByTimeAsync(400); api.removeFromCart('p'); });
  expect(requests.filter(x => x.options?.method === 'DELETE')).toHaveLength(0);
  await act(async () => { finish({ ok: true }); });
  expect(requests.filter(x => x.options?.method === 'DELETE')).toHaveLength(1);
  expect(api.cart).toEqual([]);
});

it('retries a failed DELETE before a later refresh, including an empty local cart', async () => {
  backendQuantity = 1;
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  let failed = false;
  const previous = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE' && !failed) { failed = true; return { ok: false, status: 503 }; }
    return previous(url, options);
  }));
  await act(async () => { api.removeFromCart('p'); });
  await act(async () => { await api.refreshCart(); });
  expect(backendQuantity).toBe(0); expect(api.cart).toEqual([]);
});

it('does not show a stored account cart to a logged-out visitor', async () => {
  state.session = { data: null, status: 'unauthenticated' };
  localStorage.setItem('cart-owner', 'A'); localStorage.setItem('cart', JSON.stringify([{ ...product, quantity: 2 }]));
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  expect(api.cart).toEqual([]); expect(localStorage.getItem('cart-owner')).toBeNull();
});

it('preserves pending quantity when the same session revalidates', async () => {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { api.silentAddToCart(product, 3); });
  state.session = { data: null, status: 'loading' };
  await act(async () => { view.rerender(<CartProvider><Harness /></CartProvider>); });
  state.session = { data: { user: { id: 'A' } }, status: 'authenticated' };
  await act(async () => { view.rerender(<CartProvider><Harness /></CartProvider>); await api.refreshCart(); });
  expect(api.cart[0]?.quantity).toBe(3); expect(backendQuantity).toBe(3);
});
