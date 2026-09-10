/**
 * e2e/specs/guest-checkout.spec.ts — checkout invitado SOLO en CHECKOUT_MODE=whatsapp
 * @whatsapp
 */
import {
  test,
  expect,
  E2E_PRODUCTS,
  addProductToCart,
  fillWhatsAppGuestCheckout,
} from '../fixtures/constants';

function sanitizeApiBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 500);
}

test.describe('Guest Checkout @whatsapp', () => {
  test('checkout WhatsApp como invitado con guestToken', async ({ page }) => {
    let orderPostCount = 0;

    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        orderPostCount += 1;
        const response = await route.fetch();
        const status = response.status();
        const rawBody = await response.text();

        if (status !== 201) {
          throw new Error(
            `POST /api/orders devolvió ${status}: ${sanitizeApiBody(rawBody)}`,
          );
        }

        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });

    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
    await page.goto('/checkout');
    await expect(page.getByText(/Pedido por WhatsApp/i)).toBeVisible({ timeout: 10_000 });

    await fillWhatsAppGuestCheckout(page);

    const orderResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/orders') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Realizar compra/i }).click();

    const orderResponse = await orderResponsePromise;
    expect(orderResponse.status()).toBe(201);

    const body = (await orderResponse.json()) as {
      guestToken?: string;
      orderNumber?: number;
      channel?: string | null;
    };

    // El checkout auto-redirige a wa.me ~1.5s tras crear el pedido.
    await page.goto('/');

    expect(orderPostCount).toBe(1);
    expect(body.guestToken?.length).toBeGreaterThan(10);
    expect(body.orderNumber).toBeGreaterThan(0);
    expect(body.channel).toBe('whatsapp');

    await page.goto(`/checkout/success?token=${encodeURIComponent(body.guestToken!)}`);
    const orderRef = `#${String(body.orderNumber).padStart(4, '0')}`;
    await expect(page.getByText(orderRef, { exact: true })).toBeVisible();
  });
});
