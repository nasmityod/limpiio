/**
 * Guard de seguridad para la URL base de las pruebas E2E (playwright.config.ts).
 *
 * Complementa a `lib/e2e-db-guard.ts`: aquel protege la BD, este protege el
 * host. Son dos capas independientes y ambas deben estar en pie.
 *
 * Es **fail-safe**: la ausencia de configuración aborta, nunca permite. Los
 * E2E truncan tablas (`scripts/e2e-reset-db.ts`), así que el escenario en que
 * alguien olvida declarar cuál es su producción es exactamente el escenario en
 * que no se puede permitir una URL remota.
 *
 * Cascada de decisión:
 *  1. `E2E_FORBIDDEN_HOST` declarado y la URL base lo contiene → abortar.
 *  2. Sin esa variable, se deriva el host de `NEXT_PUBLIC_SITE_URL`; si la URL
 *     base lo contiene → abortar.
 *  3. Sin ninguna de las dos, solo se admiten hosts locales → si no lo es, abortar.
 *  4. URL base local sin variables declaradas → permitir (desarrollo y CI).
 *
 * Un host de producción declarado (1 o 2) autoriza URLs remotas que no
 * coincidan: es el caso legítimo de un VPS de staging.
 */

const PREFIX = '[E2E SAFETY]';

/** Hosts que jamás pueden ser producción. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export type E2eHostGuardResult =
  | { ok: true }
  | { ok: false; reason: string };

export type E2eHostGuardInput = {
  /** URL base de las pruebas (`PLAYWRIGHT_BASE_URL`). */
  baseUrl: string;
  /** Host de producción declarado explícitamente (`E2E_FORBIDDEN_HOST`). */
  forbiddenHost?: string;
  /** URL pública del sitio (`NEXT_PUBLIC_SITE_URL`), de la que se deriva el host. */
  siteUrl?: string;
};

/** Hostname en minúsculas, sin corchetes de IPv6. `null` si no es una URL. */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string | null): boolean {
  return hostname !== null && LOCAL_HOSTNAMES.has(hostname);
}

/**
 * Host de producción derivado de `NEXT_PUBLIC_SITE_URL`.
 *
 * Devuelve `null` si la URL no parsea o si su host es local: en desarrollo y en
 * CI esa variable vale `http://localhost:3000`, y tomarla por producción
 * abortaría toda ejecución legítima. Un `null` aquí no relaja nada — hace caer
 * la decisión en el paso 3, que solo admite hosts locales.
 */
function derivedProductionHost(siteUrl: string | undefined): string | null {
  const hostname = hostnameOf(siteUrl?.trim() ?? '');
  if (!hostname || isLocalHostname(hostname)) return null;
  return hostname;
}

/** Valida la URL base de E2E sin efectos secundarios. */
export function validateE2eBaseUrl({
  baseUrl,
  forbiddenHost,
  siteUrl,
}: E2eHostGuardInput): E2eHostGuardResult {
  const target = baseUrl.trim();
  if (!target) {
    return {
      ok: false,
      reason:
        `${PREFIX} PLAYWRIGHT_BASE_URL está vacía. ` +
        'Declara una URL local (p. ej. http://localhost:34567) antes de ejecutar los E2E.',
    };
  }

  const lowerTarget = target.toLowerCase();

  const explicitHost = forbiddenHost?.trim().toLowerCase();
  if (explicitHost) {
    if (lowerTarget.includes(explicitHost)) {
      return {
        ok: false,
        reason:
          `${PREFIX} PLAYWRIGHT_BASE_URL (${target}) contiene ${explicitHost}, ` +
          'el host declarado en E2E_FORBIDDEN_HOST. Las pruebas E2E truncan tablas ' +
          '(scripts/e2e-reset-db.ts): nunca las apuntes a producción. ' +
          'Usa localhost o un VPS de staging.',
      };
    }
    return { ok: true };
  }

  const productionHost = derivedProductionHost(siteUrl);
  if (productionHost) {
    if (lowerTarget.includes(productionHost)) {
      return {
        ok: false,
        reason:
          `${PREFIX} PLAYWRIGHT_BASE_URL (${target}) contiene ${productionHost}, ` +
          'el host de NEXT_PUBLIC_SITE_URL (tu producción). Las pruebas E2E truncan ' +
          'tablas (scripts/e2e-reset-db.ts): nunca las apuntes a producción. ' +
          'Usa localhost o un VPS de staging.',
      };
    }
    return { ok: true };
  }

  if (isLocalHostname(hostnameOf(target))) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      `${PREFIX} No se puede determinar cuál es tu host de producción y ` +
      `PLAYWRIGHT_BASE_URL (${target}) no es local ` +
      `(${[...LOCAL_HOSTNAMES].join(', ')}). ` +
      'Define E2E_FORBIDDEN_HOST con tu dominio real (o NEXT_PUBLIC_SITE_URL) ' +
      'para autorizar hosts remotos de staging, o apunta PLAYWRIGHT_BASE_URL a ' +
      'un host local. Sin esa información la guarda no distingue staging de ' +
      'producción y aborta: las pruebas E2E truncan tablas (scripts/e2e-reset-db.ts).',
  };
}

/** Lanza si la URL base no supera el guard. */
export function assertE2eBaseUrl(input: E2eHostGuardInput): void {
  const result = validateE2eBaseUrl(input);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}
