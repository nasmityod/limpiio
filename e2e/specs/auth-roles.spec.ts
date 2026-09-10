/**
 * e2e/specs/auth-roles.spec.ts
 */
import { test, expect, E2E_ADMIN, E2E_CLIENT, doLogin } from '../fixtures/constants';

test.describe('Auth y Roles', () => {
  test('login como CLIENT redirige al home', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  });

  test('login como ADMIN redirige al admin', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 });
    await page.fill('input[type="email"]', E2E_ADMIN.email);
    await page.fill('input[type="password"]', E2E_ADMIN.password);
    // Selector específico: `button[type="submit"]` es ambiguo (coincide también
    // con el submit del buscador del Navbar).
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL(/\/admin/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test('CLIENT recibe 403 al acceder a /admin', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await page.goto('/admin');
    await page.waitForTimeout(1500);
    const url = page.url();
    const origin = new URL(url).origin;
    const has403 = url.includes('/403') || url.includes('error=AccessDenied');
    const isHome = url === `${origin}/` || url === origin;
    expect(has403 || isHome).toBeTruthy();
  });

  test('página de login existe y muestra formulario', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('GET /api/orders/:id/payment-proof — guest 401, CLIENT 403', async ({ page, request }) => {
    // Guest sin sesión: middleware.ts (isUserTokenApi) devuelve 401 sin
    // llegar al handler ni consultar BD. El id no necesita existir.
    const guestResponse = await request.get('/api/orders/does-not-exist/payment-proof');
    expect(guestResponse.status()).toBe(401);

    // CLIENT autenticado sin rol ADMIN: requireAdmin() en el handler
    // devuelve 403 (pasó el middleware pero no el chequeo de rol).
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    const clientResponse = await page.request.get('/api/orders/does-not-exist/payment-proof');
    expect(clientResponse.status()).toBe(403);
  });

  test('logout funciona', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await page.getByRole('button', { name: 'Mi cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
    await expect(page.getByRole('link', { name: /Iniciar sesión|Entrar/i })).toBeVisible();
  });
});
