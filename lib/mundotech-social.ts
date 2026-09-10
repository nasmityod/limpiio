/** URLs oficiales — sobreescribe con NEXT_PUBLIC_* en .env.local */

export const MUNDOTECH_SOCIAL = {
  instagram:
    process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://instagram.com/Mundotech39',
  facebook:
    process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/',
  /** wa.me con código país sin + (ej. 584121471338) */
  whatsapp:
    process.env.NEXT_PUBLIC_WHATSAPP_URL ??
    'https://wa.me/584121471338',
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
