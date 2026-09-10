/**
 * lib/cashea-config.ts — configuración tipada de la integración Cashea.
 *
 * Fuente de verdad: docs/ENTREGABLE-CLIENTE/integracion-cashea.md (Secciones
 * 2, 5 y 9). Mientras `CASHEA_ENABLED=false` (default), el método Cashea
 * sigue en su modo manual actual (coordinar por WhatsApp) y nada de esto se
 * usa. Solo cuando el flag pasa a `true` y llegan las credenciales reales, el
 * flujo automático se activa.
 *
 * IMPORTANTE (seguridad): `getCasheaConfig()` expone `privateApiKey` y es
 * SOLO de servidor. Lanza en tiempo de ejecución si por error se invoca desde
 * el navegador, para que un import accidental en un componente cliente falle
 * ruidosamente en vez de degradar en silencio. Ningún componente cliente debe
 * importar ni renderizar `privateApiKey`; para render condicional en cliente
 * se usa directamente `NEXT_PUBLIC_CASHEA_ENABLED`, nunca este módulo.
 */

export type CasheaEnvironment = 'sandbox' | 'production';

/**
 * Configuración completa server-side. Con `enabled: false` los campos que
 * dependen de credenciales pueden venir en `null` (modo manual actual, sin
 * requisitos). Con `enabled: true`, `getCasheaConfig()` garantiza que todos
 * estén presentes (o lanza) — nunca hay un estado "a medias" activo.
 */
export type CasheaConfig = {
  enabled: boolean;
  environment: CasheaEnvironment;
  apiBaseUrl: string | null;
  /** SOLO servidor. Nunca serializar hacia el cliente ni loguear. */
  privateApiKey: string | null;
  externalClientId: string | null;
  storeId: number | null;
  storeName: string | null;
  merchantName: string | null;
  sdkVersion: string;
  reservationMinutes: number;
  /**
   * TODO(Sección 12, pregunta 1): moneda en la que Cashea espera los montos
   * (USD o VES, decimal o centavos). Placeholder seguro hasta confirmación
   * oficial; no asumir sin respuesta de Cashea.
   */
  currency: string;
  /** Siempre 0 (flete a cobro a destino) — Sección 1/5. */
  deliveryPrice: number;
  publicApiKey: string | null;
  /** Espejo de `enabled` expuesto al cliente vía `NEXT_PUBLIC_CASHEA_ENABLED`. */
  publicEnabled: boolean;
};

const DEFAULT_SDK_VERSION = '1.1.19';
const DEFAULT_RESERVATION_MINUTES = 60;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_DELIVERY_PRICE = 0;
const DEFAULT_ENVIRONMENT: CasheaEnvironment = 'sandbox';

const REQUIRED_WHEN_ENABLED = [
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

function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      '[cashea-config] getCasheaConfig() es exclusivamente de servidor y no debe ' +
        'invocarse desde el cliente (expone privateApiKey).',
    );
  }
}

function parseBoolean(name: string, value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'true' && normalized !== 'false') {
    throw new Error(`[cashea-config] ${name}="${value}" no es válido. Usa "true" o "false".`);
  }
  return normalized === 'true';
}

function parseEnvironment(value: string | undefined): CasheaEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return DEFAULT_ENVIRONMENT;
  if (normalized === 'sandbox' || normalized === 'production') return normalized;
  throw new Error(
    `[cashea-config] CASHEA_ENV="${value}" no es válido. Usa "sandbox" o "production".`,
  );
}

function parseIntInRange(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `[cashea-config] ${name}="${value}" no es válido. Debe ser un entero entre ${min} y ${max}.`,
    );
  }
  return parsed;
}

function parseNonNegativeNumber(name: string, value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`[cashea-config] ${name}="${value}" no es válido. Debe ser un número >= 0.`);
  }
  return parsed;
}

/**
 * Lee y normaliza la configuración Cashea desde `process.env`.
 *
 * - `CASHEA_ENABLED=false` (default): campos dependientes de credenciales
 *   quedan en `null`; no se exige nada más (modo manual actual intacto).
 * - `CASHEA_ENABLED=true`: exige el set completo de la Sección 5; si falta
 *   algo, lanza con un mensaje claro listando las variables ausentes — nunca
 *   arranca el flujo automático a medias.
 */
export function getCasheaConfig(): CasheaConfig {
  assertServerOnly();

  const enabled = parseBoolean('CASHEA_ENABLED', process.env.CASHEA_ENABLED);
  const publicEnabled = parseBoolean(
    'NEXT_PUBLIC_CASHEA_ENABLED',
    process.env.NEXT_PUBLIC_CASHEA_ENABLED,
  );

  const environment = parseEnvironment(process.env.CASHEA_ENV);
  const reservationMinutes = parseIntInRange(
    'CASHEA_RESERVATION_MINUTES',
    process.env.CASHEA_RESERVATION_MINUTES,
    DEFAULT_RESERVATION_MINUTES,
    1,
    1440,
  );
  const deliveryPrice = parseNonNegativeNumber(
    'CASHEA_DELIVERY_PRICE',
    process.env.CASHEA_DELIVERY_PRICE,
    DEFAULT_DELIVERY_PRICE,
  );
  const sdkVersion = process.env.CASHEA_SDK_VERSION?.trim() || DEFAULT_SDK_VERSION;
  const currency = process.env.CASHEA_CURRENCY?.trim() || DEFAULT_CURRENCY;

  if (enabled) {
    const missing = REQUIRED_WHEN_ENABLED.filter((key) => !process.env[key]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `[cashea-config] CASHEA_ENABLED=true pero faltan variables requeridas: ${missing.join(', ')}. ` +
          'Revisa .env.example (bloque Cashea).',
      );
    }

    const storeId = Number(process.env.CASHEA_STORE_ID);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw new Error(
        `[cashea-config] CASHEA_STORE_ID="${process.env.CASHEA_STORE_ID}" no es válido. ` +
          'Debe ser un entero positivo.',
      );
    }

    return {
      enabled,
      environment,
      apiBaseUrl: process.env.CASHEA_API_BASE_URL as string,
      privateApiKey: process.env.CASHEA_PRIVATE_API_KEY as string,
      externalClientId: process.env.CASHEA_EXTERNAL_CLIENT_ID as string,
      storeId,
      storeName: process.env.CASHEA_STORE_NAME as string,
      merchantName: process.env.CASHEA_MERCHANT_NAME as string,
      sdkVersion,
      reservationMinutes,
      currency,
      deliveryPrice,
      publicApiKey: process.env.NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY as string,
      publicEnabled,
    };
  }

  return {
    enabled: false,
    environment,
    apiBaseUrl: process.env.CASHEA_API_BASE_URL?.trim() || null,
    privateApiKey: process.env.CASHEA_PRIVATE_API_KEY?.trim() || null,
    externalClientId: process.env.CASHEA_EXTERNAL_CLIENT_ID?.trim() || null,
    storeId: process.env.CASHEA_STORE_ID?.trim() ? Number(process.env.CASHEA_STORE_ID) : null,
    storeName: process.env.CASHEA_STORE_NAME?.trim() || null,
    merchantName: process.env.CASHEA_MERCHANT_NAME?.trim() || null,
    sdkVersion,
    reservationMinutes,
    currency,
    deliveryPrice,
    publicApiKey: process.env.NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY?.trim() || null,
    publicEnabled,
  };
}

/**
 * Chequeo rápido server-side del master switch, sin validar el resto de la
 * configuración. Útil para guardas tempranas (ej. rutas/acciones que deben
 * responder 404/no-op mientras Cashea está apagado).
 */
export function isCasheaEnabled(): boolean {
  return parseBoolean('CASHEA_ENABLED', process.env.CASHEA_ENABLED);
}
