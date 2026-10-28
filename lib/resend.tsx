import { EmailChangeConfirmEmail } from '@/emails/transactional/EmailChangeConfirmEmail';
import { EmailChangeNoticeEmail } from '@/emails/transactional/EmailChangeNoticeEmail';
import { OrderCancelledEmail } from '@/emails/transactional/OrderCancelledEmail';
import { OrderConfirmationEmail } from '@/emails/transactional/OrderConfirmationEmail';
import { OrderDeliveredEmail } from '@/emails/transactional/OrderDeliveredEmail';
import { PasswordResetEmail } from '@/emails/transactional/PasswordResetEmail';
import { PaymentValidatedEmail } from '@/emails/transactional/PaymentValidatedEmail';
import { PaymentRejectedEmail } from '@/emails/transactional/PaymentRejectedEmail';
import {
  ShippingNotificationEmail,
  type ShippingNotificationOptions,
} from '@/emails/transactional/ShippingNotificationEmail';
import { RestockNotificationEmail } from '@/emails/transactional/RestockNotificationEmail';
import { AbandonedCartEmail } from '@/emails/transactional/AbandonedCartEmail';
import {
  ReviewRequestEmail,
  type ReviewRequestProduct,
} from '@/emails/transactional/ReviewRequestEmail';
import type { OrderConfirmationPayload } from '@/emails/transactional/types';
import type { AbandonedCartItem } from '@/lib/definitions';
import { emailSiteBaseUrl, emailContactAddress } from '@/emails/transactional/site';
import { BRAND, brandSubject } from '@/config/brand';
import { WelcomeEmail } from '@/emails/transactional/WelcomeEmail';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import * as React from 'react';
import { isE2eMode } from '@/lib/e2e-mode';
import { logError, logWarn } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { encryptEmailPayload, decryptEmailPayload } from '@/lib/email-payload';
import type { CreateEmailOptions } from 'resend';
import { createHash } from 'crypto';
import { emailOutboxTransaction } from '@/lib/email-outbox-context';

export type EmailSendResult = { accepted: true; providerMessageId: string } | {
  accepted: false; reason: 'unconfigured' | 'invalid' | 'provider_error' | 'exception';
} | { accepted: false; reason: 'queued'; deliveryId: string };

export type { OrderConfirmationPayload, OrderConfirmationLineItem } from '@/emails/transactional/types';

/** @deprecated Use ShippingNotificationOptions — mantenido por compatibilidad con importaciones existentes. */
export type ShippingEmailOptions = ShippingNotificationOptions;

/** Nombre visible de la marca en el remitente. */
const BRAND_SENDER_NAME = BRAND.name;

/**
 * Remitente de los correos. Se lee de `RESEND_FROM_ADDRESS` (dominio verificado en
 * Resend, p. ej. `noreply@tu-dominio.com`). Si el valor ya trae nombre visible
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
  resend: Resend | null;
  to: string;
  subject: string;
  element: React.ReactElement;
  logScope: string;
  deliveryId?: string;
  expiresAt?: Date;
  tokenType?: 'PASSWORD_RESET' | 'EMAIL_CHANGE';
  tokenHash?: string;
  orderId?: string;
  orderRef?: string;
  trackingNumber?: string;
  trackingCarrier?: string | null;
  trackingUrl?: string | null;
  requestKey?: string;
  enqueueOnly?: boolean;
}): Promise<EmailSendResult> {
  const { to, subject, element, logScope } = params;
  const outboxTx = emailOutboxTransaction();

  try {
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    const payload: CreateEmailOptions = {
      from: '', // Filled once, immediately before the first provider attempt.
      to,
      // Sin correo de atención configurado se omite el Reply-To: mandar uno
      // vacío haría fallar la petición a Resend.
      ...(REPLY_TO_ADDRESS ? { replyTo: REPLY_TO_ADDRESS } : {}),
      subject,
      html,
      text,
    };
    if (params.deliveryId) {
      if (outboxTx) throw new Error('Reminder delivery cannot run inside a business outbox transaction');
      await prisma.emailDelivery.updateMany({
        where: { id: params.deliveryId, providerPayload: null },
        data: { providerPayload: encryptEmailPayload(payload) },
      });
      return sendStoredBrandedEmail(params.deliveryId);
    }
    const dedupKey = `TRANSACTIONAL:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}${params.requestKey ? ':' + params.requestKey : ''}`;
    const queued = await (outboxTx ?? prisma).emailDelivery.upsert({
      where: { dedupKey }, update: {}, create: {
        dedupKey, kind: 'TRANSACTIONAL', resourceId: logScope, recipient: to.trim().toLowerCase(),
        payload: { scope: logScope, ...(params.tokenType && params.tokenHash ? { tokenType: params.tokenType, tokenHash: params.tokenHash } : {}), ...(params.orderId ? { orderId: params.orderId } : {}), ...(params.orderRef ? { orderRef: params.orderRef } : {}), ...(params.trackingNumber ? { trackingNumber: params.trackingNumber, trackingCarrier: params.trackingCarrier ?? null, trackingUrl: params.trackingUrl ?? null } : {}) },
        providerPayload: encryptEmailPayload(payload),
        tokenExpiresAt: params.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60_000),
      },
    });
    if (outboxTx || params.enqueueOnly) return { accepted: false, reason: 'queued', deliveryId: queued.id };
    const { processEmailDeliveries } = await import('@/lib/email-delivery');
    await processEmailDeliveries(['TRANSACTIONAL'], 1, queued.id);
    const stored = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: queued.id }, select: { acceptedAt: true, providerMessageId: true } });
    return stored.acceptedAt && stored.providerMessageId ? { accepted: true, providerMessageId: stored.providerMessageId } : { accepted: false, reason: 'provider_error' };
  } catch (err) {
    if (outboxTx) throw err;
    logError('resend_enqueue_exception', err, { provider: 'resend', operation: logScope });
    return { accepted: false, reason: 'exception' };
  }
}

/** Worker-only boundary: exact encrypted body and stable provider key on every retry. */
export async function sendStoredBrandedEmail(deliveryId: string): Promise<EmailSendResult> {
  const resend = getResend();
  if (!resend || !FROM_ADDRESS) return { accepted: false, reason: 'unconfigured' };
  try {
    const stored = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: deliveryId }, select: { providerPayload: true, firstAttemptAt: true } });
    if (!stored.providerPayload) return { accepted: false, reason: 'invalid' };
    let payload: CreateEmailOptions;
    try { payload = decryptEmailPayload<CreateEmailOptions>(stored.providerPayload); }
    catch { return { accepted: false, reason: 'invalid' }; }
    if (!payload.from) {
      if (stored.firstAttemptAt) throw new Error('Durable email sender missing after an attempt');
      payload.from = FROM_ADDRESS;
      await prisma.emailDelivery.updateMany({ where: { id: deliveryId, firstAttemptAt: null }, data: { providerPayload: encryptEmailPayload(payload) } });
    }
    await prisma.emailDelivery.updateMany({ where: { id: deliveryId, firstAttemptAt: null }, data: { firstAttemptAt: new Date() } });
    const { data, error } = await resend.emails.send(payload, { idempotencyKey: `delivery/${deliveryId}`, signal: AbortSignal.timeout(10_000) });

    if (error) {
      logError('resend_send_failed', error, { provider: 'resend', operation: 'email_delivery' });
      return { accepted: false, reason: 'provider_error' };
    }
    return data?.id ? { accepted: true, providerMessageId: data.id } : { accepted: false, reason: 'provider_error' };
  } catch (err) {
    logError('resend_send_exception', err, { provider: 'resend', operation: 'email_delivery' });
    return { accepted: false, reason: 'exception' };
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
      ? brandSubject('Inicial de Cashea confirmada — tu pedido va en preparación')
      : brandSubject('Pago confirmado — tu pedido va en preparación'),
    logScope: 'payment-validated-email',
    orderId: orderUuid,
    orderRef: trimmedOrderRef,
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
    subject: brandSubject(`No pudimos verificar el pago de tu pedido #${trimmedOrderRef}`),
    logScope: 'payment-rejected-email',
    orderId: orderUuid,
    orderRef: trimmedOrderRef,
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
export async function sendOrderConfirmationEmailResult(order: OrderConfirmationPayload, options: { requestKey?: string; enqueueOnly?: boolean } = {}): Promise<EmailSendResult> {
  const resend = getResend();

  const trimmedEmail = order.email.trim();
  if (!trimmedEmail) {
    logWarn('order_confirmation_email_empty', { provider: 'resend', operation: 'order-confirmation-email' });
    return { accepted: false, reason: 'invalid' };
  }

  const subjNo = String(order.orderNumber).padStart(4, '0');

  return sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: brandSubject(`Recibimos tu pedido #${subjNo} — ya lo estamos revisando`),
    logScope: 'order-confirmation-email',
    orderId: order.id,
    requestKey: options.requestKey,
    enqueueOnly: options.enqueueOnly,
    ...(order.guestToken ? { expiresAt: new Date(Date.now() + 72 * 60 * 60_000) } : {}),
    element: <OrderConfirmationEmail {...order} />,
  });
}

/** Existing business callers keep the void contract; outbox failures still throw. */
export async function sendOrderConfirmationEmail(order: OrderConfirmationPayload): Promise<void> {
  await sendOrderConfirmationEmailResult(order);
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
    subject: brandSubject('Tu pedido salió de la tienda — aquí va tu guía'),
    logScope: 'shipping-email',
    orderRef: opts?.orderId ?? undefined,
    trackingNumber: trimmedTracking,
    trackingCarrier: opts?.carrier ?? null,
    trackingUrl: opts?.trackingUrl ?? null,
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
    subject: brandSubject('Tu pedido llegó — revisa que todo esté perfecto'),
    logScope: 'order-delivered-email',
    orderRef: ref,
    element: <OrderDeliveredEmail customerName={trimmedName} orderRef={ref} />,
  });
}

/**
 * Correo de bienvenida tras un registro exitoso.
 * Solo debe llamarse desde el servidor. Errores se registran; no relanza para no afectar el flujo de registro.
 */
export async function sendWelcomeEmail(email: string, firstName: string): Promise<void> {
  const resend = getResend();

  const trimmed = firstName.trim() || 'Cliente';
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    logWarn('welcome_email_empty', { provider: 'resend', operation: 'welcome-email' });
    return;
  }

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: `¡Bienvenido a ${BRAND.name}! Tu cuenta ya está lista`,
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
  deliveryId?: string;
}): Promise<EmailSendResult> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'restock-email' });
    return { accepted: false, reason: 'unconfigured' };
  }

  const trimmedEmail = params.email.trim();
  if (!trimmedEmail) {
    logWarn('restock_email_empty', { provider: 'resend', operation: 'restock-email' });
    return { accepted: false, reason: 'invalid' };
  }

  return sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: brandSubject(`¡${params.productName} volvió al stock!`),
    logScope: 'restock-email',
    deliveryId: params.deliveryId,
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
  unsubscribeToken?: string;
  deliveryId?: string;
  /** MEJORA 1.3: cupón de un solo uso incluido en el segundo toque (72 h). */
  coupon?: { code: string; discountLabel: string; expiryDays: number };
}): Promise<EmailSendResult> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'abandoned-cart-email' });
    return { accepted: false, reason: 'unconfigured' };
  }

  const trimmedEmail = params.email.trim();
  if (!trimmedEmail || params.items.length === 0) {
    logWarn('abandoned_cart_email_empty', { provider: 'resend', operation: 'abandoned-cart-email' });
    return { accepted: false, reason: 'invalid' };
  }

  const base          = emailSiteBaseUrl().replace(/\/$/, '');
  // PRD-175: el CTA lleva a la ruta de recuperación con token, que rehidrata el
  // carrito del cliente desde el snapshot y lo deja en /cart listo para pagar.
  // Apuntar a /checkout "a secas" llegaba con el carrito vacío.
  const recoveryUrl   = `${base}/api/cart/recover?token=${encodeURIComponent(params.recoveryToken)}`;
  const unsubscribeUrl = `${base}/api/cart/unsubscribe?token=${encodeURIComponent(params.unsubscribeToken ?? params.recoveryToken)}`;

  return sendBrandedEmail({
    resend,
    to:       trimmedEmail,
    subject: params.coupon
      ? brandSubject(`Tu carrito te espera — con ${params.coupon.discountLabel}`)
      : brandSubject('Te guardamos el carrito tal como lo dejaste'),
    logScope: 'abandoned-cart-email',
    deliveryId: params.deliveryId,
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
        ? brandSubject(`Tu pedido #${ref} venció después de ${options.expiredAfterHours} horas`)
        : brandSubject(`Tu pedido #${ref} fue cancelado`),
    logScope: 'order-cancelled-email',
    orderRef: ref,
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
  expiresAt?: Date;
}): Promise<void> {
  const resend = getResend();

  const trimmedEmail = params.to.trim();
  if (!trimmedEmail) {
    logWarn('email_change_confirm_empty', { provider: 'resend', operation: 'email-change-confirm' });
    return;
  }

  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: brandSubject('Confirma tu nuevo correo electrónico'),
    logScope: 'email-change-confirm',
    expiresAt: params.expiresAt ?? new Date(Date.now() + 60 * 60_000),
    tokenType: 'EMAIL_CHANGE',
    tokenHash: createHash('sha256').update(new URL(params.confirmUrl).searchParams.get('token') ?? '').digest('hex'),
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
export async function sendReviewRequestEmailResult(params: {
  email: string;
  customerName: string;
  products: ReviewRequestProduct[];
  deliveryId?: string;
}): Promise<EmailSendResult> {
  const resend = getResend();
  if (!resend) {
    logWarn('resend_api_key_missing', { provider: 'resend', operation: 'review-request-email' });
    return { accepted: false, reason: 'unconfigured' };
  }

  const trimmedEmail = params.email.trim();
  if (!trimmedEmail || params.products.length === 0) {
    logWarn('review_request_email_empty', { provider: 'resend', operation: 'review-request-email' });
    return { accepted: false, reason: 'invalid' };
  }

  const result = await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: brandSubject('¿Qué tal tu compra? Cuéntanos en 1 minuto'),
    logScope: 'review-request-email',
    deliveryId: params.deliveryId,
    element: (
      <ReviewRequestEmail
        customerName={params.customerName.trim() || 'Cliente'}
        products={params.products}
      />
    ),
  });
  return result;
}

export async function sendReviewRequestEmail(params: Parameters<typeof sendReviewRequestEmailResult>[0]): Promise<boolean> {
  return (await sendReviewRequestEmailResult(params)).accepted;
}

/** Correo de recuperación de contraseña. Errores se registran; no relanza. */
export async function sendPasswordResetEmail(email: string, token: string, expiresAt?: Date): Promise<void> {
  const resend = getResend();

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
    subject: brandSubject('Restablecer tu contraseña'),
    logScope: 'password-reset-email',
    expiresAt: expiresAt ?? new Date(Date.now() + 60 * 60_000),
    tokenType: 'PASSWORD_RESET',
    tokenHash: createHash('sha256').update(token.trim()).digest('hex'),
    element: <PasswordResetEmail resetUrl={resetUrl} />,
  });
}

/**
 * SEC-2026-09: aviso al correo ANTERIOR de que se solicitó un cambio de email.
 * Best-effort: nunca bloquea el flujo de cambio.
 */
export async function sendEmailChangeNoticeEmail(params: {
  to: string;
  customerName: string;
  newEmail: string;
}): Promise<void> {
  const resend = getResend();
  const trimmedEmail = params.to.trim();
  if (!trimmedEmail) return;

  const base = emailSiteBaseUrl().replace(/\/$/, '');
  await sendBrandedEmail({
    resend,
    to: trimmedEmail,
    subject: brandSubject('Se solicitó cambiar el correo de tu cuenta'),
    logScope: 'email-change-notice',
    element: (
      <EmailChangeNoticeEmail
        customerName={params.customerName.trim() || 'Cliente'}
        newEmail={params.newEmail}
        resetUrl={`${base}/forgot-password`}
      />
    ),
  });
}
