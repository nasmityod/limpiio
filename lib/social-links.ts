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
  /** URL wa.me completa, con código de país y sin `+` (NEXT_PUBLIC_WHATSAPP_URL). */
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

/**
 * Enlace al WhatsApp de la tienda a partir de `NEXT_PUBLIC_WHATSAPP_URL`
 * (`BRAND.social.whatsapp`), con mensaje precargado opcional. Es la capa que
 * corresponde cuando el componente no recibe `StoreSettings` sin añadir una
 * consulta (componentes cliente como `AuthSplitLayout`, plantillas de correo).
 *
 * Devuelve `null` con la variable vacía: quien la consume debe omitir el
 * enlace entero, igual que con `whatsappHref`. Así una tienda derivada sin
 * configurar no manda a nadie al WhatsApp de otra empresa ni a una URL rota.
 */
export function brandWhatsappHref(message?: string): string | null {
  const base = SOCIAL_LINKS.whatsapp;
  if (!base) return null;
  const text = message?.trim();
  if (!text) return base;
  return `${base}${base.includes('?') ? '&' : '?'}text=${encodeURIComponent(text)}`;
}
