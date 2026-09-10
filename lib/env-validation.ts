/**
 * env-validation.ts — validación de variables de entorno al arranque.
 * Importado desde lib/prisma.ts para que cualquier ruta que toque la BD
 * falle temprano y con un mensaje claro si falta configuración crítica.
 */
import { logWarn } from '@/lib/safe-logger';

/** Imprescindibles para arrancar el servidor (fail-fast en runtime). */
const REQUIRED_ALWAYS = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'] as const;

/**
 * Recomendadas en producción — solo advertencia (degradación graceful).
 * RESEND_*: coherente con lib/resend.tsx (omite envío sin API key / From).
 */
const RECOMMENDED_IN_PRODUCTION = ['RESEND_API_KEY', 'RESEND_FROM_ADDRESS'] as const;

/**
 * Requeridas en producción en runtime (en dev se degradan con warning).
 * PRD-010 / PRD-108: R2 es imprescindible para subir imágenes y comprobantes
 * de pago — debe validarse al arranque, no al primer upload.
 */
const REQUIRED_IN_PRODUCTION = [
  'CRON_SECRET',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_BASE_URL',
  'R2_PRIVATE_BUCKET_NAME',
  'R2_PRIVATE_ACCESS_KEY_ID',
  'R2_PRIVATE_SECRET_ACCESS_KEY',
  'CHECKOUT_MODE',
  // Sin esto en producción, el rate limiting cae al fallback en memoria del
  // proceso: cada `pm2 restart`/deploy borra los contadores de fuerza bruta.
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

/** PRD-060: valores admitidos para DEPLOYMENT_ENV (extracción segura de IP). */
const VALID_DEPLOYMENT_ENVS = ['vercel', 'cloudflare'] as const;

/**
 * Guest solo en whatsapp / auth obligatoria en full (lib/checkout-mode.ts).
 * El servidor decide el modo — nunca el cliente ni NEXT_PUBLIC_*.
 */
export const VALID_CHECKOUT_MODES = ['whatsapp', 'full'] as const;

/**
 * SESIÓN 07: valida que TEMP_TOKEN_RETENTION_DAYS y DELETED_UPLOAD_RETENTION_DAYS
 * sean enteros en el rango 1..365. En desarrollo se usan defaults si faltan;
 * en producción se omite la categoría si la variable no está definida.
 */
function validateRetentionDays(name: string, value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    const isProduction = process.env.NODE_ENV === 'production';
    const msg =
      `[env] ${name}="${value}" no es válido. Debe ser un entero entre 1 y 365.`;
    if (isProduction) {
      throw new Error(`${msg} Revisa .env.example.`);
    }
    logWarn('env_retention_days_invalid', { operation: 'validate_env' });
    return null;
  }
  return parsed;
}

/**
 * Variables Cashea requeridas SOLO cuando CASHEA_ENABLED=true (Sección 5/9
 * del documento maestro). Con el flag en false (default), la integración
 * automática permanece apagada y estas variables son opcionales.
 */
const CASHEA_REQUIRED_WHEN_ENABLED = [
  'CASHEA_API_BASE_URL',
  'CASHEA_PRIVATE_API_KEY',
  'CASHEA_EXTERNAL_CLIENT_ID',
  'CASHEA_STORE_ID',
  'CASHEA_STORE_NAME',
  'CASHEA_MERCHANT_NAME',
  'NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY',
  'CASHEA_CURRENCY',
  'CASHEA_SDK_VERSION',
] as const;

function parseCasheaBoolean(name: string, value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    throw new Error(
      `[env] ${name}="${value}" no es válido. Debe ser exactamente "true" o "false".`,
    );
  }
  return normalized === 'true';
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Valida el bloque Cashea (Sección 5/9 del documento maestro). Con el flag
 * apagado (default) no exige nada: el modo manual actual sigue intacto.
 * Con el flag encendido, exige el set completo de credenciales/config para
 * que el flujo automático nunca arranque a medias.
 */
function validateCasheaEnv(): void {
  const enabled = parseCasheaBoolean('CASHEA_ENABLED', process.env.CASHEA_ENABLED);
  const publicEnabled = parseCasheaBoolean(
    'NEXT_PUBLIC_CASHEA_ENABLED',
    process.env.NEXT_PUBLIC_CASHEA_ENABLED,
  );

  if (enabled !== publicEnabled) {
    throw new Error(
      '[env] CASHEA_ENABLED y NEXT_PUBLIC_CASHEA_ENABLED deben coincidir (espejo del flag para el cliente).',
    );
  }

  if (enabled) {
    const missing = CASHEA_REQUIRED_WHEN_ENABLED.filter((k) => !process.env[k]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `[env] CASHEA_ENABLED=true pero faltan variables requeridas: ${missing.join(', ')}. ` +
          'Revisa .env.example (bloque Cashea).',
      );
    }

    const baseUrl = process.env.CASHEA_API_BASE_URL as string;
    if (!isValidHttpUrl(baseUrl)) {
      throw new Error(`[env] CASHEA_API_BASE_URL="${baseUrl}" no es una URL http(s) válida.`);
    }

    const storeId = Number(process.env.CASHEA_STORE_ID);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw new Error(
        `[env] CASHEA_STORE_ID="${process.env.CASHEA_STORE_ID}" no es válido. Debe ser un entero positivo.`,
      );
    }
  }

  const reservationRaw = process.env.CASHEA_RESERVATION_MINUTES;
  if (reservationRaw?.trim()) {
    const minutes = Number(reservationRaw);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new Error(
        `[env] CASHEA_RESERVATION_MINUTES="${reservationRaw}" no es válido. Debe ser un entero entre 1 y 1440.`,
      );
    }
  }

  const deliveryPriceRaw = process.env.CASHEA_DELIVERY_PRICE;
  if (deliveryPriceRaw?.trim()) {
    const price = Number(deliveryPriceRaw);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(
        `[env] CASHEA_DELIVERY_PRICE="${deliveryPriceRaw}" no es válido. Debe ser un número >= 0.`,
      );
    }
  }
}

let validated = false;

export function validateEnv(): void {
  if (validated) return;
  validated = true;

  // Durante `next build` no hay runtime real; la validación dura ocurre en el
  // primer request / arranque del servidor de producción.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const isProduction = process.env.NODE_ENV === 'production';

  const missing = REQUIRED_ALWAYS.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[env] Faltan variables de entorno críticas: ${missing.join(', ')}. ` +
        'Revisa .env.example para el formato esperado.',
    );
  }

  const missingRecommended = RECOMMENDED_IN_PRODUCTION.filter((k) => !process.env[k]?.trim());
  if (missingRecommended.length > 0) {
    logWarn('env_recommended_vars_missing', { operation: 'validate_env', count: missingRecommended.length });
  }

  const missingProd = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]?.trim());
  if (missingProd.length > 0) {
    if (isProduction) {
      throw new Error(
        `[env] Variables requeridas en producción ausentes: ${missingProd.join(', ')}. Revisa .env.example y el EnvironmentFile del entorno de producción.`,
      );
    }
    logWarn('env_production_vars_missing', { operation: 'validate_env', count: missingProd.length });
  }

  // SESIÓN 07: validar variables de retención
  validateRetentionDays('TEMP_TOKEN_RETENTION_DAYS', process.env.TEMP_TOKEN_RETENTION_DAYS);
  validateRetentionDays('DELETED_UPLOAD_RETENTION_DAYS', process.env.DELETED_UPLOAD_RETENTION_DAYS);

  // SESIÓN 08: sin DEPLOYMENT_ENV en producción la IP del cliente se extrae
  // de cabeceras falsificables → rate limit evadible. Ahora es OBLIGATORIO:
  // producción sin proxy confiable debe lanzar temprano.
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.trim().toLowerCase();
  if (deploymentEnv && !(VALID_DEPLOYMENT_ENVS as readonly string[]).includes(deploymentEnv)) {
    const msg =
      `[env] DEPLOYMENT_ENV="${process.env.DEPLOYMENT_ENV}" no es válido. ` +
      `Valores admitidos: ${VALID_DEPLOYMENT_ENVS.join(', ')}.`;
    if (isProduction) {
      throw new Error(msg);
    }
    logWarn('env_deployment_env_invalid', { operation: 'validate_env' });
  }

  if (isProduction && !deploymentEnv) {
    throw new Error(
      '[env] DEPLOYMENT_ENV es obligatorio en producción. ' +
        'Configura DEPLOYMENT_ENV=cloudflare (para el VPS detrás de Cloudflare) ' +
        'o DEPLOYMENT_ENV=vercel (si despliegas en Vercel). ' +
        'Sin un proxy de confianza, las IPs de cliente son falsificables y el rate limiting es evadible.',
    );
  }

  // Guest solo en whatsapp / auth obligatoria en full — el modo NUNCA debe
  // quedar indefinido ni fuera de la allowlist en producción (fail-closed:
  // lib/checkout-mode.ts ya degrada a 'full', pero acá se exige explícito).
  const checkoutModeRaw = process.env.CHECKOUT_MODE?.trim().toLowerCase();
  const checkoutModeValid =
    !!checkoutModeRaw &&
    (VALID_CHECKOUT_MODES as readonly string[]).includes(checkoutModeRaw);
  if (!checkoutModeValid) {
    if (isProduction) {
      throw new Error(
        `[env] CHECKOUT_MODE ausente o inválido. Valores admitidos: ${VALID_CHECKOUT_MODES.join(', ')}. ` +
          'Revisa .env.example. No usar NEXT_PUBLIC_CHECKOUT_MODE.',
      );
    }
    // No se imprime el valor recibido para no filtrar configuración en logs.
    logWarn('env_checkout_mode_invalid', { operation: 'validate_env' });
  }

  // Cashea (Sección 5/9 del documento maestro): con el flag apagado no exige
  // nada; con el flag encendido exige el set completo de configuración.
  validateCasheaEnv();
}

validateEnv();
