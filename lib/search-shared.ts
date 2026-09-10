/**
 * Constantes y tipos PUROS de búsqueda — sin imports de servidor, importables
 * desde Client Components. Las Server Actions viven en app/actions/search.ts
 * (un archivo "use server" solo puede exportar funciones async).
 */

export const SEARCH_PAGE_SIZE = 24;

export interface SearchResult {
  id:       string;
  slug:     string | null;
  name:     string;
  price:    number;
  category: string;
  brand:    string | null;
  images:   string[];
}

export interface FullProduct {
  id:            string;
  slug:          string | null;
  name:          string;
  description:   string;
  price:         number;
  originalPrice: number | null;
  stock:         number;
  category:      string;
  brand:         string | null;
  image:         string;
  images:        string[];
  details:       Record<string, string>;
  freeShipping:  boolean;
}

export interface FullSearchResult {
  products:   FullProduct[];
  totalCount: number;
  categories: string[];
  brands:     string[];
}

/** Mapeo explícito FullProduct → ProductCard (misma forma que productos/page). */
export interface ProductCardModel {
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
  details:       Record<string, string>;
  freeShipping:  boolean;
}

export function fullProductToCardModel(p: FullProduct): ProductCardModel {
  return {
    id:            p.id,
    slug:          p.slug,
    name:          p.name,
    description:   p.description,
    price:         p.price,
    originalPrice: p.originalPrice,
    stock:         p.stock,
    category:      p.category,
    brand:         p.brand,
    image:         p.image,
    images:        p.images,
    details:       p.details,
    freeShipping:  p.freeShipping,
  };
}
