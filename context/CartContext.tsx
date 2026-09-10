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

export const CartProvider = ({ children }: CartProviderProps) => {
  const { data: session, status: sessionStatus } = useSession();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartLoading, setIsCartLoading] = useState(true);
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
  const hasMergedRef = useRef(false);

  /**
   * prevUserIdRef: distingue "logout real" (había sesión y dejó de haberla)
   * de "visitante que nunca inició sesión" — al visitante no se le borra
   * su carrito local (PRD-261 / PRD-263).
   */
  const prevUserIdRef = useRef<string | null>(null);

  /** Refs para el sync debounced por producto (PRD-097: evita PATCH fuera de orden). */
  const syncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingQtyRef = useRef<Map<string, number>>(new Map());

  /** Refs para refresh: estado vivo del carrito y throttle de refresco. */
  const cartRef = useRef<CartItem[]>(cart);
  cartRef.current = cart;
  const isAuthedRef = useRef(false);
  isAuthedRef.current = !!session?.user?.id;
  const lastRefreshRef = useRef(0);
  const refreshingRef = useRef(false);

  const showNotification = useCallback((message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── 1. Carga inicial desde localStorage ───────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cart');
      if (stored) {
        const parsed = JSON.parse(stored) as (CartItem & { freeShipping?: unknown })[];
        // Fail-safe para carritos guardados antes de este campo: nunca asumir
        // `true` por ausencia/`undefined` — solo un `true` explícito califica.
        setCart(parsed.map((item) => ({ ...item, freeShipping: item.freeShipping === true })));
      }
    } catch {
      setCart([]);
    } finally {
      setIsCartLoading(false);
    }
  }, []);

  // ── 2. Persistencia en localStorage (siempre, como respaldo) ──────────────
  useEffect(() => {
    if (isCartLoading) return;
    try {
      localStorage.setItem('cart', JSON.stringify(cart));
    } catch {
      // Safari modo privado / cuota agotada
    }
  }, [cart, isCartLoading]);

  // ── 3. Merge al detectar sesión activa ────────────────────────────────────
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (isCartLoading) return; // esperar a que se cargue localStorage primero

    const userId = session?.user?.id ?? null;

    if (!userId) {
      // El usuario cerró sesión: reiniciar flag para el próximo login
      hasMergedRef.current = false;

      /*
       * PRD-261 / PRD-263: en un PC/tablet compartido (mostrador de la tienda)
       * el carrito del cliente anterior NO debe quedar visible para el
       * siguiente. Solo se limpia cuando hubo una sesión antes (logout real);
       * el carrito del usuario sigue guardado en BD y se restaura en su
       * próximo login vía /api/cart/merge.
       */
      if (prevUserIdRef.current) {
        prevUserIdRef.current = null;
        setCart([]);
        try {
          localStorage.removeItem('cart');
        } catch {
          /* Safari modo privado */
        }
      }
      return;
    }

    prevUserIdRef.current = userId;

    if (hasMergedRef.current) return; // ya se hizo el merge en esta sesión
    hasMergedRef.current = true;

    // Capturar ítems locales para fusionar con BD
    const localItems = cart.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
    }));

    setIsCartLoading(true);
    fetch('/api/cart/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: localItems }),
    })
      .then((r) => r.json())
      .then((data: { items?: CartItemAPI[] }) => {
        if (Array.isArray(data.items)) {
          // PRD-096: la respuesta del merge trae precio/stock frescos de BD —
          // reemplaza el snapshot local para no arrastrar datos obsoletos.
          setCart(data.items.map(apiItemToCartItem));
          lastRefreshRef.current = Date.now();
        }
      })
      .catch((err) => console.error('[CartContext] Error en merge con BD:', err))
      .finally(() => setIsCartLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, sessionStatus, isCartLoading]);

  // ── Refresh de precio/stock (PRD-061 invitado, PRD-096/234 sesión) ────────

  const refreshCart = useCallback(async () => {
    if (refreshingRef.current) return;
    const items = cartRef.current;
    if (items.length === 0) return;
    refreshingRef.current = true;

    try {
      if (isAuthedRef.current) {
        // Con sesión, la BD es la fuente de verdad del carrito.
        const res = await fetch('/api/cart', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as { items?: CartItemAPI[] };
          if (Array.isArray(data.items)) {
            setCart(data.items.map(apiItemToCartItem));
          }
        }
      } else {
        // Invitado: re-validar el snapshot de localStorage contra la BD.
        const snapshots = await getProductSnapshots(items.map((i) => i.id));
        if (snapshots) {
          const byId = new Map(snapshots.map((s) => [s.id, s]));
          setCart((prev) =>
            prev
              .filter((i) => byId.has(i.id)) // producto eliminado del catálogo
              .map((i) => {
                const s = byId.get(i.id)!;
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
      refreshingRef.current = false;
    }
  }, []);

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
        fetch('/api/cart/items', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, quantity: qty }),
        }).catch((err) => console.error('[CartContext] Error sync upsert:', err));
      }, SYNC_DEBOUNCE_MS),
    );
  }, []);

  const cancelPendingSync = (productId: string) => {
    const timer = syncTimersRef.current.get(productId);
    if (timer) clearTimeout(timer);
    syncTimersRef.current.delete(productId);
    pendingQtyRef.current.delete(productId);
  };

  const dbRemoveItem = useCallback((productId: string) => {
    cancelPendingSync(productId);
    if (!isAuthedRef.current) return;
    fetch(`/api/cart/items/${productId}`, {
      method: 'DELETE',
    }).catch((err) => console.error('[CartContext] Error sync remove:', err));
  }, []);

  const dbClearCart = useCallback(() => {
    for (const id of [...syncTimersRef.current.keys()]) cancelPendingSync(id);
    if (!isAuthedRef.current) return;
    fetch('/api/cart', {
      method: 'DELETE',
    }).catch((err) => console.error('[CartContext] Error sync clear:', err));
  }, []);

  // ── Operaciones del carrito (UI optimista + sync BD) ──────────────────────

  /**
   * Inserta/incrementa dentro del updater funcional: la cantidad final se
   * calcula SIEMPRE sobre el estado más reciente (PRD-097, sin snapshot stale).
   */
  const applyAdd = useCallback(
    (product: Product, quantity: number) => {
      setCart((prevItems) => {
        const prev = prevItems.find((i) => i.id === product.id);
        if (prev) {
          const q = prev.quantity + quantity;
          if (q > product.stock) return prevItems;
          dbUpsertItem(product.id, q);
          return prevItems.map((i) => (i.id === product.id ? { ...i, quantity: q } : i));
        }
        const q = Math.min(quantity, product.stock);
        if (q <= 0) return prevItems;
        dbUpsertItem(product.id, q);
        return [...prevItems, { ...product, quantity: q }];
      });
    },
    [dbUpsertItem],
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
    const itemToRemove = cartRef.current.find((i) => i.id === productId);
    setCart((prevItems) => prevItems.filter((i) => i.id !== productId));
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
  }, [announce, showNotification, dbRemoveItem]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    const item = cartRef.current.find((i) => i.id === productId);
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    if (item && quantity > item.stock) {
      announce(`No hay suficiente stock de "${safeName(item.name)}". Máximo disponible: ${item.stock}.`);
    } else if (item) {
      announce(`"${safeName(item.name)}" actualizado: ${quantity} unidad(es) en el carrito.`);
    }
    setCart((prevItems) =>
      prevItems.map((i) => {
        if (i.id !== productId) return i;
        const capped = Math.min(quantity, i.stock);
        dbUpsertItem(productId, capped);
        return { ...i, quantity: capped };
      }),
    );
  }, [announce, removeFromCart, dbUpsertItem]);

  const clearCart = useCallback(() => {
    setCart([]);
    dbClearCart();
  }, [dbClearCart]);

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
