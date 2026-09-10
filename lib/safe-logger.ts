import * as Sentry from '@sentry/nextjs';

// ── Tipos cerrados ────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

export type SafeLogContext = {
  requestId?: string;
  orderId?: string;
  route?: string;
  operation?: string;
  status?: number | string;
  count?: number;
  durationMs?: number;
  errorName?: string;
  provider?: 'r2' | 'resend' | 'upstash' | 'postgres' | 'nextauth';
};

type SafeError = { name: string; message: string };

// ── Patrones de sanitización ──────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/g;
const PG_URL_RE = /postgres(?:ql)?:\/\/[^@\s]+@[^\s]+/g;
const MYSQL_URL_RE = /mysql:\/\/[^@\s]+@[^\s]+/g;
const AMZ_QUERY_RE = /[?&]X-Amz-[A-Za-z0-9%-]+=[^&\s]+/g;
const SIGNED_URL_RE = /https?:\/\/[^\s]+\?[^\s]*(?:X-Amz-Signature|X-Amz-Credential|X-Amz-SignedHeaders|X-Amz-Expires)[^\s]*/g;
const SECRET_PATTERN_RE =
  /\b(cfat_|gh[pousr]_[A-Za-z0-9]+|re_[A-Za-z0-9]+|sk_live_|sk_test_|rk_live_|rk_test_|whsec_|ssec_|acct_)[A-Za-z0-9_-]+\b/g;
const LABELED_SECRET_RE =
  /\b(password|secret|token|accessKey|privateKey|apiKey|cf_secret|cf_token|signing_secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-./+=%]+/gi;
const EVENT_RE =
  /^[a-z0-9_]{1,80}$/;
const VENEZUELA_PHONE_RE =
  /(?<!\d)(?:\+?58[\s-]?)?0?4(?:12|14|16|24|26)[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;
const VENEZUELA_ID_RE =
  /\b[VEJGP]\s*[-:]?\s*\d{6,9}\b/gi;
const LABELED_REFERENCE_RE =
  /\b(reference|referencia|paymentReference)\s*[=:]\s*["']?[A-Za-z0-9-]{4,40}["']?/gi;
const LABELED_ADDRESS_RE =
  /\b(address|direccion|dirección|shippingAddress)\s*[=:]\s*["']?[^"'\n;]{5,180}["']?/gi;

const MAX_MESSAGE_LENGTH = 500;

/** Reemplaza PII/secrets en un string de texto plano. */
export function sanitizeText(value: string): string {
  let result = String(value);

  // Orden: patrones más específicos primero
  result = result.replace(SIGNED_URL_RE, '[REDACTED_SIGNED_URL]');
  result = result.replace(AMZ_QUERY_RE, ' [REDACTED_SIGNED_PARAM]');
  result = result.replace(PG_URL_RE, '[REDACTED_DATABASE_URL]');
  result = result.replace(MYSQL_URL_RE, '[REDACTED_DATABASE_URL]');
  result = result.replace(BEARER_RE, 'Bearer [REDACTED]');
  result = result.replace(SECRET_PATTERN_RE, '[REDACTED_SECRET]');
  result = result.replace(LABELED_SECRET_RE, '$1=[REDACTED_SECRET]');
  result = result.replace(VENEZUELA_PHONE_RE, '[REDACTED_PHONE]');
  result = result.replace(VENEZUELA_ID_RE, '[REDACTED_ID]');
  result = result.replace(LABELED_REFERENCE_RE, '$1=[REDACTED_REFERENCE]');
  result = result.replace(LABELED_ADDRESS_RE, '$1=[REDACTED_ADDRESS]');
  result = result.replace(EMAIL_RE, '[REDACTED_EMAIL]');

  return result.slice(0, MAX_MESSAGE_LENGTH);
}

// ── Normalización de errores ──────────────────────────────────────────────

export function normalizeError(error: unknown): SafeError {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: sanitizeText(error.message) };
  }
  if (typeof error === 'string') {
    return { name: 'ExternalError', message: sanitizeText(error) };
  }
  return { name: 'UnknownError', message: 'Unknown error type (non-serializable)' };
}

export function sanitizeEvent(event: string): string {
  const normalized = String(event).trim();
  return EVENT_RE.test(normalized) ? normalized : 'invalid_log_event';
}

export function sanitizeContext(context?: SafeLogContext): SafeLogContext | undefined {
  if (!context) {
    return undefined;
  }
  const safe: SafeLogContext = {};
  if (context.requestId) {
    safe.requestId = sanitizeText(context.requestId);
  }
  if (context.orderId) {
    safe.orderId = sanitizeText(context.orderId);
  }
  if (context.route) {
    safe.route = sanitizeText(context.route);
  }
  if (context.operation) {
    safe.operation = sanitizeText(context.operation);
  }
  if (typeof context.status === 'string') {
    safe.status = sanitizeText(context.status);
  } else if (typeof context.status === 'number' && Number.isFinite(context.status)) {
    safe.status = context.status;
  }
  if (typeof context.count === 'number' && Number.isFinite(context.count)) {
    safe.count = context.count;
  }
  if (typeof context.durationMs === 'number' && Number.isFinite(context.durationMs) && context.durationMs >= 0) {
    safe.durationMs = context.durationMs;
  }
  if (context.errorName) {
    safe.errorName = sanitizeText(context.errorName);
  }
  if (context.provider) {
    safe.provider = context.provider;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

// ── Entorno productivo ────────────────────────────────────────────────────

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function outputLine(level: LogLevel, event: string, context?: SafeLogContext, safeError?: SafeError): void {
  const safeEvent = sanitizeEvent(event);
  const safeContext = sanitizeContext(context);

  const line: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    event: safeEvent,
  };
  if (safeContext && Object.keys(safeContext).length > 0) {
    line.context = safeContext;
  }
  if (safeError) {
    line.error = safeError;
  }

  const jsonLine = JSON.stringify(line);

  if (isProduction()) {
    switch (level) {
      case 'error':
        console.error(jsonLine);
        break;
      case 'warn':
        console.warn(jsonLine);
        break;
      default:
        console.log(jsonLine);
    }
  } else {
    const ctxStr = safeContext && Object.keys(safeContext).length > 0
      ? ` ctx=${JSON.stringify(safeContext)}`
      : '';
    const errStr = safeError ? ` err=${safeError.name}:${safeError.message}` : '';
    const msg = `[${safeEvent}]${ctxStr}${errStr}`;
    switch (level) {
      case 'error':
        console.error(msg);
        break;
      case 'warn':
        console.warn(msg);
        break;
      default:
        console.log(msg);
    }
  }
}

// ── API pública ───────────────────────────────────────────────────────────

export function logInfo(event: string, context?: SafeLogContext): void {
  outputLine('info', event, context);
}

export function logWarn(event: string, context?: SafeLogContext): void {
  outputLine('warn', event, context);
}

export function logError(event: string, error: unknown, context?: SafeLogContext): void {
  const safeEvent = sanitizeEvent(event);
  const safeContext = sanitizeContext(context);
  const safeError = normalizeError(error);

  // Enviar a Sentry solo en producción con DSN configurado
  if (isProduction() && process.env.SENTRY_DSN) {
    const sentryError = new Error(safeError.message);
    sentryError.name = safeError.name;

    Sentry.captureException(sentryError, {
      tags: {
        event: safeEvent,
        ...(safeContext?.provider ? { provider: safeContext.provider } : {}),
        ...(safeContext?.route ? { route: safeContext.route } : {}),
      },
      extra: safeContext
        ? { requestId: safeContext.requestId, orderId: safeContext.orderId, operation: safeContext.operation }
        : undefined,
    });
  }

  outputLine('error', safeEvent, safeContext, safeError);
}
