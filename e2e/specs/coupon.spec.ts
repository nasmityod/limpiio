/**
 * e2e/specs/coupon.spec.ts
 */
import {
  test,
  expect,
  E2E_PRODUCTS,
  E2E_COUPON,
  addProductToCart,
  fillGuestShippingStep,
  fillPagoMovilPaymentStep,
} from '../fixtures/constants';

async function goToCheckoutReview(page: import('@playwright/test').Page) {
  await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
  await page.goto('/checkout');
  await fillGuestShippingStep(page);
  await fillPagoMovilPaymentStep(page);
}

test.describe('Cupón', () => {
  test('aplicar cupón válido en revisión de checkout', async ({ page }) => {
    await goToCheckoutReview(page);

    const couponInput = page.getByPlaceholder('Ingresa tu código');
    await expect(couponInput).toBeVisible();
    await couponInput.fill(E2E_COUPON.code);
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page.getByText(E2E_COUPON.code)).toBeVisible();
    await expect(page.getByText(/Descuento/i)).toBeVisible();
  });

  test('cupón inválido muestra error', async ({ page }) => {
    await goToCheckoutReview(page);

    const couponInput = page.getByPlaceholder('Ingresa tu código');
    await expect(couponInput).toBeVisible();
    await couponInput.fill('CODIGO_INEXISTENTE');
    await page.getByRole('button', { name: 'Aplicar' }).click();

    await expect(page.getByText(/no es válido/i)).toBeVisible();
  });
});
