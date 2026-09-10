import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Playwright E2E para MundoTech.
 * - Nunca apunta a producción — aborta si baseURL contiene mundotechve.com.
 * - BD: DATABASE_URL de E2E debe contener "_e2e" o "test" (scripts/e2e-reset-db.ts).
 * - E2E_MODE=1: emails/R2 mockeados sin red externa (lib/resend.tsx, lib/r2.ts).
 * - Traces/capturas: solo al fallar.
 * - CI: 2 retries; local: 0 retries.
 *
 * Ejecución local (BD directa en 5432, puerto aislado — no reutilizar dev/producción):
 *
 *   DATABASE_URL=postgresql://USER:PASS@localhost:5432/mundotech_e2e \
 *   DIRECT_URL=postgresql://USER:PASS@localhost:5432/mundotech_e2e \
 *   E2E_MODE=1 CHECKOUT_MODE=full \
 *   PLAYWRIGHT_BASE_URL=http://localhost:34567 \
 *   npm run db:e2e:reset && npx playwright test --grep-invert "@whatsapp"
 *
 *   DATABASE_URL=... E2E_MODE=1 CHECKOUT_MODE=whatsapp \
 *   PLAYWRIGHT_BASE_URL=http://localhost:34567 \
 *   npm run db:e2e:reset && npx playwright test --grep "@whatsapp"
 *
 * Reutilizar un servidor ya levantado (opt-in explícito):
 *   PLAYWRIGHT_REUSE_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:34567 npx playwright test
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:34567';

if (BASE_URL.includes('mundotechve.com')) {
  throw new Error(
    '[E2E SAFETY] BASE_URL contiene mundotechve.com. ' +
      'Nunca apuntes pruebas E2E a producción. Usa localhost o un VPS de staging.',
  );
}

/** Aborta si el puerto ya responde localmente sin opt-in (antes de arrancar webServer). */
function assertPortFreeForE2e(): void {
  if (process.env.CI) return;
  if (process.env.PLAYWRIGHT_REUSE_SERVER === '1') return;
  // Los workers recargan este módulo cuando webServer ya está arriba.
  if (process.env.TEST_WORKER_INDEX !== undefined) return;

  try {
    execSync(`curl -sf -o /dev/null -m 2 "${BASE_URL}"`, { stdio: 'ignore' });
    throw new Error(
      `[E2E SAFETY] ${BASE_URL} ya responde. ` +
        'No reutilices accidentalmente un servidor dev o producción. ' +
        'Usa un puerto aislado (p. ej. PLAYWRIGHT_BASE_URL=http://localhost:34567) ' +
        'o define PLAYWRIGHT_REUSE_SERVER=1 para reutilizar explícitamente.',
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[E2E SAFETY]')) {
      throw error;
    }
    // curl falló → puerto libre, continuar.
  }
}

assertPortFreeForE2e();

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile-smoke\.spec\.ts/,
    },
    {
      name: 'mobile-android',
      testMatch: /mobile-smoke\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-ios',
      testMatch: /mobile-smoke\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],
  outputDir: path.join(process.cwd(), 'test-results'),
  webServer: {
    command: `npm run dev -- -p ${new URL(BASE_URL).port || '34567'}`,
    url: BASE_URL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1' && !process.env.CI,
    timeout: 120_000,
    cwd: process.cwd(),
    env: {
      ...process.env,
      E2E_MODE: '1',
      CHECKOUT_MODE: process.env.CHECKOUT_MODE ?? 'full',
      PORT: new URL(BASE_URL).port || '34567',
    },
  },
});
