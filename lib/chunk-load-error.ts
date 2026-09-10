export const ADMIN_CHUNK_RELOAD_KEY = 'admin-chunk-reload';
export const APP_CHUNK_RELOAD_KEY = 'app-chunk-reload';

const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk [\d]+ failed|Failed to load chunk|error loading dynamically imported module/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Error;
  if (err.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_PATTERN.test(err.message ?? '');
}

/** Fuerza una recarga dura si aún no se intentó en esta sesión de pestaña. */
export function tryRecoverFromChunkLoadError(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(storageKey, '1');
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function clearChunkReloadFlag(storageKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // sessionStorage puede estar bloqueado en modo privado estricto
  }
}
