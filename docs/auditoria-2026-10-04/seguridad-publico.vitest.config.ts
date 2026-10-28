import base from '../../vitest.config';
import { defineConfig } from 'vitest/config';

const url = process.env.AUDIT_DATABASE_URL || '';
const target = new URL(url || 'postgresql://invalid@127.0.0.1:1/invalid');
if (process.env.AUDIT_ISOLATED_DB !== '1' || target.hostname !== '127.0.0.1' || target.port !== '55439' || target.pathname !== '/limpio_audit_test') {
  throw new Error('This integration suite requires the explicitly isolated audit database on 127.0.0.1:55439/limpio_audit_test');
}
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['docs/auditoria-2026-10-04/seguridad-publico.integration.test.ts'],
    fileParallelism: false, testTimeout: 20_000, hookTimeout: 30_000,
    env: { ...base.test?.env, DATABASE_URL: url, NEXTAUTH_SECRET: 'isolated-audit-auth-secret-length-32', EMAIL_DELIVERY_SECRET: 'isolated-audit-email-secret-length-32', DATABASE_POOL_MAX: '10' },
  },
});
