'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect, useRef } from 'react';
import { getProducts } from '@/app/actions/productActions';
import { d, dn } from '@/lib/decimal';
import { firstCardImage } from '@/lib/product-media';

// Definimos una interfaz de Producto que coincida con Prisma
export interface Product {
  id:            string;
  slug?:         string | null;
  name:          string;
  description:   string;
  price:         number;
  originalPrice?: number | null;
  stock:         number;
  category:      string;
  brand?:        string | null;
  image:         string;
  images:        string[];
  isNew?:        boolean;
  isOffer?:      boolean;
  details:       Record<string, string>;
  /** Promedio de reseñas aprobadas (0–5). Opcional: se muestra solo si reviewCount > 0. */
  rating?:       number;
  /** Nº de reseñas aprobadas. */
  reviewCount?:  number;
  /** true = MundoTech cubre el envío de este producto; false = cobro a destino. */
  freeShipping:  boolean;
}

/** PRD-271: producto tal como lo devuelve la Server Action getProducts (Prisma, sin `any`). */
type FetchedProduct = Awaited<ReturnType<typeof getProducts>>['products'][number];

function fetchedToProduct(p: FetchedProduct): Product {
  return {
    id:            p.id,
    slug:          p.slug,
    name:          p.name,
    description:   p.description ?? '',
    // PRD-204: price/originalPrice son Decimal en BD → convertir a number
    price:         d(p.price),
    originalPrice: dn(p.originalPrice),
    stock:         p.stock,
    category:      p.category,
    brand:         p.brand,
    image:         firstCardImage(p.images),
    images:        p.images ?? [],
    details:       {},
    freeShipping:  p.freeShipping === true,
  };
}

// El tipo para el valor del contexto
interface ProductContextType {
  products: Product[];
  filteredAndSortedProducts: Product[];
  loading: boolean;
  sortOption: string;
  filterCategory: string;
  searchTerm: string;
  setSortOption: (option: string) => void;
  setFilterCategory: (category: string) => void;
  setSearchTerm: (term: string) => void;
  addProduct: (product: Omit<Product, 'id' | 'image'> & { image?: string }) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (productId: string) => void;
  getProductById: (id: string) => Product | undefined;
  refreshProducts: () => Promise<void>;
  /**
   * PRD-095/063: el catálogo ya NO se descarga al montar el layout global.
   * El primer consumidor real (vía useProducts) dispara la carga una sola vez.
   */
  ensureLoaded: () => void;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const ProductProvider = ({ children }: { children: ReactNode }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOption, setSortOption] = useState('default');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const hasLoadedRef = useRef(false);

  const refreshProducts = useCallback(async () => {
    hasLoadedRef.current = true;
    setLoading(true);
    try {
      const { products: fetchedProducts } = await getProducts();
      setProducts(fetchedProducts.map(fetchedToProduct));
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Carga perezosa e idempotente: solo el primer consumidor dispara el fetch. */
  const ensureLoaded = useCallback(() => {
    if (hasLoadedRef.current) return;
    void refreshProducts();
  }, [refreshProducts]);

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // Filtrado por búsqueda (coincidencias parciales en nombre)
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
      );
    }

    // Filtrado por categoría
    if (filterCategory !== 'all') {
      result = result.filter(p => p.category === filterCategory);
    }

    // Ordenación
    switch (sortOption) {
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'name-asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      default:
        break;
    }

    return result;
  }, [products, searchTerm, sortOption, filterCategory]);

  const addProduct = useCallback((_product: Omit<Product, 'id' | 'image'> & { image?: string }) => {
    // Nota: El producto real se añade vía Server Action en el Admin
    // Aquí solo actualizamos el estado local si fuera necesario, 
    // pero refreshProducts() es más fiable.
    refreshProducts();
  }, [refreshProducts]);

  const updateProduct = useCallback((updatedProduct: Product) => {
    setProducts(prevProducts =>
      prevProducts.map(p => (p.id === updatedProduct.id ? updatedProduct : p))
    );
  }, []);

  const deleteProduct = useCallback((productId: string) => {
    setProducts(prevProducts => prevProducts.filter(p => p.id !== productId));
  }, []);

  const getProductById = useCallback((id: string) => {
    return products.find(p => p.id === id);
  }, [products]);

  const value = {
    products,
    filteredAndSortedProducts,
    loading,
    sortOption,
    filterCategory,
    searchTerm,
    setSortOption,
    setFilterCategory,
    setSearchTerm,
    addProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    refreshProducts,
    ensureLoaded,
  };

  return (
    <ProductContext.Provider value={value}>
      {children}
    </ProductContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (context === undefined) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  // Dispara la carga del catálogo solo cuando un componente lo consume de
  // verdad (PRD-095: antes se descargaba el catálogo completo en cada visita).
  const { ensureLoaded } = context;
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);
  return context;
};
