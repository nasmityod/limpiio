import path from 'node:path';
import { defineConfig } from 'vitest/config';

// PRD-032: tests unitarios de lógica pura (sin BD ni red). Las variables de
// entorno dummy permiten importar módulos que pasan por lib/env-validation.ts
// sin abrir conexiones reales (pg Pool es lazy).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.{ts,tsx}'],
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      NEXTAUTH_SECRET: 'vitest-secret',
      NEXTAUTH_URL: 'http://localhost:3000',
      CRON_SECRET: 'vitest-cron-secret',

      RESEND_API_KEY: 're_vitest_dummy',
      RESEND_FROM_ADDRESS: 'vitest@example.com',

      R2_ENDPOINT:
        'https://vitest-account.r2.cloudflarestorage.com',

      R2_ACCESS_KEY_ID: 'vitest-public-access-key',
      R2_SECRET_ACCESS_KEY: 'vitest-public-secret-key',
      R2_BUCKET_NAME: 'vitest-media',
      R2_PUBLIC_BASE_URL: 'https://cdn.vitest.example',
      NEXT_PUBLIC_R2_PUBLIC_BASE_URL:
        'https://cdn.vitest.example',

      R2_PRIVATE_BUCKET_NAME: 'vitest-proofs',
      R2_PRIVATE_ACCESS_KEY_ID: 'vitest-private-access-key',
      R2_PRIVATE_SECRET_ACCESS_KEY:
        'vitest-private-secret-key',

      TEMP_TOKEN_RETENTION_DAYS: '7',
      DELETED_UPLOAD_RETENTION_DAYS: '30',

      NEXT_PUBLIC_GA4_ID: 'G-TEST123',
      NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: 'test-gsc-verification',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
