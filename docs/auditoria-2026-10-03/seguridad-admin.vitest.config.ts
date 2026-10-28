import base from '../../vitest.config';
import { defineConfig, mergeConfig } from 'vitest/config';
export default mergeConfig(base, defineConfig({ test: {
  include: ['docs/auditoria-2026-10-03/seguridad-*.evidence.test.ts'],
} }));
