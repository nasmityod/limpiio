import { tryParseExchangeRateFromString } from '@/lib/exchange-rate';
import { logError } from '@/lib/safe-logger';

const BCV_FETCH_TIMEOUT_MS = 8_000;
const DOLLARAPI_OFICIAL_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const PYDOLARVE_BCV_URL = 'https://pydolarve.org/api/v1/dollar?page=bcv';

export type BcvRateResult = { rate: number; date: string };

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BCV_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRateFromDolarApi(data: unknown): BcvRateResult | null {
  if (typeof data !== 'object' || data === null) return null;

  const record = data as Record<string, unknown>;
  const promedio = record.promedio;
  const fechaActualizacion = record.fechaActualizacion;

  if (typeof promedio !== 'number' && typeof promedio !== 'string') return null;
  if (typeof fechaActualizacion !== 'string' || fechaActualizacion === '') return null;

  const rate =
    typeof promedio === 'number'
      ? promedio
      : tryParseExchangeRateFromString(promedio);

  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;

  return { rate, date: fechaActualizacion };
}

function parseRateFromPyDolarVe(data: unknown): BcvRateResult | null {
  if (typeof data !== 'object' || data === null) return null;

  const record = data as Record<string, unknown>;
  const monitors = record.monitors;

  if (typeof monitors !== 'object' || monitors === null) return null;

  const usd = (monitors as Record<string, unknown>).usd;
  if (typeof usd !== 'object' || usd === null) return null;

  const usdRecord = usd as Record<string, unknown>;
  const price = usdRecord.price;
  const lastUpdate = usdRecord.last_update ?? usdRecord.lastUpdate;

  let rate: number | null = null;
  if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
    rate = price;
  } else if (typeof price === 'string') {
    rate = tryParseExchangeRateFromString(price);
  }

  if (rate == null) return null;
  if (typeof lastUpdate !== 'string' || lastUpdate === '') return null;

  return { rate, date: lastUpdate };
}

async function fetchFromDolarApi(): Promise<BcvRateResult | null> {
  try {
    const response = await fetchWithTimeout(DOLLARAPI_OFICIAL_URL);
    if (!response.ok) {
      logError('bcv_dolarapi_bad_status', new Error('Non-OK response'), {
        status: response.status,
        operation: 'fetch_bcv_rate',
      });
      return null;
    }

    const data: unknown = await response.json();
    const parsed = parseRateFromDolarApi(data);
    if (!parsed) {
      logError('bcv_dolarapi_invalid_response', new Error('Invalid rate payload'), {
        operation: 'fetch_bcv_rate',
      });
    }
    return parsed;
  } catch (error) {
    logError('bcv_dolarapi_failed', error, { operation: 'fetch_bcv_rate' });
    return null;
  }
}

async function fetchFromPyDolarVe(): Promise<BcvRateResult | null> {
  try {
    const response = await fetchWithTimeout(PYDOLARVE_BCV_URL);
    if (!response.ok) {
      logError('bcv_pydolarve_bad_status', new Error('Non-OK response'), {
        status: response.status,
        operation: 'fetch_bcv_rate',
      });
      return null;
    }

    const data: unknown = await response.json();
    const parsed = parseRateFromPyDolarVe(data);
    if (!parsed) {
      logError('bcv_pydolarve_invalid_response', new Error('Invalid rate payload'), {
        operation: 'fetch_bcv_rate',
      });
    }
    return parsed;
  } catch (error) {
    logError('bcv_pydolarve_failed', error, { operation: 'fetch_bcv_rate' });
    return null;
  }
}

/**
 * Obtiene la tasa oficial BCV desde APIs públicas.
 * Fuente principal: ve.dolarapi.com; respaldo: pydolarve.org.
 * Nunca lanza excepción — devuelve null ante cualquier fallo.
 */
export async function fetchBcvRate(): Promise<BcvRateResult | null> {
  try {
    const primary = await fetchFromDolarApi();
    if (primary) return primary;

    return await fetchFromPyDolarVe();
  } catch (error) {
    logError('bcv_unexpected_error', error, { operation: 'fetch_bcv_rate' });
    return null;
  }
}
