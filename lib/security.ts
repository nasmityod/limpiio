/**
 * security.ts — helpers compartidos de hardening.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { ZodIssue } from 'zod';

/**
 * SHA-256 hex de un token. Los tokens de un solo uso (reset de contraseña)
 * se persisten hasheados: si la BD se filtra, los tokens activos no sirven.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * IP del cliente dentro de un Server Action (no hay Request).
 * Misma estrategia estricta que getClientIp de lib/rate-limit.ts:
 * - cloudflare → exclusivamente cf-connecting-ip validado con isIP
 * - vercel     → primer x-vercel-forwarded-for validado con isIP
 * - desarrollo → fallback documentado (último XFF / x-real-ip)
 * Si falta o es inválido, devuelve "unknown".
 */
export async function getActionClientIp(): Promise<string> {
  const h = await headers();
  const env = (process.env.DEPLOYMENT_ENV ?? '').toLowerCase();

  if (env === 'cloudflare') {
    const raw = h.get('cf-connecting-ip')?.trim();
    if (raw && isIP(raw)) return raw;
    return 'unknown';
  }
  if (env === 'vercel') {
    const raw = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    if (raw && isIP(raw)) return raw;
    return 'unknown';
  }

  // Desarrollo: fallback documentado
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      if (isIP(last)) return last;
    }
  }
  const realIp = h.get('x-real-ip')?.trim();
  if (realIp && isIP(realIp)) return realIp;

  return 'unknown';
}

/**
 * SESIÓN 08: respuesta 429 centralizada.
 * - Incluye Retry-After y Cache-Control:no-store.
 * - Nunca expone backend ni claves de rate limit.
 * - Mensaje genérico (no revela política de límites).
 */
export function buildRateLimitedResponse(retryAfterSeconds: number, message?: string): NextResponse {
  return NextResponse.json(
    { message: message ?? 'Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfterSeconds)),
        'Cache-Control': 'no-store',
      },
    },
  );
}

/**
 * Mitigación CSRF para Route Handlers públicos de mutación: si la petición
 * trae header Origin, debe coincidir con NEXTAUTH_URL o NEXT_PUBLIC_SITE_URL.
 * Peticiones sin Origin (curl, apps nativas, same-origin antiguos) se permiten
 * — esto bloquea el vector navegador cross-site, que es el que importa para CSRF.
 *
 * NUNCA confía en x-forwarded-host, x-forwarded-proto ni host (manipulables
 * por el atacante en una request directa).
 */
export function verifySameOrigin(request: Request): boolean {
  const originHeader =
    request.headers.get('origin');

  // Compatibilidad para curl, cron y clientes sin Origin.
  // La autorización/rate limit sigue siendo obligatoria.
  if (!originHeader) {
    return true;
  }

  let requestOrigin: string;
  try {
    requestOrigin =
      new URL(originHeader).origin;
  } catch {
    return false;
  }

  const allowedOrigins =
    new Set<string>();

  for (const candidate of [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    const value = candidate?.trim();
    if (!value) {
      continue;
    }
    try {
      allowedOrigins.add(
        new URL(value).origin,
      );
    } catch {
      // env-validation debe detectar configuración crítica inválida.
    }
  }

  if (
    process.env.NODE_ENV !== 'production'
  ) {
    try {
      const runtimeOrigin =
        new URL(request.url).origin;
      const hostname =
        new URL(request.url).hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1'
      ) {
        allowedOrigins.add(runtimeOrigin);
      }
    } catch {
      return false;
    }
  }

  return allowedOrigins.has(
    requestOrigin,
  );
}

/**
 * SESIÓN 09: Mitigación CSRF uniforme para Route Handlers de mutación.
 *
 * Envuelve verifySameOrigin y devuelve null si el origen es válido, o una
 * NextResponse 403 uniforme si no lo es. Úsalo al inicio de cada
 * POST/PUT/PATCH/DELETE de navegador:
 *
 *   const originCheck = rejectInvalidMutationOrigin(request);
 *   if (originCheck) return originCheck;
 *
 * No se usa en GET (salvo enlaces idempotentes documentados), cron ni
 * callbacks server-to-server.
 */
export function rejectInvalidMutationOrigin(request: Request): NextResponse | null {
  if (verifySameOrigin(request)) return null;
  return NextResponse.json(
    { error: 'Origen no permitido.' },
    { status: 403 },
  );
}

/**
 * Detalle de validación Zod SOLO fuera de producción. `issues` describe el
 * schema completo (nombres de campos, tipos, reglas) — en producción no debe
 * viajar al cliente, ni siquiera en errores 400 de rutas públicas.
 */
export function safeZodIssues(issues: ZodIssue[]): ZodIssue[] | undefined {
  return process.env.NODE_ENV === 'production' ? undefined : issues;
}

/** Igual que safeZodIssues, para el shape de `ZodError.flatten()`. */
export function safeZodFlatten<T>(flattened: T): T | undefined {
  return process.env.NODE_ENV === 'production' ? undefined : flattened;
}

export function verifyBearerSecret(
  request: Request,
  expected: string,
): boolean {
  if (!expected) {
    return false;
  }

  const auth =
    request.headers.get('authorization');

  if (!auth?.startsWith('Bearer ')) {
    return false;
  }

  const token = auth.slice(7);
  if (!token) {
    return false;
  }

  if (
    Buffer.byteLength(token) !==
    Buffer.byteLength(expected)
  ) {
    return false;
  }

  const tokenBuffer =
    Buffer.from(token, 'utf8');
  const expectedBuffer =
    Buffer.from(expected, 'utf8');

  try {
    return timingSafeEqual(
      tokenBuffer,
      expectedBuffer,
    );
  } catch {
    return false;
  }
}
