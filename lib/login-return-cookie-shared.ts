/**
 * Constantes/options compartidas para cookie de post-login (solo slug en lista blanca).
 * Middleware y Server Components pueden importarlo; no usar `next/headers` aquí.
 */
export const LOGIN_RETURN_COOKIE_NAME = 'mt_login_next';

/**
 * Solo el middleware rellena este header tras validar la cookie HttpOnly;
 * cualquier valor enviado por el cliente se borra antes.
 */
export const LOGIN_RETURN_PROMOTED_HEADER = 'x-mt-login-next';

/** Max 10 min: solo para completar login y volver al flujo anterior. */
export const LOGIN_RETURN_COOKIE_MAX_AGE = 600;

export function loginReturnCookieOptions(): {
  path: '/';
  maxAge: number;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
} {
  return {
    path: '/',
    maxAge: LOGIN_RETURN_COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}
