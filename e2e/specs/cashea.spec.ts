/**
 * e2e/specs/cashea.spec.ts — Fase 9 ("Fase 9 — Seguridad/CSP y pruebas E2E"
 * en docs/MundoTech-Cashea-Orquestacion-Cursor.md).
 *
 * @full
 *
 * Reglas globales (Sección 7 del documento maestro — copiadas literal):
 * - No modificar el flujo de pago existente (Pago Móvil, Zelle, Binance,
 *   efectivo) salvo lo indicado.
 * - No cambiar CHECKOUT_MODE, ni los precios autoritativos, ni la lógica
 *   transaccional/Serializable existente.
 * - No introducir dependencias nuevas salvo cashea-web-checkout-sdk@1.1.19
 *   fijada exacta (no aplica en esta fase).
 * - No exponer la clave privada al cliente ni loguear secretos.
 * - No confiar en la URL de retorno como prueba de pago.
 * - No autocancelar pedidos Cashea a los 60 min.
 * - No permitir Cashea a usuarios invitados en ningún modo.
 * - No permitir cupones cuando el método es Cashea.
 * - No enviar deliveryPrice distinto de 0.
 * - No inventar el contrato del API: lo dependiente de Cashea queda tras
 *   verifyCasheaOrder con TODO explícito y tipado.
 *
 * IMPORTANTE — límite conocido y documentado (Sección 4/12 del documento
 * maestro; ver también nota 3 de docs/MundoTech-Cashea-Orquestacion-Cursor.md
 * Sección 0): `verifyCasheaOrder` SIEMPRE lanza `CasheaVerificationNotImplemented`
 * hasta que Cashea confirme el mecanismo real (Fase 10, bloqueada por la
 * Sección 12). Por lo tanto NINGÚN pedido puede llegar a `CONFIRMED` todavía,
 * ni con el flag encendido — esto no es un bug de estos tests, es el
 * comportamiento correcto y esperado mientras el adaptador siga siendo un
 * TODO. El "flujo feliz" verificable hoy es: sesión -> botón -> retorno con
 * token -> verificación intentada -> queda pendiente (RETURNED) -> success
 * muestra "Verificando tu pago". Simular `CONFIRMED` requeriría inventar el
 * cuerpo de `verifyCasheaOrder`, lo que las reglas de esta sesión prohíben.
 *
 * Los tests que ejercitan el flujo con CASHEA_ENABLED=true (grupo
 * "@cashea-enabled" más abajo) requieren variables de entorno sandbox
 * FALSAS (nunca credenciales reales) exportadas antes de levantar el
 * webServer de Playwright, ya que `NEXT_PUBLIC_CASHEA_ENABLED` se inyecta en
 * el bundle cliente al arrancar `next dev`. Ejemplo (una sola vez, en la
 * misma shell que ejecuta `npm run test:e2e`):
 *
 *   export CASHEA_ENABLED=true NEXT_PUBLIC_CASHEA_ENABLED=true \
 *     CASHEA_ENV=sandbox CASHEA_API_BASE_URL=https://e2e-cashea.invalid/api \
 *     CASHEA_PRIVATE_API_KEY=e2e-fake-private-key \
 *     CASHEA_EXTERNAL_CLIENT_ID=e2e-client CASHEA_STORE_ID=1 \
 *     CASHEA_STORE_NAME="MundoTech E2E" CASHEA_MERCHANT_NAME="MundoTech E2E" \
 *     CASHEA_SDK_VERSION=1.1.19 CASHEA_CURRENCY=USD \
 *     NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY=e2e-fake-public-key
 *   npm run test:e2e -- e2e/specs/cashea.spec.ts
 *
 * Sin esas variables (caso por defecto de este repo/CI), el grupo
 * "flag off" corre igual y confirma que el modo manual (WhatsApp) sigue
 * intacto — el resto del archivo se salta automáticamente (test.skip).
 */
import { test, expect, E2E_CLIENT, E2E_PRODUCTS, addProductToCart, doLogin, fillGuestShippingStep } from '../fixtures/constants';

/** Forma mínima usada en las aserciones — evita importar `@/lib/cashea` (módulo de servidor) desde el runner E2E. */
type CasheaSessionPayloadShape = {
  deliveryPrice: number;
  couponCode?: unknown;
};

const CASHEA_ENABLED_FOR_THIS_RUN = process.env.NEXT_PUBLIC_CASHEA_ENABLED === 'true';

const FAKE_PRIVATE_KEY_FRAGMENT = process.env.CASHEA_PRIVATE_API_KEY?.trim();

test.describe('Cashea — flag apagado (modo manual WhatsApp intacto) @full', () => {
  test('invitado: POST /api/cashea/session no existe (404), sin revelar la feature', async ({ request }) => {
    const res = await request.post('/api/cashea/session', { data: {} });
    // Con el flag apagado el guard responde 404 antes de cualquier otra
    // validación (Fase 4, punto 1) — invitado o no, la respuesta es la misma.
    expect(res.status()).toBe(404);
  });

  test('GET /checkout/cashea/return con flag apagado redirige a /checkout genérico (usuario autenticado)', async ({ page }) => {
    // `/checkout/cashea/return` cuelga de `/checkout*`, que en CHECKOUT_MODE=full
    // exige sesión a nivel de middleware (defense-in-depth previa al propio
    // guard del route handler) — se autentica primero para llegar al handler.
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await page.goto('/checkout/cashea/return?token=cualquier-cosa&idNumber=X');
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('checkout UI: con el método Cashea seleccionado se ofrece el copy manual (WhatsApp), nunca el SDK', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
    // Navegación por botón (como en e2e/specs/full-checkout-auth.spec.ts): el
    // carrito ya está cargado en /cart antes de entrar a /checkout, evitando
    // la carrera del guard `cart.length === 0 -> router.replace('/cart')` de
    // CheckoutFlow.tsx justo tras una navegación de documento completa.
    await page.goto('/cart');
    await page.getByRole('button', { name: /Proceder al pago/i }).first().click();
    await page.getByTestId('checkout-shipping-heading').waitFor({ timeout: 15_000 });
    await fillGuestShippingStep(page);

    await page.getByRole('button', { name: 'Cashea' }).click();
    await expect(page.getByText(/coordinamos tu compra con Cashea/i)).toBeVisible();
    await page.getByRole('button', { name: /Revisar pedido/i }).click();

    await expect(page.getByRole('heading', { name: /Revisión final/i })).toBeVisible({ timeout: 10_000 });
    // Copy manual (Sección 7 Fase 6, punto 1): nunca el copy del flujo automático.
    await expect(page.getByText(/te mostraremos un botón de WhatsApp para coordinar/i)).toBeVisible();
  });
});

test.describe('Cashea — con CASHEA_ENABLED=true (sandbox falso) @full @cashea-enabled', () => {
  test.skip(!CASHEA_ENABLED_FOR_THIS_RUN, 'Requiere exportar variables CASHEA_* sandbox (ver comentario superior).');

  test('invitado -> 401 en POST /api/cashea/session (Cashea nunca permite invitados)', async ({ request }) => {
    const res = await request.post('/api/cashea/session', {
      data: {
        customerName: 'Invitado E2E',
        customerIdNumber: 'V12345678',
        shippingMethod: 'tienda',
        shippingDetails: { address: 'Retiro', city: 'Barquisimeto', state: 'Lara', zipCode: 'N/A', country: 'Venezuela' },
        paymentMethodId: 'cashea',
        items: [{ productId: 'prod-x', quantity: 1 }],
        channel: 'web',
      },
    });
    expect(res.status()).toBe(401);
  });

  test('cupón con Cashea -> 422, no crea sesión ni pedido', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    const res = await page.request.post('/api/cashea/session', {
      data: {
        customerName: 'Cliente E2E',
        customerIdNumber: 'V12345678',
        shippingMethod: 'tienda',
        shippingDetails: { address: 'Retiro', city: 'Barquisimeto', state: 'Lara', zipCode: 'N/A', country: 'Venezuela' },
        paymentMethodId: 'cashea',
        couponCode: 'E2E10',
        items: [{ productId: 'prod-x', quantity: 1 }],
        channel: 'web',
      },
    });
    expect(res.status()).toBe(422);
  });

  test('flujo feliz: sesión -> botón -> retorno con token -> queda pendiente de verificación -> success', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
    // Navegación por botón (como en e2e/specs/full-checkout-auth.spec.ts): evita
    // la carrera del guard `cart.length === 0 -> router.replace('/cart')` de
    // CheckoutFlow.tsx justo tras una navegación de documento completa a /checkout.
    await page.goto('/cart');
    await page.getByRole('button', { name: /Proceder al pago/i }).first().click();
    await page.getByTestId('checkout-shipping-heading').waitFor({ timeout: 15_000 });
    await fillGuestShippingStep(page);

    await page.getByRole('button', { name: 'Cashea' }).click();
    // Copy del flujo automático (Fase 6, punto 1) — nunca "coordinar por WhatsApp".
    await expect(page.getByText(/dirigido a Cashea para completar tu compra/i)).toBeVisible();
    await page.getByRole('button', { name: /Revisar pedido/i }).click();
    await page.getByRole('heading', { name: /Revisión final/i }).waitFor({ timeout: 10_000 });

    const sessionResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/cashea/session') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /Confirmar pedido/i }).click();
    const sessionResponse = await sessionResponsePromise;
    expect(sessionResponse.status()).toBe(200);

    const sessionBody = (await sessionResponse.json()) as {
      orderId: string;
      publicApiKey: string;
      payload: CasheaSessionPayloadShape;
      returnToken: string;
    };

    // Nunca la clave privada en la respuesta al cliente (Sección 7 del documento maestro).
    const rawBody = JSON.stringify(sessionBody);
    if (FAKE_PRIVATE_KEY_FRAGMENT) {
      expect(rawBody).not.toContain(FAKE_PRIVATE_KEY_FRAGMENT);
    }
    expect(rawBody).not.toContain('privateApiKey');
    // deliveryPrice SIEMPRE 0 (Sección 1/5/7) y sin campos de cupón.
    expect(sessionBody.payload.deliveryPrice).toBe(0);
    expect(sessionBody.payload).not.toHaveProperty('couponCode');

    // El botón del SDK oficial se monta (import dinámico, cliente).
    await expect(page.getByTestId('cashea-checkout-button-container')).toBeVisible({ timeout: 10_000 });

    // Simula el retorno del navegador desde Cashea (nunca prueba de pago por
    // sí mismo — Sección 3.10/3.11): navega directo a la URL de retorno con
    // el token real emitido por /api/cashea/session.
    await page.goto(`/checkout/cashea/return?token=${sessionBody.returnToken}&idNumber=E2E-CASHEA-ORDER-1`);

    await expect(page).toHaveURL(new RegExp(`/checkout/success\\?orderId=${sessionBody.orderId}`));
    // verifyCasheaOrder no implementado (Sección 4/12) -> el pedido NUNCA se
    // confirma sin evidencia real; queda pendiente para recuperación manual.
    await expect(page.getByText('Verificando tu pago', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Estamos verificando tu pago inicial con Cashea/i)).toBeVisible();

    // Replay del token: un segundo retorno con el mismo token ya no encuentra
    // el pedido (fue invalidado de un solo uso) -> redirección neutra, nunca
    // reconfirma (Sección 3.6/anti-replay).
    await page.goto(`/checkout/cashea/return?token=${sessionBody.returnToken}&idNumber=OTRO-ID-ATACANTE`);
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('idNumber manipulado (path/SSRF injection) en el retorno -> redirección neutra, nunca 500 ni fuga', async ({ page }) => {
    // `/checkout/cashea/return` exige sesión a nivel de middleware (defense-in-depth).
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await page.goto('/checkout/cashea/return?token=token-inexistente&idNumber=../../etc/passwd');
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('open redirect: parámetros extra en la URL de retorno nunca cambian el destino (siempre same-origin fijo)', async ({ page, baseURL }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await page.goto(
      '/checkout/cashea/return?token=x&idNumber=Y&redirect=https://evil.example&next=https://evil.example&return_to=//evil.example',
    );
    const url = new URL(page.url());
    // El handler (app/checkout/cashea/return/route.ts) solo lee `token` e
    // `idNumber` — cualquier otro parámetro se ignora (Sección 12, pregunta
    // 6: no documentado, no se inventa). El destino SIEMPRE es same-origin.
    expect(url.origin).toBe(new URL(baseURL ?? '').origin);
    expect(['/checkout', '/checkout/success']).toContain(url.pathname);
  });
});
