'use client';

import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, ReactNode, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Product } from './ProductContext';
import {
  getWishlistAction,
  mergeWishlistAction,
  addWishlistItemAction,
  removeWishlistItemAction,
  clearWishlistAction,
  type WishlistProductDTO,
  type WishlistResult,
} from '@/app/actions/wishlistActions';
import { toast } from '@/components/ui/use-toast';

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
  const [listOwnerId, setListOwnerId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const identityRef = useRef<string | null>(null);
  const currentUserId = session?.user?.id ?? null;
  useLayoutEffect(() => { identityRef.current = currentUserId; }, [currentUserId]);
  const visibleWishlist = currentUserId === listOwnerId ? wishlist : [];

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
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setWishlist(parsed.filter(p => p && typeof p.id === 'string').slice(0, MAX_WISHLIST_ITEMS));
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
        setListOwnerId(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* Safari modo privado */
        }
      }
      return;
    }

    if (prevUserIdRef.current && prevUserIdRef.current !== userId) setWishlist([]);
    prevUserIdRef.current = userId;
    if (mergedForUserRef.current === userId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    queueRef.current = queueRef.current.catch(() => {}).then(async () => {
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

        if (cancelled || identityRef.current !== userId) return;
        if (!merged.ok) {
          retryTimer = setTimeout(() => setRetry(n => n + 1), 30_000);
          return;
        }
        mergedForUserRef.current = userId;
        setListOwnerId(userId);
        setWishlist(merged.items.map(dtoToProduct));
        // La cuenta es ahora la fuente de verdad: limpiar copia local del invitado.
        try {
          if (merged.unmergedIds?.length) {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Product[];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.filter(p => merged.unmergedIds!.includes(p.id))));
            toast({ title: 'Límite de favoritos', description: 'Tu cuenta tiene 100 favoritos. Conservamos los restantes en este dispositivo.', variant: 'destructive' });
          } else localStorage.removeItem(STORAGE_KEY);
        } catch { /* noop */ }
      } catch (err) {
        console.error('[WishlistProvider] merge con la cuenta falló:', err);
        if (!cancelled) retryTimer = setTimeout(() => setRetry(n => n + 1), 30_000);
      }
    });
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [session?.user?.id, sessionStatus, isWishlistLoading, retry]);

  // Persistencia local: SOLO para invitados (con cuenta, la BD es la fuente).
  useEffect(() => {
    if (isWishlistLoading || isAuthedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      /* Safari modo privado / cuota excedida */
    }
  }, [wishlist, isWishlistLoading]);

  const syncMutation = (action: () => Promise<WishlistResult>) => {
    const owner = identityRef.current;
    queueRef.current = queueRef.current.catch(() => {}).then(async () => {
      if (identityRef.current !== owner) return;
      try {
        const result = await action();
        if (identityRef.current !== owner) return;
        if (result.ok) { setListOwnerId(owner); setWishlist(result.items.map(dtoToProduct)); }
        else toast({ title: 'No se pudieron actualizar los favoritos', description: result.code === 'LIMIT' ? 'Puedes guardar hasta 100 favoritos.' : 'Intenta de nuevo. Tu lista anterior se conserva.', variant: 'destructive' });
      } catch {
        if (identityRef.current === owner) toast({ title: 'No se pudieron actualizar los favoritos', description: 'Intenta de nuevo. Tu lista anterior se conserva.', variant: 'destructive' });
      }
    });
  };

  const addToWishlist = (product: Product) => {
    if (isAuthedRef.current) { syncMutation(() => addWishlistItemAction(product.id)); return; }
    setWishlist(prev => {
      if (prev.some(p => p.id === product.id)) return prev;
      const next = [...prev, product];
      return next.length > MAX_WISHLIST_ITEMS ? prev : next;
    });
  };

  const removeFromWishlist = (productId: string) => {
    if (isAuthedRef.current) { syncMutation(() => removeWishlistItemAction(productId)); return; }
    setWishlist(prev => prev.filter(p => p.id !== productId));
  };

  const isInWishlist = (productId: string) => {
    return visibleWishlist.some(p => p.id === productId);
  };

  const clearWishlist = () => {
    if (isAuthedRef.current) { syncMutation(clearWishlistAction); return; }
    setWishlist([]);
  };

  const value = useMemo(() => ({
    wishlist: visibleWishlist,
    isWishlistLoading,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    clearWishlist,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [wishlist, isWishlistLoading, currentUserId, listOwnerId]);

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
