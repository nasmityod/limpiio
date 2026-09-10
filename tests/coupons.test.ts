import { describe, expect, it } from 'vitest';
import { calculatePaymentDiscountCents } from '@/lib/payment-methods';

describe('coupons + payment discount accumulation', () => {
  it('ambos descuentos sobre subtotal original', () => {
    const subtotalCents = 10000;
    const payment = calculatePaymentDiscountCents(subtotalCents, 10);
    const couponFixed = 1000;
    expect(payment + couponFixed).toBe(2000);
    expect(subtotalCents - payment - couponFixed).toBe(8000);
  });
});
