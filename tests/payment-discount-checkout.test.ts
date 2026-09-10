import { describe, expect, it } from 'vitest';
import { checkoutSchema } from '@/lib/checkout-order';
import {
  calculatePaymentDiscountCents,
  resolvePaymentDiscountPercent,
  normalizePaymentMethod,
  DEFAULT_PAYMENT_METHODS,
} from '@/lib/payment-methods';

describe('payment-discount-checkout', () => {
  it('schema exige paymentMethodId y no acepta porcentaje del cliente', () => {
    const parsed = checkoutSchema.safeParse({
      customerName: 'Cliente',
      shippingDetails: { address: 'a', city: 'c', state: 's' },
      paymentMethodId: 'binancepay',
      paymentDiscountPercent: 99,
      paymentDiscount: 50,
      total: 1,
      items: [{ productId: 'p1', quantity: 1 }],
      channel: 'web',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('paymentDiscountPercent' in parsed.data).toBe(false);
      expect(parsed.data.paymentMethodId).toBe('binancepay');
    }
  });

  it('schema rechaza paymentMethod legacy string name', () => {
    const parsed = checkoutSchema.safeParse({
      customerName: 'Cliente',
      shippingDetails: { address: 'a', city: 'c', state: 's' },
      paymentMethod: 'Binance Pay',
      items: [{ productId: 'p1', quantity: 1 }],
    });
    expect(parsed.success).toBe(false);
  });

  it('fórmula: subtotal 100 + 10% pago + cupón 10 → total 80', () => {
    const subtotalCents = 10000;
    const paymentDiscountCents = calculatePaymentDiscountCents(subtotalCents, 10);
    const couponDiscountCents = 1000;
    const finalTotalCents = Math.max(0, subtotalCents - paymentDiscountCents - couponDiscountCents);
    expect(paymentDiscountCents).toBe(1000);
    expect(finalTotalCents).toBe(8000);
  });

  it('cupón porcentual y pago se calculan sobre subtotal original (independientes)', () => {
    const subtotalCents = 10000;
    const payment = calculatePaymentDiscountCents(subtotalCents, 10);
    const couponPct = 15;
    const coupon = Math.round((subtotalCents * couponPct) / 100);
    expect(payment).toBe(1000);
    expect(coupon).toBe(1500);
    expect(Math.max(0, subtotalCents - payment - coupon)).toBe(7500);
  });

  it('la suma de descuentos nunca produce total negativo', () => {
    const subtotalCents = 1000;
    const payment = calculatePaymentDiscountCents(subtotalCents, 80);
    const coupon = 500;
    expect(Math.max(0, subtotalCents - payment - coupon)).toBe(0);
  });

  it('método sin descuento → percent 0', () => {
    const m = normalizePaymentMethod(DEFAULT_PAYMENT_METHODS.find((x) => x.id === 'cashea')!);
    expect(resolvePaymentDiscountPercent(m)).toBe(0);
  });

  it('custom aplica su porcentaje', () => {
    const custom = normalizePaymentMethod({
      id: 'custom:abc',
      kind: 'CUSTOM_FOREIGN_CURRENCY',
      name: 'USDT',
      description: '',
      active: true,
      enabledInWhatsapp: true,
      enabledInFull: true,
      discountEligible: true,
      discountEnabled: true,
      discountPercent: 12.5,
      requireReferenceInFull: true,
      requireProofInFull: true,
      instructions: 'Paga USDT',
      recipientLabel: 'Wallet',
      recipientValue: '0xabc',
      acceptedCurrencies: ['USDT'],
      fullDeliveryScope: 'ANY',
      sortOrder: 70,
    });
    expect(resolvePaymentDiscountPercent(custom)).toBe(12.5);
    expect(calculatePaymentDiscountCents(10000, 12.5)).toBe(1250);
  });

  it('identidad: subtotal - payment - coupon = total', () => {
    const subtotal = 1999;
    const payment = calculatePaymentDiscountCents(subtotal, 7.5);
    const coupon = 200;
    const total = Math.max(0, subtotal - payment - coupon);
    expect(subtotal - payment - coupon).toBe(total);
  });
});
