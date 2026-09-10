/**
 * lib/operations-health.ts — SESIÓN 11
 *
 * Cálculo puro de staleness de operaciones (BCV, backup, purga de datos).
 * Reutilizado por:
 *   - GET /api/health (público, mínimo)
 *   - GET /api/admin/operations-health (privado, detallado)
 *   - Admin dashboard (adminDashboardActions.ts)
 *
 * NUNCA contiene credenciales, URLs ni PII.
 */

// ── Constantes de staleness (en milisegundos) ────────────────────────────

/** BCV se considera stale si la última corrida exitosa tiene > 48 h. */
export const BCV_STALE_MS = 48 * 60 * 60 * 1000;

/** Backup se considera stale si tiene > 26 h (~1 día + margen horario). */
export const BACKUP_STALE_MS = 26 * 60 * 60 * 1000;

/** Purga temp se considera stale si tiene > 26 h (~1 día + margen horario). */
export const PURGE_STALE_MS = 26 * 60 * 60 * 1000;

/** Timeout máximo de consulta DB en endpoints de health (ms). */
export const HEALTH_DB_TIMEOUT_MS = 2_000;

// ── Timeout de health ────────────────────────────────────────────────────

export class HealthTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Health check timed out after ${timeoutMs}ms`);
    this.name = 'HealthTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Corta la espera del handler si `promise` no resuelve en `ms`.
 * No cancela la operación subyacente (p. ej. Prisma); solo deja de esperar.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HealthTimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ── Claves de AppConfig ──────────────────────────────────────────────────

export const BCV_LAST_SUCCESS_KEY = 'bcv_last_success_at';
export const BACKUP_LAST_SUCCESS_KEY = 'backup_last_success_at';
export const PURGE_LAST_SUCCESS_KEY = 'purge_temp_data_last_success_at';

// ── Tipos públicos ───────────────────────────────────────────────────────

export interface PublicHealth {
  status: 'ok' | 'degraded';
  db: 'ok' | 'down';
  bcvStale: boolean;
  backupStale: boolean;
  purgeStale: boolean;
}

export interface AdminOperationsHealth {
  bcv: {
    lastSuccessAt: string | null;
    stale: boolean;
  };
  backup: {
    lastSuccessAt: string | null;
    stale: boolean;
  };
  purge: {
    lastSuccessAt: string | null;
    stale: boolean;
  };
}

/** Las tres claves que se leen de AppConfig para health/operations. */
export const OPS_APP_CONFIG_KEYS = [
  BCV_LAST_SUCCESS_KEY,
  BACKUP_LAST_SUCCESS_KEY,
  PURGE_LAST_SUCCESS_KEY,
] as const;

// ── Helpers puros ────────────────────────────────────────────────────────

/**
 * Determina si un timestamp ISO está "stale" según una ventana en ms.
 * Devuelve true si:
 *   - value es null/undefined
 *   - value no es un ISO válido (Date.parse devuelve NaN)
 *   - la diferencia supera staleMs
 */
export function isStale(
  value: string | null | undefined,
  staleMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (!value) return true;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return true;
  return nowMs - ms > staleMs;
}

/**
 * Parsea un valor de AppConfig.value (string ISO o null) y devuelve
 * el ISO string limpio, o null si no es válido.
 */
export function parseTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Convierte un array de {key, value} de Prisma AppConfig a un Map.
 * Útil para que el caller haga una sola query con findMany y luego
 * derive los valores con estos helpers puros.
 */
export function buildOpsMap(
  rows: { key: string; value: string }[],
): Map<string, string> {
  return new Map(rows.map((r) => [r.key, r.value]));
}

// ── Constructores de objetos de respuesta ────────────────────────────────

/**
 * Construye PublicHealth a partir de un Map de AppConfig.
 * dbOk=false → status='degraded', db='down'
 */
export function buildPublicHealth(
  opsMap: Map<string, string>,
  dbOk: boolean,
): PublicHealth {
  if (!dbOk) {
    return { status: 'degraded', db: 'down', bcvStale: true, backupStale: true, purgeStale: true };
  }

  const bcvRaw = opsMap.get(BCV_LAST_SUCCESS_KEY) ?? null;
  const backupRaw = opsMap.get(BACKUP_LAST_SUCCESS_KEY) ?? null;
  const purgeRaw = opsMap.get(PURGE_LAST_SUCCESS_KEY) ?? null;

  return {
    status: 'ok',
    db: 'ok',
    bcvStale: isStale(bcvRaw, BCV_STALE_MS),
    backupStale: isStale(backupRaw, BACKUP_STALE_MS),
    purgeStale: isStale(purgeRaw, PURGE_STALE_MS),
  };
}

/**
 * Construye AdminOperationsHealth a partir de un Map de AppConfig.
 * Siempre devuelve timestamps (ISO string o null), nunca error/stack.
 */
export function buildAdminOperationsHealth(
  opsMap: Map<string, string>,
): AdminOperationsHealth {
  const bcvRaw = opsMap.get(BCV_LAST_SUCCESS_KEY) ?? null;
  const backupRaw = opsMap.get(BACKUP_LAST_SUCCESS_KEY) ?? null;
  const purgeRaw = opsMap.get(PURGE_LAST_SUCCESS_KEY) ?? null;

  return {
    bcv: {
      lastSuccessAt: parseTimestamp(bcvRaw),
      stale: isStale(bcvRaw, BCV_STALE_MS),
    },
    backup: {
      lastSuccessAt: parseTimestamp(backupRaw),
      stale: isStale(backupRaw, BACKUP_STALE_MS),
    },
    purge: {
      lastSuccessAt: parseTimestamp(purgeRaw),
      stale: isStale(purgeRaw, PURGE_STALE_MS),
    },
  };
}
