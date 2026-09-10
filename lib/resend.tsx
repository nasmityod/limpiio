import { EmailChangeConfirmEmail } from '@/emails/mundotech/EmailChangeConfirmEmail';
import { OrderCancelledEmail } from '@/emails/mundotech/OrderCancelledEmail';
import { OrderConfirmationEmail } from '@/emails/mundotech/OrderConfirmationEmail';
import { OrderDeliveredEmail } from '@/emails/mundotech/OrderDeliveredEmail';
import { PasswordResetEmail } from '@/emails/mundotech/PasswordResetEmail';
import { PaymentValidatedEmail } from '@/emails/mundotech/PaymentValidatedEmail';
import { PaymentRejectedEmail } from '@/emails/mundotech/PaymentRejectedEmail';
import {
  ShippingNotificationEmail,
  type ShippingNotificationOptions,
} from '@/emails/mundotech/ShippingNotificationEmail';
import { RestockNotificationEmail } from '@/emails/mundotech/RestockNotificationEmail';
import { AbandonedCartEmail } from '@/emails/mundotech/AbandonedCartEmail';
import {
  ReviewRequestEmail,
  type ReviewRequestProduct,
} from '@/emails/mundotech/ReviewRequestEmail';
import type { OrderConfirmationPayload } from '@/emails/mundotech/types';
import type { AbandonedCartItem } from '@/lib/definitions';
import { emailSiteBaseUrl, emailContactAddress } from '@/emails/mundotech/site';
import { WelcomeEmail } from '@/emails/mundotech/WelcomeEmail';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import * as React from 'react';
import { isE2eMode } from '@/lib/e2e-mode';
import { logError, logWarn } from '@/lib/safe-logger';

export type { OrderConfirmationPayload, OrderConfirmationLineItem } from '@/emails/mundotech/types';

/** @deprecated Use ShippingNotificationOptions — mantenido por compatibilidad con importaciones existentes. */
export type ShippingEmailOptions = ShippingNotificationOptions;

/** Nombre visible de la marca en el remitente. */
const BRAND_SENDER_NAME = 'MundoTech';

/**
 * Remitente de los correos. Se lee de `RESEND_FROM_ADDRESS` (dominio verificado en
 * Resend, p. ej. `noreply@mundotechve.com`). Si el valor ya trae nombre visible
 * (`Nombre <correo>`) se respeta; si es solo el correo, se antepone la marca.
 *
 * PRD-020: sin la variable NO hay fallback a dominios de terceros
 * (`jummper.pro`) — se devuelve null y el envío se OMITE con log.
 */
function resolveFromAddress(): string | null {
  const raw = process.env.RESEND_FROM_ADDRESS?.trim();
  if (!raw) {
    logError('resend_from_address_missing', new Error('RESEND_FROM_ADDRESS not configured'), { provider: 'resend' });
    return null;
  }
  if (raw.includes('<') && raw.includes('>')) return raw;
  return `${BRAND_SENDER_NAME} <${raw}>`;
}

const FROM_ADDRESS = resolveFromAddress();

/** Dirección de respuesta: el correo de atención real de la tienda. */
const REPLY_TO_ADDRESS = emailContactAddress();

function getResend(): Resend | null {
  // PRD-E2E: en pruebas E2E (E2E_MODE=1) nunca se hacen llamadas externas a Resend.
  if (isE2eMode()) {
    return null;
  }
  const nodeEnv = (process.env.NODE_ENV ?? '').trim();
  if (nodeEnv === 'test') {
    return null;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key?.trim()) {
    return null;
  }
  return new Resend(key);
}

/**
 * Envía un correo transaccional renderizando HTML + texto plano desde el mismo
 * componente React. El texto plano mejora la entregabilidad (menos spam) y la
 * accesibilidad en clientes que no renderizan HTML. Los errores se registran y
 * no se relanzan (envío best-effort que nunca debe tumbar el flujo de negocio).
 */
async function sendBrandedEmail(params: {
  resend: Resend;
  to: string;
  subject: string;
  element: React.ReactElement;
  logScope: string;
}): Promise<void> {
  const { resend, to, subject, element, logScope } = params;

  // PRD-020: sin remitente propio configurado no se envía nada (nunca se usa
  // un dominio de terceros como From).
  if (!FROM_ADDRESS) {
    logWarn('resend_from_address_absent', { provider: 'resend', operation: logScope });
    return;
  }

  try {
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      replyTo: REPLY_TO_ADDRESS,
      subject,
      html,
      text,
    });

    if (error) {
      logError('resend_send_failed', error, { provider: 'resend', operation: logScope });
    }
  } catch (err) {
    logError('resend_send_exception', err, { provider: 'resend', operation: logScope });
  }
}

/** Fase 7: la variante Cashea usa el mismo template con copy propio de "inicial confirmada". */
export type PaymentValidatedEmailOptions = {
  /**
   * true SOLO cuando la transición a CONFIRMED viene de
   * `processCasheaConfirmation` (lib/cashea-reconcile.ts) — el pago
   * verificado es la INICIAL de Cashea, no el total del pedido.
   */
  casheaInitial?: boolean;
};

/**
 * Notificación de pago verificado manualmente desde admin. Los errores de Resend no relanzan.
 * `orderId` en este contexto es el número visible del pedido (ej. padded "0123").
 */
export async function sendPaymentValidatedEmail(
  email: string,
  firstName: string,
  orderId: string,
  orderUuid?: string,
  options: PaymentValidatedEmailOptions = {},
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'payment-validated-email' });
    return;
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    logWarn('payment_validated_email_empty', { provider: 'resend', operation: 'payment-validated-email' });
    return;
  }

  const trimmedName = firstName.trim() || 'Cliente';
  const trimmedOrderRef = orderId.trim();
  const casheaInitial = options.casheaInitial === true;

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: casheaInitial
      ? 'MundoTech · Inicial de Cashea confirmada — tu pedido va en preparación'
      : 'MundoTech · Pago confirmado — tu pedido va en preparación',
    logScope: 'payment-validated-email',
    element: (
      <PaymentValidatedEmail
        customerName={trimmedName}
        orderDisplayId={trimmedOrderRef}
        orderUuid={orderUuid}
        casheaInitial={casheaInitial}
      />
    ),
  });
}

/**
 * Notificación de pago rechazado: el pedido fue cancelado por pago no verificado.
 * `orderId` es el número visible del pedido (ej. "0123"). Errores no relanzan.
 */
export async function sendPaymentRejectedEmail(
  email: string,
  firstName: string,
  orderId: string,
  reason: string,
  orderUuid?: string
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'payment-rejected-email' });
    return;
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    logWarn('payment_rejected_email_empty', { provider: 'resend', operation: 'payment-rejected-email' });
    return;
  }

  const trimmedName = firstName.trim() || 'Cliente';
  const trimmedOrderRef = orderId.trim();

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: `MundoTech · No pudimos verificar el pago de tu pedido #${trimmedOrderRef}`,
    logScope: 'payment-rejected-email',
    element: (
      <PaymentRejectedEmail
        customerName={trimmedName}
        orderDisplayId={trimmedOrderRef}
        reason={reason}
        orderUuid={orderUuid}
      />
    ),
  });
}

/**
 * Confirmación de pedido tras checkout exitoso. Errores se registran; no relanza.
 */
export async function sendOrderConfirmationEmail(order: OrderConfirmationPayload): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'order-confirmation-email' });
    return;
  }

  const trimmedEmail = order.email.trim();
  if (!trimmedEmail) {
    logWarn('order_confirmation_email_empty', { provider: 'resend', operation: 'order-confirmation-email' });
    return;
  }

  const subjNo = String(order.orderNumber).padStart(4, '0');

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: `MundoTech · Recibimos tu pedido #${subjNo} — ya lo estamos revisando`,
    logScope: 'order-confirmation-email',
    element: <OrderConfirmationEmail {...order} />,
  });
}

/**
 * Envía el correo de envío cuando el pedido sale con guía.
 * Solo debe llamarse desde el servidor. Errores se registran; no relanza.
 */
export async function sendShippingEmail(
  email: string,
  firstName: string,
  trackingNumber: string,
  opts?: ShippingNotificationOptions
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'shipping-email' });
    return;
  }

  const trimmedEmail = email.trim();
  const trimmedTracking = trackingNumber.trim();
  if (!trimmedEmail || !trimmedTracking) {
    logWarn('shipping_email_empty_params', { provider: 'resend', operation: 'shipping-email' });
    return;
  }

  const trimmedName = firstName.trim() || 'Cliente';

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: 'MundoTech · Tu pedido salió de la tienda — aquí va tu guía',
    logScope: 'shipping-email',
    element: (
      <ShippingNotificationEmail
        customerName={trimmedName}
        trackingNumber={trimmedTracking}
        opts={opts}
      />
    ),
  });
}

/**
 * Notificación de pedido marcado como entregado en admin.
 * `orderRef` es el segmento legible para la URL (#0042), no el cuid.
 */
export async function sendOrderDeliveredEmail(email: string, firstName: string, orderRef: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'order-delivered-email' });
    return;
  }

  const trimmedEmail = email.trim();
  const ref = orderRef.trim();
  if (!trimmedEmail || !ref) {
    logWarn('order_delivered_email_empty', { provider: 'resend', operation: 'order-delivered-email' });
    return;
  }

  const trimmedName = firstName.trim() || 'Cliente';

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: 'MundoTech · Tu pedido llegó — revisa que todo esté perfecto',
    logScope: 'order-delivered-email',
    element: <OrderDeliveredEmail customerName={trimmedName} orderRef={ref} />,
  });
}

/**
 * Correo de bienvenida tras un registro exitoso.
 * Solo debe llamarse desde el servidor. Errores se registran; no relanza para no afectar el flujo de registro.
 */
export async function sendWelcomeEmail(email: string, firstName: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'welcome-email' });
    return;
  }

  const trimmed = firstName.trim() || 'Cliente';
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    logWarn('welcome_email_empty', { provider: 'resend', operation: 'welcome-email' });
    return;
  }

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: '¡Bienvenido a MundoTech! Tu cuenta ya está lista',
    logScope: 'welcome-email',
    element: <WelcomeEmail customerName={trimmed} />,
  });
}

/**
 * Notificación de restock al cliente suscrito.
 * Solo debe llamarse desde el servidor. Errores se registran; no relanza.
 */
export async function sendRestockNotificationEmail(params: {
  email: string;
  productName: string;
  productUrl: string;
  productImageUrl?: string;
  productPrice?: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'restock-email' });
    return;
  }

  const trimmedEmail = params.email.trim();
  if (!trimmedEmail) {
    logWarn('restock_email_empty', { provider: 'resend', operation: 'restock-email' });
    return;
  }

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: `MundoTech · ¡${params.productName} volvió al stock!`,
    logScope: 'restock-email',
    element: (
      <RestockNotificationEmail
        productName={params.productName}
        productUrl={params.productUrl}
        productImageUrl={params.productImageUrl}
        productPrice={params.productPrice}
      />
    ),
  });
}

/**
 * Recordatorio de carrito abandonado. El enlace de recuperación lleva al checkout.
 * El token permite al usuario darse de baja de estos recordatorios.
 * Errores se registran; no relanza.
 */
export async function sendAbandonedCartEmail(params: {
  email:         string;
  customerName:  string;
  items:         AbandonedCartItem[];
  totalUsd:      number;
  recoveryToken: string;
  /** MEJORA 1.3: cupón de un solo uso incluido en el segundo toque (72 h). */
  coupon?: { code: string; discountLabel: string; expiryDays: number };
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'abandoned-cart-email' });
    return;
  }

  const trimmedEmail = params.email.trim();
  if (!trimmedEmail || params.items.length === 0) {
    logWarn('abandoned_cart_email_empty', { provider: 'resend', operation: 'abandoned-cart-email' });
    return;
  }

  const base          = emailSiteBaseUrl().replace(/\/$/, '');
  // PRD-175: el CTA lleva a la ruta de recuperación con token, que rehidrata el
  // carrito del cliente desde el snapshot y lo deja en /cart listo para pagar.
  // Apuntar a /checkout "a secas" llegaba con el carrito vacío.
  const recoveryUrl   = `${base}/api/cart/recover?token=${encodeURIComponent(params.recoveryToken)}`;
  const unsubscribeUrl = `${base}/api/cart/unsubscribe?token=${encodeURIComponent(params.recoveryToken)}`;

  await sendBrandedEmail({
    resend,
    to:       trimmedEmail,
    subject: params.coupon
      ? `MundoTech · Tu carrito te espera — con ${params.coupon.discountLabel}`
      : 'MundoTech · Te guardamos el carrito tal como lo dejaste',
    logScope: 'abandoned-cart-email',
    element: (
      <AbandonedCartEmail
        customerName={params.customerName.trim() || 'Cliente'}
        items={params.items}
        totalUsd={params.totalUsd}
        recoveryUrl={recoveryUrl}
        unsubscribeUrl={unsubscribeUrl}
        coupon={params.coupon}
      />
    ),
  });
}

export type OrderCancelledEmailOptions = {
  expiredAfterHours?: number;
};

/**
 * PRD-050: notificación al cliente cuando un admin cancela su pedido (o el
 * cron de auto-cancelación lo hace por expiración, ver `options.expiredAfterHours`).
 * `orderDisplayId` es el número formateado (ej. "0042"). Errores no relanzan.
 */
export async function sendOrderCancelledEmail(
  email: string,
  firstName: string,
  orderDisplayId: string,
  options: OrderCancelledEmailOptions = {},
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'order-cancelled-email' });
    return;
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    logWarn('order_cancelled_email_empty', { provider: 'resend', operation: 'order-cancelled-email' });
    return;
  }

  const trimmedName = firstName.trim() || 'Cliente';
  const ref = orderDisplayId.trim();

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject:
      typeof options.expiredAfterHours === 'number'
        ? `MundoTech · Tu pedido #${ref} venció después de ${options.expiredAfterHours} horas`
        : `MundoTech · Tu pedido #${ref} fue cancelado`,
    logScope: 'order-cancelled-email',
    element: (
      <OrderCancelledEmail
        customerName={trimmedName}
        orderDisplayId={ref}
        expiredAfterHours={options.expiredAfterHours}
      />
    ),
  });
}

/**
 * PRD-014/089: envía el enlace de confirmación al nuevo correo solicitado.
 * Solo debe llamarse desde el servidor. Errores se registran; no relanza.
 */
export async function sendEmailChangeConfirmEmail(params: {
  to: string;
  customerName: string;
  confirmUrl: string;
  newEmail: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'email-change-confirm' });
    return;
  }

  const trimmedEmail = params.to.trim();
  if (!trimmedEmail) {
    logWarn('email_change_confirm_empty', { provider: 'resend', operation: 'email-change-confirm' });
    return;
  }

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: 'MundoTech · Confirma tu nuevo correo electrónico',
    logScope: 'email-change-confirm',
    element: (
      <EmailChangeConfirmEmail
        customerName={params.customerName.trim() || 'Cliente'}
        confirmUrl={params.confirmUrl}
        newEmail={params.newEmail}
      />
    ),
  });
}

/**
 * FASE 4.5 (MEJORA 2.2): solicitud de reseña 7 días después de la entrega.
 * Un email por pedido con deep-links por producto. Errores se registran; no relanza.
 */
export async function sendReviewRequestEmail(params: {
  email: string;
  customerName: string;
  products: ReviewRequestProduct[];
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'review-request-email' });
    return false;
  }

  const trimmedEmail = params.email.trim();
  if (!trimmedEmail || params.products.length === 0) {
    logWarn('review_request_email_empty', { provider: 'resend', operation: 'review-request-email' });
    return false;
  }

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: 'MundoTech · ¿Qué tal tu compra? Cuéntanos en 1 minuto',
    logScope: 'review-request-email',
    element: (
      <ReviewRequestEmail
        customerName={params.customerName.trim() || 'Cliente'}
        products={params.products}
      />
    ),
  });
  return true;
}

/** Correo de recuperación de contraseña. Errores se registran; no relanza. */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'password-reset-email' });
    return;
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail || !token.trim()) {
    logWarn('password_reset_email_empty', { provider: 'resend', operation: 'password-reset-email' });
    return;
  }

  // PRD-172 / PRD-224: el token viaja en el FRAGMENTO (#token=...) — el
  // navegador nunca lo envía al servidor, así que no queda en logs de Vercel,
  // historial de proxies ni cabeceras Referer. Lo lee el cliente de reset.
  const resetUrl = `${emailSiteBaseUrl().replace(/\/$/, '')}/reset-password#token=${encodeURIComponent(token.trim())}`;

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: 'MundoTech · Restablecer tu contraseña',
    logScope: 'password-reset-email',
    element: <PasswordResetEmail resetUrl={resetUrl} />,
  });
}
