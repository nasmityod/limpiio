import { BRAND } from '@/config/brand';

/**
 * URLs de redes sociales de la tienda. La única fuente es `config/brand.ts`
 * (variables NEXT_PUBLIC_*): sin configurar quedan vacías, de modo que una
 * instancia derivada nunca enlace a los perfiles de otra tienda. Quien las
 * consuma debe ocultar el enlace cuando el valor esté vacío.
 */
export const SOCIAL_LINKS = {
  instagram: BRAND.social.instagram,
  facebook: BRAND.social.facebook,
  /** wa.me con código país sin + (ej. 584121471338) */
  whatsapp: BRAND.social.whatsapp,
} as const;

/**
 * Convierte un teléfono local venezolano (`0412-1471338`) en un enlace wa.me
 * con mensaje precargado. Pura — segura para componentes cliente.
 */
export function whatsappHref(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '');
  const base = `https://wa.me/58${digits}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}
