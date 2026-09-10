/**
 * lib/cashea.ts — cliente backend de Cashea, tipos del payload del SDK y el
 * adaptador de verificación autoritativa.
 *
 * Fuente de verdad: docs/ENTREGABLE-CLIENTE/integracion-cashea.md (Secciones
 * 3, 4, 5, 7 y 11). Este módulo es SOLO de servidor — nunca importar desde un
 * componente cliente (expondría `casheaPrivateFetch`/la clave privada).
 *
 * Dependencia bloqueante (Sección 4): Cashea no documenta cómo verificar de
 * forma autoritativa que la inicial fue cobrada (sin GET de estado ni webhook
 * documentados). Toda esa incertidumbre queda aislada en `verifyCasheaOrder`,
 * que lanza `CasheaVerificationNotImplemented` mientras no haya mecanismo
 * confirmado — el pedido queda pendiente para recuperación manual y NUNCA se
 * confirma sin evidencia real.
 */

import { getCasheaConfig, isCasheaEnabled } from '@/lib/cashea-config';
import { logError, logInfo, logWarn } from '@/lib/safe-logger';

// ── Tipos del payload del SDK (Sección 11.1) ───────────────────────────────

export type CasheaProduct = {
  id: string;
  name: string;
  sku: string;
  description: string;
  imageUrl: string;
  quantity: number;
  price: number;
  tax: number;
  discount: number;
};

export type CasheaStore = {
  id: number;
  name: string;
  enabled: boolean;
};

export type CasheaOrderInput = {
  store: CasheaStore;
  products: CasheaProduct[];
};

export type CasheaPayload = {
  identificationNumber: string;
  externalClientId: string;
  deliveryMethod: string;
  merchantName: string;
  redirectUrl: string;
  deliveryPrice: number;
  invoiceId?: string;
  orders: CasheaOrderInput[];
};

/** Métodos de envío internos que puede tener un pedido MundoTech (lib/shipping-charge.ts). */
export type InternalDeliveryMethod = 'tienda' | 'mrw' | 'zoom' | 'tealca';

// ── mapDeliveryMethod (Sección 11.3) ────────────────────────────────────────

/**
 * TODO(Sección 12, pregunta 5): Cashea aún no confirmó los valores oficiales
 * de `deliveryMethod`. Estos son placeholders seguros (nombres descriptivos)
 * — NO usar en producción con `CASHEA_ENABLED=true` sin verificarlos contra
 * la respuesta oficial de Cashea.
 */
export const DELIVERY_METHOD_MAP: Record<InternalDeliveryMethod, string> = {
  tienda: 'STORE_PICKUP',
  mrw: 'MRW',
  zoom: 'ZOOM',
  tealca: 'TEALCA',
};

/** Lanza si `internal` no está en DELIVERY_METHOD_MAP — nunca envía un valor inventado a Cashea. */
export function mapDeliveryMethod(internal: string): string {
  const mapped = DELIVERY_METHOD_MAP[internal as InternalDeliveryMethod];
  if (!mapped) {
    throw new Error(
      `[cashea] Método de envío interno "${internal}" no está mapeado a un deliveryMethod de ` +
        `Cashea. Métodos soportados: ${Object.keys(DELIVERY_METHOD_MAP).join(', ')}.`,
    );
  }
  return mapped;
}

// ── buildCasheaPayload (Sección 11.2) ───────────────────────────────────────

export type BuildCasheaPayloadArgs = {
  /** Cédula/RIF del cliente, ya validada por el servidor. */
  identificationNumber: string;
  /** `/checkout/cashea/return?token=<opaco>` — nunca el idNumber (Sección 3.9). */
  redirectUrl: string;
  shippingMethod: InternalDeliveryMethod;
  /** Ya calculados por el servidor (precios/tasa desde BD) — nunca confiar en el cliente. */
  products: CasheaProduct[];
  invoiceId?: string;
};

/**
 * Arma el `CasheaPayload` a partir de datos YA calculados por el servidor.
 * `deliveryPrice` siempre 0 (Sección 1/5/7) y jamás incluye descuentos de
 * cupón: cupones están prohibidos con Cashea (Sección 1/7) — el caller nunca
 * debe pasar productos con descuentos derivados de un cupón aplicado.
 */
export function buildCasheaPayload(args: BuildCasheaPayloadArgs): CasheaPayload {
  const config = getCasheaConfig();

  if (!config.externalClientId || !config.storeId || !config.storeName || !config.merchantName) {
    throw new Error(
      '[cashea] buildCasheaPayload requiere CASHEA_EXTERNAL_CLIENT_ID, CASHEA_STORE_ID, ' +
        'CASHEA_STORE_NAME y CASHEA_MERCHANT_NAME configurados.',
    );
  }

  const payload: CasheaPayload = {
    identificationNumber: args.identificationNumber,
    externalClientId: config.externalClientId,
    deliveryMethod: mapDeliveryMethod(args.shippingMethod),
    merchantName: config.merchantName,
    redirectUrl: args.redirectUrl,
    // Sección 1/5/7: SIEMPRE 0 (flete a cobro a destino). Nunca leído de args/config variable.
    deliveryPrice: 0,
    orders: [
      {
        store: { id: config.storeId, name: config.storeName, enabled: true },
        products: args.products,
      },
    ],
  };

  if (args.invoiceId) {
    payload.invoiceId = args.invoiceId;
  }

  return payload;
}

// ── casheaPrivateFetch (Sección 11.4) ───────────────────────────────────────

const CASHEA_FETCH_TIMEOUT_MS = 15_000;
/** Solo se reintentan métodos idempotentes (Sección 7: "1 reintento solo para errores de red/5xx idempotentes"). */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE']);

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cashea-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type FetchAttempt = { response: Response } | { error: unknown };

async function attemptCasheaFetch(url: string, init: RequestInit): Promise<FetchAttempt> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CASHEA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableAttempt(attempt: FetchAttempt): boolean {
  if ('error' in attempt) return true;
  return attempt.response.status >= 500;
}

/**
 * Fetch autenticado hacia el API privado de Cashea. NUNCA loguea la clave —
 * solo method+path+status+requestId (Sección 11.4). Reintenta como máximo
 * una vez, y solo si el método es idempotente y el fallo es de red o 5xx.
 */
export async function casheaPrivateFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = getCasheaConfig();
  if (!config.apiBaseUrl || !config.privateApiKey) {
    throw new Error(
      '[cashea] casheaPrivateFetch requiere CASHEA_API_BASE_URL y CASHEA_PRIVATE_API_KEY configurados.',
    );
  }

  const url = new URL(path, config.apiBaseUrl).toString();
  const method = (init.method ?? 'GET').toUpperCase();
  const requestId = newRequestId();

  const headers = new Headers(init.headers);
  headers.set('Authorization', `ApiKey ${config.privateApiKey}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const requestInit: RequestInit = { ...init, method, headers };

  let attempt = await attemptCasheaFetch(url, requestInit);
  const isIdempotent = IDEMPOTENT_METHODS.has(method);

  if (isIdempotent && isRetryableAttempt(attempt)) {
    logWarn('cashea_fetch_retry', {
      operation: 'cashea_private_fetch',
      route: `${method} ${path}`,
      requestId,
      status: 'error' in attempt ? undefined : attempt.response.status,
    });
    attempt = await attemptCasheaFetch(url, requestInit);
  }

  if ('error' in attempt) {
    logError('cashea_fetch_failed', attempt.error, {
      operation: 'cashea_private_fetch',
      route: `${method} ${path}`,
      requestId,
    });
    throw attempt.error;
  }

  logInfo('cashea_fetch', {
    operation: 'cashea_private_fetch',
    route: `${method} ${path}`,
    status: attempt.response.status,
    requestId,
  });

  return attempt.response;
}

// ── Seguridad: validación de casheaOrderId (anti path/SSRF injection) ──────

const CASHEA_ORDER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function assertSafeCasheaOrderId(casheaOrderId: string): void {
  if (!CASHEA_ORDER_ID_RE.test(casheaOrderId)) {
    throw new Error(
      '[cashea] casheaOrderId inválido: solo se permiten letras, números, "_" y "-" (máx. 128 chars).',
    );
  }
}

// ── confirmDownPayment (Sección 11.5) ───────────────────────────────────────

/**
 * TODO(Sección 12, pregunta 9): confirmamos que Cashea cobra la inicial, pero
 * no está confirmado si además el comercio DEBE llamar a este endpoint, ni
 * con qué `amount` exacto. No inventar: usar solo cuando Cashea lo confirme.
 */
export async function confirmDownPayment(
  casheaOrderId: string,
  amount: number,
): Promise<{ ok: boolean; status: number }> {
  assertSafeCasheaOrderId(casheaOrderId);

  const response = await casheaPrivateFetch(`/orders/${casheaOrderId}/down-payment`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

  // TODO(Sección 12, pregunta 12): Cashea no documenta qué código devuelve una
  // llamada repetida (¿201 de nuevo? ¿409/200 "ya confirmado"?). Hasta que se
  // confirme, se trata cualquier 2xx como "ok"; ningún otro código se asume
  // como éxito silencioso.
  return { ok: response.ok, status: response.status };
}

// ── cancelCasheaOrder (Sección 11.6) ────────────────────────────────────────

export async function cancelCasheaOrder(
  casheaOrderId: string,
): Promise<{ ok: boolean; status: number }> {
  assertSafeCasheaOrderId(casheaOrderId);

  const response = await casheaPrivateFetch(`/orders/${casheaOrderId}`, {
    method: 'DELETE',
  });

  // TODO(Sección 12, pregunta 12): código exacto para "orden ya cancelada" sin
  // confirmar por Cashea. Hasta entonces solo 2xx cuenta como ok; cualquier
  // otro código se reporta como no-ok para reintento/recuperación manual.
  return { ok: response.ok, status: response.status };
}

// ── verifyCasheaOrder (Sección 11.7 / Sección 4) ────────────────────────────

/**
 * Lanzado por `verifyCasheaOrder` mientras no exista un mecanismo de
 * verificación autoritativa confirmado por Cashea. El caller DEBE tratar esto
 * como "queda pendiente para recuperación manual" — nunca como confirmación.
 */
export class CasheaVerificationNotImplemented extends Error {
  constructor(casheaOrderId: string) {
    super(
      `[cashea] verifyCasheaOrder("${casheaOrderId}") no tiene mecanismo de verificación ` +
        'autoritativa configurado todavía (Sección 12, pregunta 8: GET de estado, webhook o ' +
        'confirmación por down-payment, sin confirmar). El pedido queda pendiente para ' +
        'recuperación manual; nunca se confirma sin evidencia real.',
    );
    this.name = 'CasheaVerificationNotImplemented';
  }
}

export type VerifyCasheaOrderResult = {
  confirmed: boolean;
  initialAmount?: number;
  raw: unknown;
};

/**
 * ÚNICO punto que depende del contrato final de Cashea (Sección 4). Mientras
 * Cashea no confirme el mecanismo real, SIEMPRE lanza `CasheaVerificationNotImplemented`
 * — jamás se marca `paidAt`/CONFIRMED sin evidencia autoritativa (Sección 3.11/3.12).
 *
 * Esqueleto de las 3 opciones posibles según lo que responda Cashea
 * (Sección 12, pregunta 8) — implementar SOLO UNA, la que Cashea confirme:
 *
 *   OPCIÓN A — GET de estado de la orden:
 *     const response = await casheaPrivateFetch(`/orders/${casheaOrderId}`, { method: 'GET' });
 *     const raw: unknown = await response.json();
 *     // TODO: mapear raw.status/raw.downPayment según el contrato real y
 *     // devolver { confirmed, initialAmount, raw } con evidencia real.
 *
 *   OPCIÓN B — Webhook (validado/persistido en una ruta aparte hacia
 *     Order.casheaStatus/casheaLastResponseCode); esta función solo leería el
 *     estado ya persistido localmente, sin llamar de nuevo a Cashea:
 *     // const order = await prisma.order.findUnique({ where: { casheaOrderId } });
 *     // TODO: devolver { confirmed: order?.casheaStatus === 'CONFIRMED', raw: order }.
 *
 *   OPCIÓN C — El propio `POST /down-payment` (confirmDownPayment) YA es la
 *     confirmación (si Cashea solo responde 2xx cuando el cobro fue efectivo):
 *     // TODO: reutilizar el resultado de confirmDownPayment() en vez de una
 *     // llamada nueva; requiere que Cashea confirme esta semántica primero.
 *
 * Sin respuesta oficial de Cashea, no se asume ninguna de las 3 — lanzar es
 * la única opción segura (fail-closed).
 */
export async function verifyCasheaOrder(casheaOrderId: string): Promise<VerifyCasheaOrderResult> {
  assertSafeCasheaOrderId(casheaOrderId);

  if (isCasheaEnabled()) {
    logWarn('cashea_verify_not_implemented', {
      operation: 'verify_cashea_order',
      orderId: casheaOrderId,
    });
  }

  throw new CasheaVerificationNotImplemented(casheaOrderId);
}
