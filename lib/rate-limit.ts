import { isIP } from 'node:net';
import { createHmac } from 'crypto';
import { logError, logWarn } from '@/lib/safe-logger';

// ── HMAC key para derivar hashes persistentes de IP/email ────────────────
// Derivado de NEXTAUTH_SECRET; nunca expuesto. Si el secret rota,
// los buckets anteriores pierden vigencia (lo cual es aceptable).
function getBucketSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      '[rate-limit] NEXTAUTH_SECRET es obligatorio para derivar buckets.',
    );
  }
  return createHmac('sha256', secret).update('rate-limit-bucket').digest('hex');
}

/** Hash corto para claves de rate limit — nunca expone el valor original. */
export function hashForBucket(value: string): string {
  return createHmac('sha256', getBucketSecret()).update(value.trim().toLowerCase()).digest('hex').slice(0, 32);
}

// ── Tipos ─────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
  source: 'upstash' | 'memory';
}

// ── Mapa en memoria para fallback de critical ────────────────────────────

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000;

function maybeCleanupMemory(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of memoryStore) {
    if (now > entry.resetAt) memoryStore.delete(key);
  }
}

/**
 * Ventana fija en memoria.
 * @returns segundos restantes si limitado, o 0 si permitido.
 */
function memoryWindow(key: string, config: RateLimitConfig): { limited: boolean; retryAfterSeconds: number } {
  maybeCleanupMemory();

  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (entry.count >= config.limit) {
    const remainingMs = entry.resetAt - now;
    return { limited: true, retryAfterSeconds: Math.ceil(Math.max(remainingMs, 0) / 1000) };
  }

  entry.count++;
  return { limited: false, retryAfterSeconds: 0 };
}

/** Elimina entradas del Map que coinciden con un prefijo de key. */
function memoryClearByPrefix(prefix: string): void {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
}

// ── Upstash Redis REST ────────────────────────────────────────────────────

const UPSTASH_TIMEOUT_MS = 2_000;

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

/**
 * Ventana fija distribuida.
 * @returns resultado o null si Upstash no está disponible.
 */
async function upstashWindow(
  key: string,
  config: RateLimitConfig,
): Promise<{ limited: boolean; retryAfterSeconds: number } | null> {
  const cfg = upstashConfig();
  if (!cfg) return null;

  const redisKey = `rl:${key}`;

  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, String(config.windowMs), 'NX'],
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
    });

    if (!res.ok) {
      logError('upstash_http_error', new Error(`Upstash HTTP ${res.status}`), { provider: 'upstash', status: res.status });
      return null;
    }

    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    const count = Number(data?.[0]?.result);
    if (!Number.isFinite(count)) {
      logError('upstash_unexpected_response', new Error('Unexpected Upstash response'), { provider: 'upstash' });
      return null;
    }

    const limited = count > config.limit;
    // Con Upstash no podemos calcular retryAfter preciso sin TTL;
    // usamos la ventana completa como estimación conservadora.
    const retryAfterSeconds = limited ? Math.ceil(config.windowMs / 1000) : 0;
    return { limited, retryAfterSeconds };
  } catch (_err) {
    logWarn('upstash_fallback_to_memory', { provider: 'upstash' });
    return null;
  }
}

// ── Políticas de rate limit ──────────────────────────────────────────────

/**
 * Rate limit CRÍTICO: intenta Upstash; si falla usa Map local
 * con el MISMO límite (nunca fail-open). Para endpoints de login,
 * reset, orders POST, uploads y validación de cupones.
 */
export async function rateLimitCritical(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const upstash = await upstashWindow(key, config);
  if (upstash !== null) {
    return { ...upstash, source: 'upstash' };
  }
  // Fallback a memoria — mismo límite, nunca más laxo.
  const memory = memoryWindow(key, config);
  return { ...memory, source: 'memory' };
}

/**
 * Rate limit BEST-EFFORT: intenta Upstash con el límite configurado;
 * si falla, usa el fallback en memoria con un límite igual al
 * original (el viejo comportamiento). Para GET públicos de catálogo,
 * reviews y endpoints de baja criticidad.
 */
export async function rateLimitBestEffort(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const upstash = await upstashWindow(key, config);
  if (upstash !== null) {
    return { ...upstash, source: 'upstash' };
  }
  const memory = memoryWindow(key, config);
  return { ...memory, source: 'memory' };
}

/**
 * @deprecated Usar `rateLimitCritical` o `rateLimitBestEffort`.
 * Mantenido para compatibilidad; internamente delega en best-effort.
 */
export async function rateLimit(key: string, config: RateLimitConfig): Promise<boolean> {
  const result = await rateLimitBestEffort(key, config);
  return result.limited;
}

// ── IP del cliente ────────────────────────────────────────────────────────

/**
 * Extrae la IP del cliente de forma segura según DEPLOYMENT_ENV.
 *
 * - cloudflare → exclusivamente `cf-connecting-ip` (validado con isIP).
 *   Si falta o es inválido, devuelve "unknown".
 * - vercel     → primer valor de `x-vercel-forwarded-for` (validado con isIP).
 *   Si falta o es inválido, devuelve "unknown".
 * - desarrollo → fallback al último XFF / x-real-ip / "unknown".
 *
 * NUNCA confía en XFF genérico en producción: sin proxy de confianza
 * configurado la app ya lanzó en validateEnv() y no debería llegar aquí.
 */
export function getClientIp(request: Request): string {
  const env = (process.env.DEPLOYMENT_ENV ?? '').toLowerCase();

  if (env === 'cloudflare') {
    const raw = request.headers.get('cf-connecting-ip')?.trim();
    if (raw && isIP(raw)) return raw;
    return 'unknown';
  }

  if (env === 'vercel') {
    const raw = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    if (raw && isIP(raw)) return raw;
    return 'unknown';
  }

  // Desarrollo o sin proxy: fallback documentado (solo para dev).
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (isIP(last)) return last;
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp && isIP(realIp)) return realIp;

  return 'unknown';
}

// ── Exportación para tests ────────────────────────────────────────────────

// Exponemos el store interno para que los tests puedan inspeccionar y limpiar.
export function __memoryStoreSize(): number {
  return memoryStore.size;
}

export function __memoryStoreClear(): void {
  memoryStore.clear();
}

export function __memoryClearByPrefix(prefix: string): void {
  memoryClearByPrefix(prefix);
}

export { memoryWindow, upstashWindow };
