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
 *
 * Devuelve `null` si el teléfono no aporta dígitos: con la tienda recién
 * instalada `settings.phone` está vacío, y construir el enlace igualmente
 * daba `https://wa.me/58`, una URL rota que el cliente sí podía pulsar. Quien
 * la consume debe omitir el enlace entero, no renderizarlo sin destino.
 */
export function whatsappHref(phone: string, message?: string): string | null {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '');
  if (!digits) return null;
  const base = `https://wa.me/58${digits}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}
