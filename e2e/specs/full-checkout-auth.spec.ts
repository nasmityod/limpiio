/**
 * e2e/specs/full-checkout-auth.spec.ts — auth obligatoria en CHECKOUT_MODE=full
 *
 * @full
 *
 * OBJETIVOS:
 * A) Guest no puede acceder a /checkout ni crear órdenes vía API.
 * B) Desde el carrito, hacer clic en "Proceder al pago" redirige al guest a
 *    /login?next=checkout (navegación RSC incluida).
 * C) Después de iniciar sesión el usuario vuelve a /checkout con el carrito
 *    conservado y el heading "Información de entrega" visible.
 */
import {
  test,
  expect,
  E2E_CLIENT,
  E2E_PRODUCTS,
  addProductToCart,
  doLogin,
} from '../fixtures/constants';

test.describe('Full checkout auth @full', () => {
  test('API: guest recibe 401 en POST /api/orders y POST /api/checkout/upload-session', async ({ request }) => {
    const guestOrder = await request.post('/api/orders', {
      data: {
        customerName: 'Atacante',
        customerPhone: '04121234567',
        customerEmail: 'atacante@e2e.test',
        customerIdNumber: '12345678',
        shippingMethod: 'tienda',
        shippingDetails: {
          address: 'Retiro',
          city: 'Barquisimeto',
          state: 'Lara',
          zipCode: 'N/A',
          country: 'Venezuela',
        },
        paymentMethod: 'Pago Móvil',
        paymentReference: '1234567890',
        items: [{ productId: 'prod-x', quantity: 1 }],
        channel: 'web',
      },
    });
    expect(guestOrder.status()).toBe(401);

    const uploadSession = await request.post('/api/checkout/upload-session');
    expect(uploadSession.status()).toBe(401);
  });

  test('flujo carrito → login?next=checkout → /checkout con carrito conservado', async ({ page }) => {
    test.setTimeout(60_000);

    // 1. Guest agrega producto desde la PDP (usa addProductToCart del fixture).
    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);

    // 2. Ir a la página del carrito y hacer clic en "Proceder al pago".
    //    Esto dispara router.push('/checkout'), que el middleware intercepta
    //    como navegación RSC y redirige a /login?next=checkout.
    await page.goto('/cart');
    await page.getByRole('button', { name: /Proceder al pago/i }).first().click();

    // 3. El guest debe terminar en /login con ?next=checkout, ya sea por redirect
    //    directo del servidor o tras la navegación RSC que el middleware intercepta.
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    const loginUrl = new URL(page.url());
    expect(loginUrl.searchParams.get('next')).toBe('checkout');

    // Banner de cookies puede tapar el formulario.
    const cookieDialog = page.getByRole('dialog', { name: /Aviso de cookies/i });
    if (await cookieDialog.count()) {
      await page.getByRole('button', { name: 'Solo lo necesario' }).click();
    }

    // 4. Iniciar sesión sin navegar a /login de nuevo (ya estamos en /login?next=checkout).
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 });
    await page.fill('input[type="email"]', E2E_CLIENT.email);
    await page.fill('input[type="password"]', E2E_CLIENT.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    // 5. Después del login debe volver a /checkout.
    await expect(page).toHaveURL(/\/checkout/, { timeout: 30_000 });

    // 6. El heading del paso de envío es visible (carrito conservado, flujo activo).
    await expect(page.getByTestId('checkout-shipping-heading')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('checkout-shipping-heading')).toHaveText('Información de entrega');
  });

  test('CLIENT autenticado accede directamente a /checkout con heading Información de entrega', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
    await page.goto('/checkout');
    await expect(page.getByTestId('checkout-shipping-heading')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('checkout-shipping-heading')).toHaveText('Información de entrega');

    // La sesión autenticada también puede crear upload-session.
    const authedUpload = await page.request.post('/api/checkout/upload-session');
    expect(authedUpload.status()).toBe(200);
    const uploadBody = (await authedUpload.json()) as { token?: string };
    expect(uploadBody.token?.length).toBeGreaterThan(10);
  });
});
