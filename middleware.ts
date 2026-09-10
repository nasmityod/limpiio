import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { pathnameToLoginNextSlug, pathFromLoginNextSlug } from '@/lib/auth-path';
import { buildPublicCachedCsp, buildStrictCsp } from '@/lib/csp';
import { isFullCheckout, isWhatsAppCheckout } from '@/lib/checkout-mode';
import {
  LOGIN_RETURN_COOKIE_NAME,
  LOGIN_RETURN_PROMOTED_HEADER,
  loginReturnCookieOptions,
} from '@/lib/login-return-cookie-shared';

/** Rutas públicas cuyo HTML puede servirse desde caché estática/ISR (CSP sin nonce). */
const PUBLIC_CACHED_PATH_PATTERNS = [
  /^\/$/,
  /^\/productos$/,
  /^\/product\/[^/]+$/,
  /^\/categoria\/[^/]+$/,
  /^\/privacy-policy$/,
  /^\/terms-of-service$/,
  /^\/shipping-policy$/,
  /^\/tienda-barquisimeto$/,
  /^\/nosotros$/,
  /^\/devoluciones$/,
] as const;

function isPublicCached(pathname: string): boolean {
  return PUBLIC_CACHED_PATH_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Evita Set-Cookie si la petición es vuelo RSC/prefetch. Solo navegaciones "documento".
 */
function shouldAttachLoginReturnCookie(req: NextRequest): boolean {
  const purpose = req.headers.get('purpose')?.toLowerCase();
  if (purpose === 'prefetch') return false;

  if ((req.headers.get('rsc') ?? '').trim() === '1') return false;

  const mode = req.headers.get('sec-fetch-mode');
  const dest = req.headers.get('sec-fetch-dest');

  return mode === 'navigate' && dest === 'document';
}

/**
 * Migra cookie `mt_login_next` → cabecera de petición solo para downstream RSC,
 * y limpia la cookie en la respuesta (evita `cookies().delete` en páginas, que tumba prod).
 * También inyecta el nonce en los request headers para que el layout lo lea.
 */
function promoteLoginReturnCookieToRequestHeader(
  req: NextRequest,
  nonce: string,
): NextResponse {
  const slugRaw = req.cookies.get(LOGIN_RETURN_COOKIE_NAME)?.value ?? null;
  const slugValid =
    slugRaw && pathFromLoginNextSlug(slugRaw) ? slugRaw.trim().toLowerCase() : null;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(LOGIN_RETURN_PROMOTED_HEADER);
  if (slugValid) {
    requestHeaders.set(LOGIN_RETURN_PROMOTED_HEADER, slugValid);
  }
  requestHeaders.set('x-nonce', nonce);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });

  /* Limpia la cookie incluso si el valor era inválido (evita bucles). */
  if (req.cookies.has(LOGIN_RETURN_COOKIE_NAME)) {
    res.cookies.set(LOGIN_RETURN_COOKIE_NAME, '', {
      ...loginReturnCookieOptions(),
      maxAge: 0,
    });
  }

  return res;
}

/**
 * PRD-018 / PRD-119: prefijos de API cuyas MUTACIONES (no-GET) son siempre de
 * admin. Capa uniforme de defense-in-depth — cada route handler mantiene su
 * propio requireAdmin(). Las rutas públicas de mutación del flujo de compra
 * (cupones validate, reviews de producto, events/view, cron) NO están aquí.
 */
const ADMIN_WRITE_API_PREFIXES = [
  '/api/settings',
  '/api/banners',
  '/api/promotions',
  '/api/categories',
  '/api/upload',
  '/api/config',
  /** Solo auto-approve es admin-only; upload-photo y PATCH/DELETE [id] son de clientes autenticados. */
  '/api/reviews/auto-approve',
  '/api/coupons',
] as const;

/** Mutaciones públicas legítimas exentas de la capa admin del middleware. */
const ADMIN_WRITE_API_EXCEPTIONS = ['/api/coupons/validate'] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Rutas protegidas.
 * - `/login`, `/registro`       → promueve cookie→header (nonce inyectado)
 * - `/admin/*`                  → JWT requerido + rol ADMIN; redirect /login o /
 * - `/api/admin/*`              → JWT requerido + rol ADMIN; 401/403 JSON (no redirect)
 * - Mutaciones API admin (lista arriba) → JWT + rol ADMIN; 401/403 JSON (PRD-018)
 * - `/api/orders*`, `/api/cart*` (salvo unsubscribe), `/api/checkout*`
 *                               → JWT requerido; 401 JSON (PRD-118 / PRD-119)
 *                               → EXCEPTO POST /api/orders cuando CHECKOUT_MODE=whatsapp
 * - `/account/*`                → JWT requerido; redirect /login con cookie opcional
 * - `/checkout*`                → JWT requerido SOLO si CHECKOUT_MODE=full;
 *                                  en whatsapp es público (checkout invitado)
 * - `/checkout/success?token=`  → público SOLO si CHECKOUT_MODE=whatsapp
 * - Resto de rutas              → pasa con nonce (sin auth check para no penalizar perf)
 *
 * Matriz de modo (lib/checkout-mode.ts), el servidor decide, nunca el cliente:
 *
 * | CHECKOUT_MODE | /checkout | POST /api/orders | upload-session/proof |
 * |---------------|-----------|-------------------|-----------------------|
 * | whatsapp      | público   | público (guest)   | no usados (404)       |
 * | full          | JWT       | JWT (401 sin él)  | JWT (401 sin él)      |
 */
export async function middleware(req: NextRequest) {
  const nonce = Buffer.from(globalThis.crypto.randomUUID()).toString('base64');
  const { pathname } = req.nextUrl;
  const publicCached = isPublicCached(pathname);
  const csp = publicCached ? buildPublicCachedCsp() : buildStrictCsp(nonce);

  /* Adjunta CSP al response sin importar qué ruta sea. */
  function withCsp(response: NextResponse): NextResponse {
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  /* next() con nonce inyectado — solo rutas SSR dinámicas (Next aplica nonce al vuelo). */
  function nextWithNonce(): NextResponse {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  function nextForRoute(): NextResponse {
    return publicCached ? NextResponse.next() : nextWithNonce();
  }

  // P82: /productos?page=1 y /categoria/[slug]?page=1 → canonical sin ?page.
  // Evita fragmentación de señales entre la URL base y su variante ?page=1.
  if (
    (pathname === '/productos' || pathname.startsWith('/categoria/')) &&
    req.nextUrl.searchParams.get('page') === '1'
  ) {
    const url = req.nextUrl.clone();
    url.searchParams.delete('page');
    return withCsp(NextResponse.redirect(url, { status: 301 }));
  }

  // Filtro de categoría en /productos?cat=X se queda en el catálogo (sin 301 a /categoria).
  // Las páginas SEO /categoria/[slug] siguen disponibles desde el menú y enlaces directos.

  if (pathname === '/login' || pathname === '/registro') {
    return withCsp(promoteLoginReturnCookieToRequestHeader(req, nonce));
  }

  // PRD-207/249/250 + SESIÓN 06: /checkout/success?token={jwt} es acceso de
  // sólo lectura para invitados — SOLO en modo whatsapp, donde el checkout
  // invitado existe. En modo full nunca hay pedidos guest, así que el token
  // no es una excepción pública: el route handler decide (isWhatsAppCheckout).
  // `orderId` NUNCA es acceso público: siempre exige sesión (isProtectedPath).
  if (
    isWhatsAppCheckout &&
    pathname === '/checkout/success' &&
    req.nextUrl.searchParams.has('token')
  ) {
    return withCsp(nextWithNonce());
  }

  const isAdminUiPath  = pathname.startsWith('/admin');
  const isApiAdminPath = pathname.startsWith('/api/admin');
  /* Guest solo en whatsapp / auth obligatoria en full: /checkout exige sesión
     únicamente cuando CHECKOUT_MODE=full. En whatsapp el route handler POST
     /api/orders valida los datos de contacto del guest (sin sesión). */
  const isProtectedPath =
    pathname.startsWith('/account') ||
    (isFullCheckout && pathname.startsWith('/checkout'));

  /* PRD-018: mutaciones de APIs de configuración/catálogo → solo admin. */
  const isWriteMethod = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const isAdminWriteApi =
    isWriteMethod &&
    ADMIN_WRITE_API_PREFIXES.some((p) => matchesPrefix(pathname, p)) &&
    !ADMIN_WRITE_API_EXCEPTIONS.some((p) => matchesPrefix(pathname, p));

  /* Guest solo en whatsapp: POST /api/orders solo queda exento de sesión
     cuando CHECKOUT_MODE=whatsapp. En full, isUserTokenApi lo cubre abajo.
     upload-session/upload-proof NUNCA están aquí: en full exigen sesión vía
     isUserTokenApi; en whatsapp no se usan y quedan protegidos por defense
     in depth del propio handler (404 si !isFullCheckout). */
  const isGuestCheckoutApi =
    isWhatsAppCheckout &&
    pathname === '/api/orders' &&
    req.method.toUpperCase() === 'POST';

  /* PRD-118 / PRD-119: APIs de pedidos, carrito y checkout exigen sesión.
     `/api/cart/unsubscribe` queda fuera: es el enlace GET de baja en emails.
     Guest solo en whatsapp: POST /api/orders queda fuera únicamente en ese modo. */
  const isUserTokenApi =
    !isGuestCheckoutApi &&
    (matchesPrefix(pathname, '/api/orders') ||
      (matchesPrefix(pathname, '/api/cart') && !matchesPrefix(pathname, '/api/cart/unsubscribe')) ||
      matchesPrefix(pathname, '/api/checkout'));

  if (isAdminUiPath || isApiAdminPath || isProtectedPath || isAdminWriteApi || isUserTokenApi) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (isAdminUiPath || isApiAdminPath || isAdminWriteApi) {
      /*
       * La autorización administrativa definitiva se consulta en BD dentro de
       * cada página, Route Handler y Server Action. Middleware solo exige identidad.
       * Esto permite que permisos otorgados o retirados tengan efecto en la siguiente
       * petición, sin esperar la revalidación del JWT.
       */
      const isApiResponse = isApiAdminPath || isAdminWriteApi;

      if (!token) {
        return withCsp(
          isApiResponse
            ? new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              })
            : NextResponse.redirect(new URL('/login', req.url)),
        );
      }

      return withCsp(nextWithNonce());
    }

    if (isUserTokenApi) {
      if (!token) {
        return withCsp(
          new NextResponse(JSON.stringify({ error: 'No autenticado.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return withCsp(nextWithNonce());
    }

    /* isProtectedPath sin token → /login con ?next= SIEMPRE (RSC y documento).
     * La cookie HttpOnly es solo un respaldo adicional para navegaciones documento
     * (se descarta en prefetch y vuelos RSC vía shouldAttachLoginReturnCookie). */
    if (!token) {
      const login = new URL('/login', req.url);
      const slug = pathnameToLoginNextSlug(pathname);
      if (slug) {
        login.searchParams.set('next', slug);
      }
      const res = NextResponse.redirect(login);
      if (slug && shouldAttachLoginReturnCookie(req)) {
        res.cookies.set(LOGIN_RETURN_COOKIE_NAME, slug, loginReturnCookieOptions());
      }
      return withCsp(res);
    }
  }

  return withCsp(nextForRoute());
}

export const config = {
  /**
   * Cubre todas las rutas excepto assets estáticos de Next.js.
   * Necesario para que el nonce CSP se genere en cada página (no solo en las protegidas).
   */
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|admin-manifest\\.json).*)'],
};
