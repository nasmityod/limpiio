import { z } from 'zod';
import { isSafeEditableImageUrl, isSafeEditableLink } from '@/lib/safe-link';

const link = z.string().trim().max(400).nullish().refine((v) => v == null || isSafeEditableLink(v), 'Usa una ruta interna o https.');
const image = z.string().trim().max(600).refine(isSafeEditableImageUrl, 'Usa una imagen interna o del CDN de la tienda.');
export const bannerSchema = z.object({
  type: z.enum(['hero', 'ad_box', 'cta_banner', 'discover', 'promo_large', 'promo_small_1', 'promo_small_2']),
  imageUrl: image.refine((v) => v.length > 0, 'La imagen es obligatoria.'),
  title: z.string().max(160).nullish(), subtitle: z.string().max(300).nullish(),
  label: z.string().max(80).nullish(), ctaText: z.string().max(60).nullish(), tagText: z.string().max(60).nullish(),
  link, focalPoint: z.enum(['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
  active: z.boolean().optional(), order: z.number().int().min(0).max(9999).optional(),
});
export const bannerToggleSchema = z.object({ active: z.boolean() }).strict();
export const promotionSchema = z.object({
  title: z.string().trim().min(1).max(160), subtitle: z.string().max(300).nullish(),
  discountText: z.string().max(60).nullish(), imageUrl: image.nullish(),
  bgColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  link, active: z.boolean().optional(), order: z.coerce.number().int().min(0).max(9999).optional(),
});
