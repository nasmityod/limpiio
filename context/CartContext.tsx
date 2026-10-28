'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { Product } from './ProductContext';
import type { CartItemAPI } from '@/lib/definitions';
import { getProductSnapshots } from '@/app/actions/productSnapshotActions';
import { firstCardImage } from '@/lib/product-media';
import { track, toGa4Item, ga4ItemsValue, GA4_CURRENCY } from '@/lib/ga4';

interface CartItem extends Product {
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  isCartLoading: boolean;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  /** PRD-061/096: re-valida precio/stock de los ítems contra la BD. */
  refreshCart: () => Promise<void>;
  itemAdded: boolean;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  silentAddToCart: (product: Product, quantity?: number) => void;
  notification: { message: string; type: 'success' | 'error' } | null;
  showNotification: (message: string, type: 'success' | 'error') => void;
  /** Texto del último anuncio accesible (aria-live). Solo lectura para UI. */
  announcement: string;
}

/**
 * PERF-2026-08 — Separación estado / acciones.
 *
 * `CartContext` cambia de identidad cada vez que cambia CUALQUIER parte del
 * estado del carrito (cart, isCartOpen, itemAdded, notification, announcement).
 * Como `ProductCard` consumía `useCart()` solo para obtener `addToCart`, cada
 * apertura del drawer o cada alta re-renderizaba TODAS las tarjetas del home.
 *
 * `CartActionsContext` expone únicamente funciones de identidad estable, así
 * que sus consumidores NO se re-renderizan por cambios de estado del carrito.
 * Memoizar el value original no bastaba: el value cambia legítimamente con el
 * estado; lo que hace falta es que las tarjetas no dependan del estado.
 */
export interface CartActions {
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  refreshCart: () => Promise<void>;
  openCart: () => void;
  closeCart: () => void;
  silentAddToCart: (product: Product, quantity?: number) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const CartActionsContext = createContext<CartActions | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

/**
 * Acceso solo-acciones al carrito. Preferir sobre `useCart()` en componentes
 * que no necesitan leer el estado (botones de añadir, tarjetas de producto…).
 */
export const useCartActions = () => {
  const context = useContext(CartActionsContext);
  if (!context) {
    throw new Error('useCartActions must be used within a CartProvider');
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

/** Convierte un CartItemAPI (respuesta de BD) al shape CartItem que usa el contexto. */
function apiItemToCartItem(item: CartItemAPI): CartItem {
  return {
    id: item.productId,
    slug: item.slug,
    name: item.name,
    description: '',
    price: item.price,
    originalPrice: item.originalPrice,
    stock: item.stock,
    category: item.category,
    brand: item.brand,
    image: item.images[0] ?? '/placeholder-product.png',
    images: item.images,
    details: {},
    quantity: item.quantity,
    // La BD es la fuente de verdad: reemplaza cualquier valor viejo del cliente.
    freeShipping: item.freeShipping === true,
  };
}

/** Milisegundos mínimos entre refresh automáticos (focus/apertura del drawer). */
const REFRESH_MIN_INTERVAL_MS = 30_000;
/** Debounce del sync de cantidades hacia la BD (PRD-097). */
const SYNC_DEBOUNCE_MS = 400;
const MAX_CART_ITEMS = 25;

/** AbortSignal.timeout is unavailable in some browsers supported by this app. */
async function cartFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 15_000);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}

export const CartProvider = ({ children }: CartProviderProps) => {
  const { data: session, status: sessionStatus } = useSession();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartLoading, setIsCartLoading] = useState(true);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [itemAdded, setItemAdded] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const [announcement, setAnnouncement] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Anuncia un texto en la región aria-live, limpiando y re-asentando para
   *  que lectores de pantalla lean incluso texto repetido. */
  const announce = useCallback((text: string) => {
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    // Limpiar primero para que el lector detecte cambio aunque sea el mismo texto
    setAnnouncement('');
    announceTimerRef.current = setTimeout(() => {
      setAnnouncement(text);
    }, 50);
  }, []);

  // Cleanup del timer al desmontar
  useEffect(() => {
    return () => {
      if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    };
  }, []);

  /** Sanea el nombre del producto: trunca a 60 caracteres para anuncios. */
  const safeName = (name: string) => name.length > 60 ? name.slice(0, 57) + '…' : name;

  /**
   * hasMergedRef: se activa al completar el merge al login para no repetirlo.
   * Se resetea al cerrar sesión.
   */
  const mergedForUserRef = useRef<string | null>(null);

  /**
   * prevUserIdRef: distingue "logout real" (había sesión y dejó de haberla)
   * de "visitante que nunca inició sesión" — al visitante no se le borra
   * su carrito local (PRD-261 / PRD-263).
   */
  const prevUserIdRef = useRef<string | null>(null);
  const persistedOwnerRef = useRef<string | null>(null);
  const storedAccountCartRef = useRef<CartItem[]>([]);

  /** Refs para el sync debounced por producto (PRD-097: evita PATCH fuera de orden). */
  const syncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingQtyRef = useRef<Map<string, number>>(new Map());
  const pendingDeletesRef = useRef<Set<string>>(new Set());
  const pendingClearRef = useRef(false);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  const mutationVersionRef = useRef(0);
  const localEditsRef = useRef(new Map<string, number>());
  const localClearVersionRef = useRef(0);
  const syncFailedRef = useRef(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  /** Refs para refresh: estado vivo del carrito y throttle de refresco. */
  const cartRef = useRef<CartItem[]>(cart);
  cartRef.current = cart;
  const isAuthedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const resolvedUserId = sessionStatus === 'loading' ? prevUserIdRef.current ?? undefined : session?.user?.id ?? null;
  userIdRef.current = resolvedUserId ?? null;
  isAuthedRef.current = !!userIdRef.current;
  const lastRefreshRef = useRef(0);
  const commitCart = useCallback((next: CartItem[] | ((items: CartItem[]) => CartItem[])) => {
    const items = typeof next === 'function' ? next(cartRef.current) : next;
    cartRef.current = items;
    setCart(items);
  }, []);

  const cancelPendingSync = useCallback((productId: string) => {
    const timer = syncTimersRef.current.get(productId);
    if (timer) clearTimeout(timer);
    syncTimersRef.current.delete(productId);
    pendingQtyRef.current.delete(productId);
  }, []);

  /** Serialize all writes: a slow older PATCH must not win after DELETE/newer PATCH. */
  const queueMutation = useCallback((url: string, options: RequestInit, retry?: () => void) => {
    const actor = userIdRef.current;
    const generation = generationRef.current;
    if (!actor) return;
    mutationVersionRef.current += 1;
    const next = mutationQueueRef.current.then(async () => {
      if (generation !== generationRef.current || actor !== userIdRef.current) return;
      try {
        const response = await cartFetch(url, options);
        if (!response.ok) throw new Error(`Cart sync HTTP ${response.status}`);
      } catch (error) {
        if (generation !== generationRef.current || actor !== userIdRef.current) return;
        syncFailedRef.current = true;
        retry?.();
        setNotification({ message: 'No se pudo sincronizar el carrito. Conservamos tu selección; vuelve a intentarlo.', type: 'error' });
        console.error('[CartContext] Error sync:', error);
      }
    });
    mutationQueueRef.current = next;
  }, []);

  const flushCartSync = useCallback(async () => {
    const generation = generationRef.current;
    const actor = userIdRef.current;
    await mutationQueueRef.current;
    if (generation !== generationRef.current || actor !== userIdRef.current) return false;
    syncFailedRef.current = false;
    if (pendingClearRef.current) {
      pendingClearRef.current = false;
      pendingDeletesRef.current.clear();
      queueMutation('/api/cart', { method: 'DELETE' }, () => { pendingClearRef.current = true; });
      for (const item of cartRef.current) pendingQtyRef.current.set(item.id, item.quantity);
    }
    for (const productId of [...pendingDeletesRef.current]) {
      pendingDeletesRef.current.delete(productId);
      if (cartRef.current.some(item => item.id === productId)) continue;
      queueMutation(`/api/cart/items/${encodeURIComponent(productId)}`, { method: 'DELETE' }, () => {
        if (!cartRef.current.some(item => item.id === productId)) pendingDeletesRef.current.add(productId);
      });
    }
    for (const [productId, quantity] of [...pendingQtyRef.current]) {
      cancelPendingSync(productId);
      queueMutation('/api/cart/items', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      }, () => {
        if (cartRef.current.find(item => item.id === productId)?.quantity === quantity && !pendingQtyRef.current.has(productId)) pendingQtyRef.current.set(productId, quantity);
      });
    }
    let queue = mutationQueueRef.current;
    await queue;
    while (queue !== mutationQueueRef.current) {
      queue = mutationQueueRef.current;
      await queue;
    }
    return !syncFailedRef.current;
  }, [cancelPendingSync, queueMutation]);

  const showNotification = useCallback((message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── 1. Carga inicial desde localStorage ───────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cart');
      persistedOwnerRef.current = localStorage.getItem('cart-owner');
      if (stored) {
        const parsed = JSON.parse(stored) as (CartItem & { freeShipping?: unknown })[];
        // Fail-safe para carritos guardados antes de este campo: nunca asumir
        // `true` por ausencia/`undefined` — solo un `true` explícito califica.
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          const sanitized = parsed.filter(item => {
            if (!item || typeof item.id !== 'string' || seen.has(item.id)) return false;
            if (typeof item.name !== 'string' || typeof item.category !== 'string' || !Array.isArray(item.images) || !item.images.every(src => typeof src === 'string')) return false;
            if (!Number.isFinite(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.stock) || item.stock < 1) return false;
            seen.add(item.id);
            return true;
          }).slice(0, MAX_CART_ITEMS).map(item => ({ ...item, quantity: Math.min(Math.floor(item.quantity), Math.floor(item.stock)), freeShipping: item.freeShipping === true }));
          if (persistedOwnerRef.current) storedAccountCartRef.current = sanitized;
          else commitCart(sanitized);
        }
      }
    } catch {
      commitCart([]);
    } finally {
      setIsCartLoading(false);
      setStorageLoaded(true);
    }
  }, [commitCart]);

  // ── 2. Persistencia en localStorage (siempre, como respaldo) ──────────────
  useEffect(() => {
    if (isCartLoading || !storageLoaded || sessionStatus === 'loading') return;
    if (prevUserIdRef.current !== userIdRef.current || (persistedOwnerRef.current && persistedOwnerRef.current !== userIdRef.current)) return;
    try {
      localStorage.setItem('cart', JSON.stringify(cart));
      if (userIdRef.current) localStorage.setItem('cart-owner', userIdRef.current);
      else localStorage.removeItem('cart-owner');
    } catch {
      // Safari modo privado / cuota agotada
    }
  }, [cart, isCartLoading, sessionStatus, storageLoaded]);

  const mergeAccountCart = useCallback((userId: string, generation: number, signal: AbortSignal = new AbortController().signal): Promise<void> => {
    const controller = { signal };
    const localItems = cartRef.current.map(item => ({ productId: item.id, quantity: item.quantity }));
    setIsCartLoading(true);
    const startedAtVersion = mutationVersionRef.current;
    return cartFetch('/api/cart/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: localItems }),
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Cart merge HTTP ${r.status}`);
        return r.json();
      })
      .then(async (data: { items?: CartItemAPI[] }) => {
        if (controller.signal.aborted || generation !== generationRef.current || userId !== userIdRef.current) return;
        if (Array.isArray(data.items)) {
          // PRD-096: la respuesta del merge trae precio/stock frescos de BD —
          // reemplaza el snapshot local para no arrastrar datos obsoletos.
          // Preserve intents made while this request was pending. Subsequent
          // writes wait for the merge, so its older snapshot cannot win in DB.
          const current = cartRef.current;
          const currentById = new Map(current.map(item => [item.id, item]));
          const edited = (id: string) => (localEditsRef.current.get(id) ?? 0) > startedAtVersion;
          const cleared = localClearVersionRef.current > startedAtVersion;
          const fresh = data.items.map(apiItemToCartItem)
            .filter(item => !cleared && (!edited(item.id) || currentById.has(item.id)))
            .map(item => edited(item.id) ? { ...item, quantity: Math.min(currentById.get(item.id)!.quantity, item.stock) } : item)
            .filter(item => item.quantity > 0 && item.stock > 0);
          const freshIds = new Set(fresh.map(item => item.id));
          const added = current.filter(item => edited(item.id) && !freshIds.has(item.id));
          const combined = [...fresh, ...added];
          const selected = combined.length <= MAX_CART_ITEMS ? combined :
            [...combined.filter(item => edited(item.id)), ...combined.filter(item => !edited(item.id))].slice(0, MAX_CART_ITEMS);
          commitCart(selected);
          // Free the capacity discarded by the local reconciliation before
          // the queued additions run. Otherwise a full account cart rejects
          // the new line forever while the UI already shows it.
          const selectedIds = new Set(selected.map(item => item.id));
          for (const item of fresh) {
            if (selectedIds.has(item.id)) continue;
            if (controller.signal.aborted || generation !== generationRef.current || userId !== userIdRef.current) return;
            pendingDeletesRef.current.add(item.id);
            try {
              const response = await cartFetch(`/api/cart/items/${encodeURIComponent(item.id)}`, { method: 'DELETE', signal: controller.signal });
              if (controller.signal.aborted || generation !== generationRef.current || userId !== userIdRef.current) return;
              if (!response.ok) throw new Error(`Cart capacity sync HTTP ${response.status}`);
              pendingDeletesRef.current.delete(item.id);
            } catch (error) {
              if (controller.signal.aborted || generation !== generationRef.current || userId !== userIdRef.current) return;
              syncFailedRef.current = true;
              setNotification({ message: 'No se pudo sincronizar el carrito. Conservamos tu selección; vuelve a intentarlo.', type: 'error' });
              console.error('[CartContext] Error capacity sync:', error);
            }
          }
          if (controller.signal.aborted || generation !== generationRef.current || userId !== userIdRef.current) return;
          mergedForUserRef.current = userId;
          lastRefreshRef.current = Date.now();
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('[CartContext] Error en merge con BD:', err);
        if (generation === generationRef.current) setNotification({ message: 'No se pudo cargar el carrito de tu cuenta. Conservamos tu selección.', type: 'error' });
      })
      .finally(() => {
        if (generation === generationRef.current && userId === userIdRef.current) setIsCartLoading(false);
      });
  }, [commitCart]);

  // ── 3. Merge al detectar sesión activa ────────────────────────────────────
  useEffect(() => {
    if (resolvedUserId === undefined) return;
    if (!storageLoaded) return;

    const userId = resolvedUserId;

    const previousUserId = prevUserIdRef.current;
    if (userId && previousUserId === userId && mergedForUserRef.current === userId) return;
    const changedAccount = (previousUserId !== userId && previousUserId != null)
      || (persistedOwnerRef.current != null && persistedOwnerRef.current !== userId);
    if (persistedOwnerRef.current === userId && userId && storedAccountCartRef.current.length) {
      commitCart(storedAccountCartRef.current);
    }
    persistedOwnerRef.current = userId;
    storedAccountCartRef.current = [];
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    for (const id of [...pendingQtyRef.current.keys()]) cancelPendingSync(id);
    pendingDeletesRef.current.clear();
    pendingClearRef.current = false;
    mutationQueueRef.current = Promise.resolve();
    refreshPromiseRef.current = null;
    syncFailedRef.current = false;
    localEditsRef.current.clear();
    localClearVersionRef.current = 0;

    if (!userId) {
      // El usuario cerró sesión: reiniciar flag para el próximo login
      mergedForUserRef.current = null;

      /*
       * PRD-261 / PRD-263: en un PC/tablet compartido (mostrador de la tienda)
       * el carrito del cliente anterior NO debe quedar visible para el
       * siguiente. Solo se limpia cuando hubo una sesión antes (logout real);
       * el carrito del usuario sigue guardado en BD y se restaura en su
       * próximo login vía /api/cart/merge.
       */
      if (prevUserIdRef.current || changedAccount) {
        prevUserIdRef.current = null;
        commitCart([]);
        try {
          localStorage.removeItem('cart');
          localStorage.removeItem('cart-owner');
        } catch {
          /* Safari modo privado */
        }
      }
      setIsCartLoading(false);
      return;
    }

    prevUserIdRef.current = userId;

    if (changedAccount) {
      commitCart([]);
      mergedForUserRef.current = null;
    }
    if (mergedForUserRef.current === userId) return;

    mutationQueueRef.current = mergeAccountCart(userId, generation, controller.signal);
    return () => controller.abort();
  }, [resolvedUserId, storageLoaded, cancelPendingSync, commitCart, mergeAccountCart]);

  useEffect(() => () => {
    generationRef.current += 1;
    for (const id of [...pendingQtyRef.current.keys()]) cancelPendingSync(id);
  }, [cancelPendingSync]);

  // ── Refresh de precio/stock (PRD-061 invitado, PRD-096/234 sesión) ────────

  const refreshCart = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const items = cartRef.current;
    if (items.length === 0 && !userIdRef.current) return;
    const generation = generationRef.current;
    const actor = userIdRef.current;
    const refresh = (async () => {

    try {
      if (actor) {
        // A failed initial merge must be retried before accepting account GET.
        await mutationQueueRef.current;
        if (generation !== generationRef.current || actor !== userIdRef.current) return;
        if (mergedForUserRef.current !== actor) {
          const retry = mergeAccountCart(actor, generation);
          mutationQueueRef.current = retry;
          await retry;
          if (mergedForUserRef.current !== actor) return;
        }
        if (!await flushCartSync()) return;
        if (generation !== generationRef.current || actor !== userIdRef.current) return;
        const version = mutationVersionRef.current;
        // Con sesión, la BD es la fuente de verdad del carrito.
        const res = await cartFetch('/api/cart', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as { items?: CartItemAPI[] };
          if (generation !== generationRef.current || actor !== userIdRef.current || version !== mutationVersionRef.current || pendingQtyRef.current.size > 0) return;
          if (Array.isArray(data.items)) {
            commitCart(data.items.map(apiItemToCartItem));
          }
        }
      } else {
        // Invitado: re-validar el snapshot de localStorage contra la BD.
        const snapshots = await getProductSnapshots(items.map((i) => i.id));
        if (generation !== generationRef.current || actor !== userIdRef.current) return;
        if (snapshots) {
          const byId = new Map(snapshots.map((s) => [s.id, s]));
          const requestedIds = new Set(items.map(item => item.id));
          commitCart((prev) =>
            prev
              .filter((i) => !requestedIds.has(i.id) || byId.has(i.id))
              .map((i) => {
                const s = byId.get(i.id);
                if (!s) return i;
                return {
                  ...i,
                  slug: s.slug,
                  name: s.name,
                  price: s.price,
                  originalPrice: s.originalPrice,
                  stock: s.stock,
                  image: firstCardImage(s.images) ?? i.image,
                  images: s.images,
                  quantity: Math.max(1, Math.min(i.quantity, s.stock)),
                  // La BD es la fuente de verdad: reemplaza el valor viejo de localStorage.
                  freeShipping: s.freeShipping === true,
                };
              })
              .filter((i) => i.stock > 0),
          );
        }
      }
      lastRefreshRef.current = Date.now();
    } catch (err) {
      console.error('[CartContext] Error al refrescar carrito:', err);
    } finally {
      // Clearing is done by the caller only for this exact in-flight promise.
    }
    })();
    refreshPromiseRef.current = refresh;
    try { await refresh; } finally {
      if (refreshPromiseRef.current === refresh) refreshPromiseRef.current = null;
    }
  }, [commitCart, flushCartSync, mergeAccountCart]);

  /** Refresh con throttle: para eventos frecuentes (focus, abrir drawer). */
  const refreshCartThrottled = useCallback(() => {
    if (Date.now() - lastRefreshRef.current < REFRESH_MIN_INTERVAL_MS) return;
    void refreshCart();
  }, [refreshCart]);

  // PRD-098: el merge ocurre una sola vez por sesión; al volver el foco a la
  // pestaña re-sincronizamos el carrito (otra pestaña/dispositivo pudo cambiarlo).
  useEffect(() => {
    const onFocus = () => refreshCartThrottled();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshCartThrottled]);

  const openCart = useCallback(() => {
    setIsCartOpen(true);
    // PRD-234/235: stock fresco antes de que el usuario ajuste cantidades.
    refreshCartThrottled();
    // FASE 4.4: view_cart al abrir el drawer.
    const items = cartRef.current.map((i) => toGa4Item(i));
    track('view_cart', {
      currency: GA4_CURRENCY,
      value: ga4ItemsValue(items),
      items,
    });
  }, [refreshCartThrottled]);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  // ── Helpers de sync con BD (debounced, último valor gana — PRD-097) ───────

  const dbUpsertItem = useCallback((productId: string, quantity: number) => {
    if (!isAuthedRef.current) return;
    pendingQtyRef.current.set(productId, quantity);
    mutationVersionRef.current += 1;

    const timers = syncTimersRef.current;
    const existing = timers.get(productId);
    if (existing) clearTimeout(existing);

    timers.set(
      productId,
      setTimeout(() => {
        timers.delete(productId);
        const qty = pendingQtyRef.current.get(productId);
        pendingQtyRef.current.delete(productId);
        if (qty === undefined) return;
        queueMutation('/api/cart/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, quantity: qty }),
        }, () => {
          if (cartRef.current.find(item => item.id === productId)?.quantity === qty && !pendingQtyRef.current.has(productId)) pendingQtyRef.current.set(productId, qty);
        });
      }, SYNC_DEBOUNCE_MS),
    );
  }, [queueMutation]);

  const dbRemoveItem = useCallback((productId: string) => {
    cancelPendingSync(productId);
    if (!isAuthedRef.current) return;
    queueMutation(`/api/cart/items/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    }, () => {
      if (!cartRef.current.some(item => item.id === productId)) pendingDeletesRef.current.add(productId);
    });
  }, [cancelPendingSync, queueMutation]);

  const dbClearCart = useCallback(() => {
    for (const id of [...pendingQtyRef.current.keys()]) cancelPendingSync(id);
    if (!isAuthedRef.current) return;
    queueMutation('/api/cart', {
      method: 'DELETE',
    }, () => { pendingClearRef.current = true; });
  }, [cancelPendingSync, queueMutation]);

  // ── Operaciones del carrito (UI optimista + sync BD) ──────────────────────

  /**
   * Inserta/incrementa dentro del updater funcional: la cantidad final se
   * calcula SIEMPRE sobre el estado más reciente (PRD-097, sin snapshot stale).
   */
  const applyAdd = useCallback(
    (product: Product, quantity: number) => {
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      quantity = Math.floor(quantity);
      if (quantity < 1 || !Number.isFinite(product.stock)) return;
      const prevItems = cartRef.current;
        const prev = prevItems.find((i) => i.id === product.id);
        if (prev) {
          const q = prev.quantity + quantity;
          if (q > product.stock) return;
          localEditsRef.current.set(product.id, ++mutationVersionRef.current);
          dbUpsertItem(product.id, q);
          commitCart(prevItems.map((i) => (i.id === product.id ? { ...i, quantity: q } : i)));
          return;
        }
        const q = Math.min(quantity, product.stock);
        if (q <= 0) return;
        if (prevItems.length >= MAX_CART_ITEMS) {
          setNotification({ message: 'Puedes agregar hasta 25 productos distintos por pedido.', type: 'error' });
          return;
        }
        localEditsRef.current.set(product.id, ++mutationVersionRef.current);
        dbUpsertItem(product.id, q);
        commitCart([...prevItems, { ...product, quantity: q }]);
    },
    [commitCart, dbUpsertItem],
  );

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    const prevItem = cartRef.current.find((i) => i.id === product.id);
    if (prevItem) {
      const newQty = prevItem.quantity + quantity;
      if (newQty > product.stock) {
        announce(`No hay suficiente stock de "${safeName(product.name)}". Máximo disponible: ${product.stock}.`);
      } else {
        announce(`"${safeName(product.name)}" actualizado: ${newQty} unidad(es) en el carrito.`);
      }
    } else {
      announce(`"${safeName(product.name)}" agregado al carrito.`);
    }
    applyAdd(product, quantity);
    setItemAdded(true);
    setTimeout(() => setItemAdded(false), 500);
    openCart();
    // FASE 4.4: evento GA4 (no-op sin NEXT_PUBLIC_GA4_ID / sin consentimiento).
    track('add_to_cart', {
      currency: GA4_CURRENCY,
      value: Math.round(product.price * quantity * 100) / 100,
      items: [toGa4Item({ ...product, quantity })],
    });
  }, [announce, applyAdd, openCart]);

  const silentAddToCart = useCallback((product: Product, quantity: number = 1) => {
    applyAdd(product, quantity);
  }, [applyAdd]);

  const removeFromCart = useCallback((productId: string) => {
    localEditsRef.current.set(productId, ++mutationVersionRef.current);
    const itemToRemove = cartRef.current.find((i) => i.id === productId);
    commitCart((prevItems) => prevItems.filter((i) => i.id !== productId));
    dbRemoveItem(productId);
    if (itemToRemove) {
      announce(`"${safeName(itemToRemove.name)}" eliminado del carrito.`);
      showNotification(`"${itemToRemove.name}" eliminado.`, 'success');
      track('remove_from_cart', {
        currency: GA4_CURRENCY,
        value: Math.round(itemToRemove.price * itemToRemove.quantity * 100) / 100,
        items: [toGa4Item(itemToRemove)],
      });
    }
  }, [announce, showNotification, dbRemoveItem, commitCart]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (!Number.isFinite(quantity)) return;
    quantity = Math.floor(quantity);
    const item = cartRef.current.find((i) => i.id === productId);
    if (!item) return;
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    if (item && quantity > item.stock) {
      announce(`No hay suficiente stock de "${safeName(item.name)}". Máximo disponible: ${item.stock}.`);
    } else if (item) {
      announce(`"${safeName(item.name)}" actualizado: ${quantity} unidad(es) en el carrito.`);
    }
    localEditsRef.current.set(productId, ++mutationVersionRef.current);
    commitCart((prevItems) =>
      prevItems.map((i) => {
        if (i.id !== productId) return i;
        const capped = Math.min(quantity, i.stock);
        dbUpsertItem(productId, capped);
        return { ...i, quantity: capped };
      }),
    );
  }, [announce, removeFromCart, dbUpsertItem, commitCart]);

  const clearCart = useCallback(() => {
    localClearVersionRef.current = ++mutationVersionRef.current;
    commitCart([]);
    dbClearCart();
  }, [dbClearCart, commitCart]);

  /* Lee del ref: mantiene la identidad estable sin depender del estado. */
  const getCartTotal = useCallback(
    () => cartRef.current.reduce((acc, item) => acc + item.price * item.quantity, 0),
    [],
  );

  /* Identidad estable: todas las dependencias son useCallback estables. */
  const actions = useMemo<CartActions>(
    () => ({
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getCartTotal,
      refreshCart,
      openCart,
      closeCart,
      silentAddToCart,
      showNotification,
    }),
    [
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getCartTotal,
      refreshCart,
      openCart,
      closeCart,
      silentAddToCart,
      showNotification,
    ],
  );

  return (
    <CartActionsContext.Provider value={actions}>
    <CartContext.Provider
      value={{
        cart,
        isCartLoading,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getCartTotal,
        refreshCart,
        itemAdded,
        isCartOpen,
        openCart,
        closeCart,
        silentAddToCart,
        notification,
        showNotification,
        announcement,
      }}
    >
      {children}
    </CartContext.Provider>
    </CartActionsContext.Provider>
  );
};
