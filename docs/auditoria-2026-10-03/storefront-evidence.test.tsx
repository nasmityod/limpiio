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
let cartApi: ReturnType<typeof useCart>;
function Harness() { cartApi = useCart(); return <div>{cartApi.cart.length}</div>; }
const requests: { url: string; options?: RequestInit }[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  requests.length = 0;
  state.session = { data: { user: { id: 'A' } }, status: 'authenticated' };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ items: [] }) };
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('reproduce: entrar al checkout antes del PATCH debounced vacía la línea recién agregada', async () => {
  await act(async () => { render(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { cartApi.silentAddToCart(product); });
  expect(cartApi.cart.length).toBe(1);
  await act(async () => { await cartApi.refreshCart(); });
  expect(cartApi.cart.length).toBe(0);
  expect(requests.some(r => r.url === '/api/cart/items')).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(requests.find(r => r.url === '/api/cart/items')?.options?.method).toBe('PATCH');
});

it('reproduce: un merge de A pendiente carga sus líneas en la sesión B si cambia de cuenta antes de terminar', async () => {
  let completeMerge!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { completeMerge = resolve; })));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CartProvider><Harness /></CartProvider>); });
  state.session = { data: null, status: 'unauthenticated' };
  await act(async () => { view.rerender(<CartProvider><Harness /></CartProvider>); });
  state.session = { data: { user: { id: 'B' } }, status: 'authenticated' };
  await act(async () => { view.rerender(<CartProvider><Harness /></CartProvider>); });
  await act(async () => { completeMerge({ ok: true, json: async () => ({ items: [{ id: 'line', productId: 'p', name: 'Carrito A', slug: 'p', price: 10, originalPrice: null, stock: 10, quantity: 2, category: 'Test', brand: null, images: [], freeShipping: false }] }) }); });
  expect(cartApi.cart.length).toBe(1);
  expect(cartApi.cart[0].name).toBe('Carrito A');
  expect(state.session.data?.user.id).toBe('B');
});
