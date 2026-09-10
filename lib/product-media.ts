import type { ProductMedia } from '@prisma/client';
import { sortMediaImagesFirst } from '@/lib/media';

/** Item normalizado para la galería PDP (serializable al cliente). */
export type ProductGalleryItem =
  | { type: 'IMAGE'; url: string }
  | { type: 'VIDEO'; url: string; posterUrl?: string };

const PLACEHOLDER = '/placeholder-product.png';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i;

/** Devuelve la mejor imagen para tarjetas/carrito: primera imagen real (no video). */
export function firstCardImage(images: string[] | null | undefined): string {
  const list = (images ?? []).map((u) => (u ?? '').trim()).filter(Boolean);
  const realImage = list.find((u) => !VIDEO_EXT.test(u));
  return realImage || list.find(Boolean) || PLACEHOLDER;
}

/** Lista `images` para cards / carrito: imágenes reales primero, pósters de video al final. */
export function deriveLegacyImagesFromSlots(slots: ProductGalleryItem[]): string[] {
  const images: string[] = [];
  const posters: string[] = [];
  for (const s of slots) {
    if (s.type === 'IMAGE') {
      images.push(s.url);
    } else if (s.posterUrl) {
      posters.push(s.posterUrl);
    }
  }
  const out = [...images, ...posters];
  if (out.length === 0) return [PLACEHOLDER];
  return out;
}

export function productToGalleryItems(product: {
  images: string[];
  media?: Pick<ProductMedia, 'type' | 'url' | 'posterUrl' | 'sortOrder'>[];
}): ProductGalleryItem[] {
  if (product.media && product.media.length > 0) {
    const mapped = [...product.media]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m): ProductGalleryItem => {
        if (m.type === 'VIDEO') {
          return { type: 'VIDEO', url: m.url, posterUrl: m.posterUrl ?? undefined };
        }
        return { type: 'IMAGE', url: m.url };
      });
    return sortMediaImagesFirst(mapped);
  }
  const imgs = product.images.filter(Boolean);
  const list = imgs.length > 0 ? imgs : [PLACEHOLDER];
  return list.map((url) => ({ type: 'IMAGE' as const, url }));
}
