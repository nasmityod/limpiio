'use client';

import { useEffect } from 'react';

const RELOAD_KEY = 'chunk-reload-ts';
const RELOAD_COOLDOWN_MS = 10_000;

const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk [\d]+ failed|Failed to load chunk|error loading dynamically imported module/i;

function getErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

function isChunkLoadError(error: unknown, message: string): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: unknown }).name === 'ChunkLoadError'
  ) {
    return true;
  }
  return CHUNK_ERROR_PATTERN.test(message);
}

function tryReloadOnce(): void {
  const now = Date.now();
  const lastReload = sessionStorage.getItem(RELOAD_KEY);
  if (lastReload) {
    const elapsed = now - Number(lastReload);
    if (!Number.isNaN(elapsed) && elapsed < RELOAD_COOLDOWN_MS) {
      return;
    }
  }
  sessionStorage.setItem(RELOAD_KEY, String(now));
  window.location.reload();
}

export default function ChunkErrorReloader() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = getErrorMessage(event.error, event.message);
      if (isChunkLoadError(event.error, message)) {
        tryReloadOnce();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason);
      if (isChunkLoadError(event.reason, message)) {
        tryReloadOnce();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
