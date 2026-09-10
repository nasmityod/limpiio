'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Product } from './ProductContext';
import {
  getWishlistAction,
  mergeWishlistAction,
  addWishlistItemAction,
  removeWishlistItemAction,
  clearWishlistAction,
  type WishlistProductDTO,
} from '@/app/actions/wishlistActions';

const STORAGE_KEY = 'wishlist';

/**
 * PRD-100: tope de ítems persistidos en localStorage. Al superarlo se descarta
 * el más antiguo — evita crecer sin límite hasta agotar la cuota del navegador.
 */
const MAX_WISHLIST_ITEMS = 100;

/** DTO del servidor → tipo Product de la UI. */
function dtoToProduct(p: WishlistProductDTO): Product {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice,
    stock: p.stock,
    category: p.category,
    brand: p.brand,
    image: p.image,
    images: p.images,
    details: {},
    freeShipping: p.freeShipping === true,
  };
}

interface WishlistContextType {
  wishlist: Product[];
  isWishlistLoading: boolean;
  addToWishlist: (product: Product) => void;
  removeFromWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const { data: session, status: sessionStatus } = useSession();
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [isWishlistLoading, setIsWishlistLoading] = useState(true);

  /** Última sesión vista — para detectar logout real (PRD-262). */
  const prevUserIdRef = useRef<string | null>(null);
  /** FASE 4.6: si ya se fusionó local↔cuenta para el usuario actual. */
  const mergedForUserRef = useRef<string | null>(null);
  /** Sesión activa (para que los handlers sincronicen con el servidor). */
  const isAuthedRef = useRef(false);

  // Hidratación desde localStorage (solo en cliente)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWishlist(JSON.parse(stored));
      }
    } catch {
      setWishlist([]);
    } finally {
      setIsWishlistLoading(false);
    }
  }, []);

  /*
   * PRD-262: al cerrar sesión en un dispositivo compartido, la wishlist del
   * cliente anterior no debe quedar visible para el siguiente. Solo se limpia
   * en el logout real — al visitante anónimo no se le toca su lista.
   *
   * FASE 4.6 (MEJORA 3.2): al INICIAR sesión se fusiona la lista local con la
   * de la cuenta (unión sin duplicados, servidor como fuente de verdad) y se
   * limpia la copia local — multi-dispositivo sin perder lo guardado.
   */
  useEffect(() => {
    if (sessionStatus === 'loading' || isWishlistLoading) return;

    const userId = session?.user?.id ?? null;
    isAuthedRef.current = Boolean(userId);

    if (!userId) {
      mergedForUserRef.current = null;
      if (prevUserIdRef.current) {
        prevUserIdRef.current = null;
        setWishlist([]);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* Safari modo privado */
        }
      }
      return;
    }

    prevUserIdRef.current = userId;
    if (mergedForUserRef.current === userId) return;
    mergedForUserRef.current = userId;

    let cancelled = false;
    (async () => {
      try {
        let localIds: string[] = [];
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            localIds = (JSON.parse(stored) as Product[]).map((p) => p.id);
          }
        } catch { /* JSON corrupto — se ignora el local */ }

        const merged = localIds.length > 0
          ? await mergeWishlistAction(localIds)
          : await getWishlistAction();

        if (cancelled) return;
        setWishlist(merged.map(dtoToProduct));
        // La cuenta es ahora la fuente de verdad: limpiar copia local del invitado.
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch { /* noop */ }
      } catch (err) {
        console.error('[WishlistProvider] merge con la cuenta falló:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, sessionStatus, isWishlistLoading]);

  // Persistencia local: SOLO para invitados (con cuenta, la BD es la fuente).
  useEffect(() => {
    if (isWishlistLoading || isAuthedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      /* Safari modo privado / cuota excedida */
    }
  }, [wishlist, isWishlistLoading]);

  const addToWishlist = (product: Product) => {
    setWishlist(prev => {
      if (prev.some(p => p.id === product.id)) return prev;
      const next = [...prev, product];
      return next.length > MAX_WISHLIST_ITEMS
        ? next.slice(next.length - MAX_WISHLIST_ITEMS)
        : next;
    });
    if (isAuthedRef.current) {
      addWishlistItemAction(product.id).catch((err) =>
        console.error('[WishlistProvider] sync add falló:', err),
      );
    }
  };

  const removeFromWishlist = (productId: string) => {
    setWishlist(prev => prev.filter(p => p.id !== productId));
    if (isAuthedRef.current) {
      removeWishlistItemAction(productId).catch((err) =>
        console.error('[WishlistProvider] sync remove falló:', err),
      );
    }
  };

  const isInWishlist = (productId: string) => {
    return wishlist.some(p => p.id === productId);
  };

  const clearWishlist = () => {
    setWishlist([]);
    if (isAuthedRef.current) {
      clearWishlistAction().catch((err) =>
        console.error('[WishlistProvider] sync clear falló:', err),
      );
    }
  };

  const value = useMemo(() => ({
    wishlist,
    isWishlistLoading,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    clearWishlist,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [wishlist, isWishlistLoading]);

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
