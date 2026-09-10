/**
 * whatsapp-phone.ts
 * Normalización y validación del número de WhatsApp de pedidos
 * (`StoreSettings.whatsappOrderPhone`). No construye URLs — eso vive en
 * `lib/whatsapp-order.ts`.
 */

const VENEZUELAN_MOBILE_NATIONAL_REGEX = /^4(?:12|14|16|24|26)\d{7}$/;
const VENEZUELAN_MOBILE_E164_REGEX = /^584(?:12|14|16|24|26)\d{7}$/;

export const WHATSAPP_PHONE_INVALID_MESSAGE =
  'Ingresa un móvil venezolano válido, por ejemplo 0426-1234567 o 584261234567.';

/** Solo dígitos normalizados al formato E.164 venezolano (584XXXXXXXXX) cuando aplica. */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (
    digits.startsWith('0') &&
    VENEZUELAN_MOBILE_NATIONAL_REGEX.test(digits.slice(1))
  ) {
    return `58${digits.slice(1)}`;
  }
  if (VENEZUELAN_MOBILE_NATIONAL_REGEX.test(digits)) {
    return `58${digits}`;
  }
  if (VENEZUELAN_MOBILE_E164_REGEX.test(digits)) {
    return digits;
  }
  return digits;
}

/** Móvil venezolano en E.164 (584 + operadora + 7 dígitos). Vacío no es válido. */
export function isValidWhatsAppPhone(raw: string | null | undefined): boolean {
  return VENEZUELAN_MOBILE_E164_REGEX.test(normalizeWhatsAppPhone(raw));
}
