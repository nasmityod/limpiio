/**
 * e2e/specs/whatsapp-order-status-guard.spec.ts — SOLO en CHECKOUT_MODE=whatsapp
 * @whatsapp
 *
 * OBJETIVOS A/B/C: un pedido WhatsApp (`stockDeducted=false`) no puede avanzar
 * a En Proceso/Enviado/Entregado por las rutas genéricas de estado (individual
 * ni bulk); solo `validateOrderPayment()` («Validar pago») descuenta stock y
 * avanza el estado, de forma atómica.
 */
import {
  test,
  expect,
  E2E_ADMIN,
  E2E_PRODUCTS,
  addProductToCart,
  fillWhatsAppGuestCheckout,
  readProductStock,
  doLogin,
} from '../fixtures/constants';

const GUARD_MESSAGE =
  'Este pedido de WhatsApp aún no ha descontado inventario. Valida el pago con la acción «Validar pago» antes de avanzar el estado.';

function sanitizeApiBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 500);
}

test.describe('Guard de estado — pedidos WhatsApp @whatsapp', () => {
  test('bloquea avance genérico sin stock descontado; Validar pago descuenta stock y avanza', async ({ page }) => {
    test.setTimeout(90_000);

    // 1) Crear pedido WhatsApp como invitado y capturar su orderNumber.
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
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

    const stockBefore = await readProductStock(page, E2E_PRODUCTS.inStock.slug);

    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
    await page.goto('/checkout');
    await fillWhatsAppGuestCheckout(page);

    const orderResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/orders') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Realizar compra/i }).click();

    const orderResponse = await orderResponsePromise;
    expect(orderResponse.status()).toBe(201);
    const orderBody = (await orderResponse.json()) as { orderNumber?: number; channel?: string | null };
    const orderNumber = orderBody.orderNumber ?? 0;
    expect(orderNumber).toBeGreaterThan(0);
    expect(orderBody.channel).toBe('whatsapp');

    // El checkout auto-redirige a wa.me ~1.5s tras crear el pedido.
    await page.goto('/');

    // El checkout WhatsApp valida disponibilidad pero NO descuenta stock aún.
    const stockAfterCreate = await readProductStock(page, E2E_PRODUCTS.inStock.slug);
    expect(stockAfterCreate).toBe(stockBefore);

    // 2) Entrar como admin y localizar el pedido vía API (sin depender del debounce de la tabla).
    await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);

    const listResponse = await page.request.get(`/api/orders?limit=50&q=${orderNumber}`);
    expect(listResponse.status()).toBe(200);
    const listBody = (await listResponse.json()) as {
      orders: Array<{ id: string; orderNumber: number }>;
    };
    const matchingOrders = listBody.orders.filter((o) => o.orderNumber === orderNumber);
    expect(matchingOrders).toHaveLength(1);
    const orderId = matchingOrders[0].id;
    expect(orderId.length).toBeGreaterThan(0);

    await page.goto(`/admin/orders/${orderId}`);
    await page.waitForURL(/\/admin\/orders\/.+/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: `#${String(orderNumber).padStart(4, '0')}` }),
    ).toBeVisible({ timeout: 15_000 });

    // 3) La UI no debe ofrecer avanzar el estado directamente (solo Pendiente/Cancelado).
    await expect(page.getByRole('button', { name: 'Marcar como En Proceso' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Marcar como Enviado' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Marcar como Entregado' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Validar pago/i })).toBeVisible({ timeout: 15_000 });

    // 4) La seguridad real vive en el endpoint: un PUT directo debe rechazarse con 409.
    const blockedResponse = await page.request.put(`/api/orders/${orderId}/status`, {
      data: { status: 'En Proceso' },
    });
    expect(blockedResponse.status()).toBe(409);
    const blockedBody = await blockedResponse.json();
    expect(blockedBody.message).toBe(GUARD_MESSAGE);

    // El bulk-status-update también debe rechazar toda la operación.
    const bulkBlocked = await page.request.post('/api/orders/bulk-status-update', {
      data: { orderIds: [orderId], status: 'En Proceso' },
    });
    expect(bulkBlocked.status()).toBe(409);
    const bulkBlockedBody = await bulkBlocked.json();
    expect(bulkBlockedBody.updatedCount).toBe(0);

    // Ninguno de los intentos bloqueados modificó el estado ni el stock.
    const stockAfterBlocked = await readProductStock(page, E2E_PRODUCTS.inStock.slug);
    expect(stockAfterBlocked).toBe(stockBefore);

    // 5) «Validar pago» descuenta stock y avanza el estado en una sola operación atómica.
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByRole('button', { name: /Validar pago/i })).toBeVisible({ timeout: 15_000 });
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Validar pago/i }).click();
    await expect(page.getByText('En Proceso', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    const stockAfterValidate = await readProductStock(page, E2E_PRODUCTS.inStock.slug);
    expect(stockAfterValidate).toBe(stockBefore - 1);

    // 6) Ahora que el stock ya se descontó, el avance genérico SÍ debe permitirse.
    const allowedResponse = await page.request.put(`/api/orders/${orderId}/status`, {
      data: { status: 'En Proceso' },
    });
    expect(allowedResponse.status()).toBe(200);
  });
});
