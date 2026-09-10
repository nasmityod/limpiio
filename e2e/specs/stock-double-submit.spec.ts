/**
 * e2e/specs/stock-double-submit.spec.ts
 */
import {
  test,
  expect,
  E2E_PRODUCTS,
  productPdpPath,
  addProductToCart,
  fillGuestShippingStep,
  fillPagoMovilPaymentStep,
  readProductStock,
} from '../fixtures/constants';

test.describe('Stock y Doble Submit', () => {
  test('producto sin stock muestra Agotado', async ({ page }) => {
    await page.goto(productPdpPath(E2E_PRODUCTS.noStock.slug));
    await expect(page.getByText('Agotado').first()).toBeVisible();
  });

  test('producto con stock muestra unidades y botón activo', async ({ page }) => {
    await page.goto(productPdpPath(E2E_PRODUCTS.inStock.slug));
    await expect(page.getByRole('button', { name: /Añadir al carrito/i })).toBeEnabled();
    await expect(page.getByText(/En stock \(\d+ unidades\)/)).toBeVisible();
  });

  test('doble submit en checkout crea un solo pedido y descuenta stock una vez', async ({ page }) => {
    const initialStock = await readProductStock(page, E2E_PRODUCTS.inStock.slug);
    let orderPostCount = 0;

    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        orderPostCount += 1;
      }
      await route.continue();
    });

    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
    await page.goto('/checkout');
    await fillGuestShippingStep(page);
    await fillPagoMovilPaymentStep(page);

    const confirmBtn = page.getByRole('button', { name: /Confirmar pedido/i });
    await Promise.all([confirmBtn.click(), confirmBtn.click()]);

    await expect.poll(() => orderPostCount, { timeout: 20_000 }).toBe(1);

    const finalStock = await readProductStock(page, E2E_PRODUCTS.inStock.slug);
    expect(finalStock).toBe(initialStock - 1);
    expect(finalStock).not.toBe(initialStock - 2);
  });
});
