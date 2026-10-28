/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WishlistProvider, useWishlist } from '@/context/WishlistContext';

const m = vi.hoisted(() => ({ session: { data: null as { user: { id: string } } | null, status: 'unauthenticated' }, get: vi.fn(), merge: vi.fn(), add: vi.fn(), remove: vi.fn(), clear: vi.fn(), toast: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: () => m.session }));
vi.mock('@/components/ui/use-toast', () => ({ toast: m.toast }));
vi.mock('@/app/actions/wishlistActions', () => ({ getWishlistAction: m.get, mergeWishlistAction: m.merge, addWishlistItemAction: m.add, removeWishlistItemAction: m.remove, clearWishlistAction: m.clear }));
const product = { id: 'guest-product', slug: 'guest-product', name: 'Guest product', description: '', price: 10, originalPrice: null, stock: 4, category: 'Fixture', brand: null, image: '', images: [], details: {}, freeShipping: false };
function View() {
  const { wishlist, addToWishlist } = useWishlist();
  return <><output>{wishlist.map(p => p.id).join(',')}</output><button type="button" onClick={() => addToWishlist(product)}>Add</button></>;
}
function mount() { return render(<WishlistProvider><View /></WishlistProvider>); }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); m.session = { data: null, status: 'unauthenticated' }; m.get.mockResolvedValue({ ok: true, items: [] }); m.merge.mockResolvedValue({ ok: true, items: [] }); });
afterEach(cleanup);

describe('Wishlist failure and account transitions', () => {
  it('preserves guest favourites on merge failure and retries after 30 seconds', async () => {
    vi.useFakeTimers();
    localStorage.setItem('wishlist', JSON.stringify([product]));
    m.session = { data: { user: { id: 'account-A' } }, status: 'authenticated' };
    m.merge.mockResolvedValueOnce({ ok: false, code: 'UNAVAILABLE' }).mockResolvedValueOnce({ ok: true, items: [product] });
    mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(localStorage.getItem('wishlist')).toContain('guest-product');
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); await Promise.resolve(); });
    expect(m.merge).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toBe('guest-product');
    expect(localStorage.getItem('wishlist')).toBeNull();
    vi.useRealTimers();
  });
  it('discards a delayed response from A when the current session changes to B', async () => {
    let resolveA!: (value: unknown) => void;
    m.get.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; })).mockResolvedValueOnce({ ok: true, items: [{ ...product, id: 'B-product' }] });
    m.session = { data: { user: { id: 'A' } }, status: 'authenticated' };
    const view = mount();
    await waitFor(() => expect(m.get).toHaveBeenCalledTimes(1));
    m.session = { data: { user: { id: 'B' } }, status: 'authenticated' };
    view.rerender(<WishlistProvider><View /></WishlistProvider>);
    await act(async () => resolveA({ ok: true, items: [{ ...product, id: 'A-private-product' }] }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('B-product'));
    expect(m.merge).not.toHaveBeenCalled();
  });
  it('does not optimistically display a rejected server addition', async () => {
    m.session = { data: { user: { id: 'A' } }, status: 'authenticated' };
    m.add.mockResolvedValue({ ok: false, code: 'LIMIT' });
    mount();
    await waitFor(() => expect(m.get).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
