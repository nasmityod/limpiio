import { defineConfig } from 'vitest/config';
import base from '../../vitest.config';
export default defineConfig({ ...base, test: { ...base.test, include: ['docs/auditoria-2026-10-03/storefront-evidence.test.tsx', 'docs/auditoria-2026-10-03/catalog-evidence.test.ts'] } });
