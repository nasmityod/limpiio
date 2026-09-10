/**
 * lib/checkout-mode.ts — modo de compra decidido EXCLUSIVAMENTE por el servidor.
 *
 * `whatsapp`: checkout de una sola página, permite guest, redirige a WhatsApp.
 * `full`: checkout con comprobante en 3 pasos, exige sesión en todas las capas
 * (middleware, page, POST /api/orders, upload-session, upload-proof).
 *
 * PROHIBIDO usar NEXT_PUBLIC_CHECKOUT_MODE: esa variable es visible en el
 * bundle del cliente y permitiría a un atacante conocer/manipular el modo
 * esperado. El valor real solo vive en el proceso del servidor.
 *
 * Fail-closed: cualquier valor ausente o inválido resuelve a 'full'.
 */
export type CheckoutMode = 'whatsapp' | 'full';

export function resolveCheckoutMode(raw: string | undefined): CheckoutMode {
  return raw?.trim().toLowerCase() === 'whatsapp' ? 'whatsapp' : 'full';
}

export const CHECKOUT_MODE: CheckoutMode = resolveCheckoutMode(
  process.env.CHECKOUT_MODE,
);

export const isWhatsAppCheckout = CHECKOUT_MODE === 'whatsapp';
export const isFullCheckout = CHECKOUT_MODE === 'full';
