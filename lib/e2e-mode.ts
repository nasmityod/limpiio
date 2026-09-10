/**
 * Modo E2E explícito — activar con E2E_MODE=1 (Playwright/CI).
 * No usar NODE_ENV=E2E: Next.js y librerías dependen de NODE_ENV real.
 */
export function isE2eMode(): boolean {
  return process.env.E2E_MODE === '1';
}
