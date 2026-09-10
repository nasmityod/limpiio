import { headers } from 'next/headers';

import { LOGIN_RETURN_PROMOTED_HEADER } from '@/lib/login-return-cookie-shared';
import { pathFromLoginNextSlug } from '@/lib/auth-path';

/**
 * Lee el destino post-login inyectado por middleware (cabecera, no mutable por el navegador
 * porque el middleware sobrescribe entradas del cliente usando solo cookie HttpOnly válida).
 */
export async function readLoginReturnPathFromPromotedHeader(): Promise<string | null> {
  const h = await headers();
  const slug = h.get(LOGIN_RETURN_PROMOTED_HEADER);
  return pathFromLoginNextSlug(slug);
}
