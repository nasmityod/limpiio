/**
 * Guard de seguridad para scripts/tests que mutan la BD de E2E.
 * Exige hostname o nombre de base de datos con "_e2e" o "test".
 * Nunca imprime partes de DATABASE_URL (credenciales/host).
 */

export type E2eDbGuardResult =
  | { ok: true }
  | { ok: false; reason: string };

function isAllowedE2eIdentifier(identifier: string): boolean {
  const lower = identifier.trim().toLowerCase();
  if (!lower) return false;
  return lower.includes('_e2e') || lower.includes('test');
}

/**
 * Valida que DATABASE_URL apunte a un entorno E2E permitido.
 * Aplica siempre — no hay excepción por CI.
 */
export function validateE2eDatabaseUrl(databaseUrl: string): E2eDbGuardResult {
  const trimmed = databaseUrl.trim();
  if (!trimmed) {
    return { ok: false, reason: '[E2E-SAFETY] DATABASE_URL no está configurada.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: '[E2E-SAFETY] DATABASE_URL no es una URL válida.' };
  }

  const database = decodeURIComponent(
    parsed.pathname.replace(/^\//, '').split('/')[0] ?? '',
  );
  const hostname = parsed.hostname;

  if (!isAllowedE2eIdentifier(database) && !isAllowedE2eIdentifier(hostname)) {
    return {
      ok: false,
      reason:
        '[E2E-SAFETY] DATABASE_URL debe apuntar a una BD o host con "_e2e" o "test". Abortando.',
    };
  }

  return { ok: true };
}

/**
 * Termina el proceso si DATABASE_URL no cumple el guard.
 */
export function assertE2eDatabaseUrl(databaseUrl: string): void {
  const result = validateE2eDatabaseUrl(databaseUrl);
  if (!result.ok) {
    console.error(result.reason);
    process.exit(1);
  }
}

/**
 * Confirma que la conexión activa apunta a una BD permitida (sin loguear el nombre).
 */
export async function confirmE2eDatabaseSchema(
  queryCurrentDatabase: () => Promise<string>,
): Promise<void> {
  const currentDatabase = (await queryCurrentDatabase()).trim();
  if (!isAllowedE2eIdentifier(currentDatabase)) {
    console.error(
      '[E2E-SAFETY] La base de datos conectada no cumple el guard E2E (_e2e/test). Abortando.',
    );
    process.exit(1);
  }
}
