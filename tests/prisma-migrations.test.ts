import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('prisma migrations payment discount', () => {
  it('migración contiene columnas y constraints', () => {
    const path = join(
      process.cwd(),
      'prisma/migrations/20260717070000_add_order_payment_discount_snapshot/migration.sql',
    );
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, 'utf8');
    for (const col of [
      'paymentMethodId',
      'subtotalBeforeDiscount',
      'paymentDiscountPercent',
      'paymentDiscount',
      'paymentCurrency',
    ]) {
      expect(sql).toContain(col);
    }
    expect(sql).toMatch(/paymentDiscountPercent.*BETWEEN 0 AND 100|paymentDiscountPercent_range/i);
    expect(sql).toMatch(/paymentDiscount.*>= 0|paymentDiscount_nonneg/i);
    expect(sql).toMatch(/subtotalBeforeDiscount.*>= 0|subtotalBeforeDiscount_nonneg/i);
  });
});
