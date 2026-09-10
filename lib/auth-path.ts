/** Rutas conocidas tras login; slugs guardados en cookie HttpOnly o sessionStorage (no rutas arbitrarias). */
const LOGIN_NEXT_SLUG_TO_PATH: Record<string, string> = {
  checkout: '/checkout',
  account: '/account',
  orders: '/account/orders',
  password: '/account/password',
};

/**
 * Traduce rutas protegidas a slug (cookie HttpOnly / sessionStorage), no rutas arbitrarias.
 * Orden: prefijos más largos primero.
 */
export function pathnameToLoginNextSlug(pathname: string): string | null {
  const raw = pathname.split('?')[0] ?? '';
  const pathNorm = raw.replace(/\/+$/, '') || '/';
  if (pathNorm === '/') return null;
  if (pathNorm.startsWith('/account/orders')) return 'orders';
  if (pathNorm.startsWith('/account/password')) return 'password';
  if (pathNorm.startsWith('/account')) return 'account';
  if (pathNorm.startsWith('/checkout')) return 'checkout';
  return null;
}

export function pathFromLoginNextSlug(
  slug: string | null | undefined,
): string | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  const path = LOGIN_NEXT_SLUG_TO_PATH[key] ?? null;
  // Belt-and-suspenders: garantiza que el resultado sea una ruta interna relativa,
  // por si en el futuro se agrega accidentalmente una URL externa al mapa.
  if (path !== null && (!path.startsWith('/') || path.includes('://'))) return null;
  return path;
}

/** Clave única para recordar checkout/cuenta antes de `/login` (sin query en URL). TTL en JSON. */
const CLIENT_LOGIN_REDIRECT_KEY = 'mt_login_return_v1';
const CLIENT_LOGIN_REDIRECT_MAX_MS = 10 * 60 * 1000;

/** Persiste slug permitido antes de navegar a `/login` desde el cliente. */
export function stashLoginRedirectForPathname(internalPathname: string): boolean {
  if (typeof window === 'undefined') return false;
  const slug = pathnameToLoginNextSlug(internalPathname);
  if (!slug) return false;
  try {
    sessionStorage.setItem(
      CLIENT_LOGIN_REDIRECT_KEY,
      JSON.stringify({ s: slug, t: Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Lee intento válido/no expirado; no borra (evita doble mount Strict Mode). */
export function readFreshStashedLoginRedirectPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CLIENT_LOGIN_REDIRECT_KEY);
    if (!raw) return null;
    const { s, t } = JSON.parse(raw) as { s?: string; t?: number };
    if (!s || typeof t !== 'number') return null;
    if (Date.now() - t > CLIENT_LOGIN_REDIRECT_MAX_MS) {
      sessionStorage.removeItem(CLIENT_LOGIN_REDIRECT_KEY);
      return null;
    }
    return pathFromLoginNextSlug(s);
  } catch {
    return null;
  }
}

export function clearStashedLoginRedirectPath(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CLIENT_LOGIN_REDIRECT_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveSearchParamGetter(
  record: Record<string, string | string[] | undefined>,
): (key: string) => string | null {
  return (key: string) => {
    const v = record[key];
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    return null;
  };
}

/**
 * Prioridad: URL explícita (`next`, `callbackUrl` legacy), luego cookie consumida desde middleware/servidor.
 */
export function computeLoginLandingFromSources(
  getParam: (key: string) => string | null,
  cookiePathConsumed: string | null,
): { callbackUrl: string } {
  const fromUrl = resolveLoginCallbackFromParams((name) => getParam(name));

  const merged =
    fromUrl !== '/' ? fromUrl : (cookiePathConsumed && cookiePathConsumed !== '' ? cookiePathConsumed : '/');

  return { callbackUrl: merged };
}

/** Lee `next` + fallback legacy `callbackUrl` desde search params del cliente o middleware. */
export function resolveLoginCallbackFromParams(get: URLSearchParams['get']): string {
  const fromNext = pathFromLoginNextSlug(get('next'));
  if (fromNext) return fromNext;
  const rawCb = get('callbackUrl');
  if (rawCb) return safeInternalPath(rawCb);
  return '/';
}

/** Normaliza callbackUrl para evitar open redirects fuera del mismo origin. */
export function safeInternalPath(raw: string): string {
  try {
    const u = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (typeof window !== 'undefined' && u.origin !== window.location.origin) return '/';
    return `${u.pathname}${u.search}`;
  } catch {
    return '/';
  }
}

function pathnameOnly(internalPath: string): string {
  const base = internalPath.split('?')[0] ?? internalPath;
  return base || '/';
}

/**
 * Destino tras login/registro. Los ADMIN siguen al panel por defecto, pero si venían de la tienda
 * cuando el callback no es solo el inicio, respetan ese destino (cookie/sessionStorage o URL legacy).
 *
 * PRD-241 (decisión documentada): un ADMIN que venía de /checkout SÍ conserva
 * ese destino y puede comprar como cliente. Es intencional — la tienda física
 * usa las mismas cuentas para probar el flujo de compra. Riesgo aceptado:
 * mezclar sesión admin con flujo cliente en el MISMO navegador puede dejar
 * carrito/notificaciones del operador en el dispositivo; para operación diaria
 * se recomienda usar cuentas CLIENT separadas para compras de prueba.
 */
export function resolvePostLoginRedirect(
  role: string | undefined | null,
  rawCallbackUrl: string,
): string {
  const dest = safeInternalPath(rawCallbackUrl);
  const target = dest && dest !== '' ? dest : '/';
  const isAdmin = (role ?? '').toUpperCase() === 'ADMIN';

  if (!isAdmin) {
    return target;
  }

  const path = pathnameOnly(target);

  if (target === '/' || path === '/') {
    return '/admin/products';
  }

  if (path.startsWith('/admin')) {
    return target;
  }

  return target;
}
