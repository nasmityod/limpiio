/**
 * e2e/specs/reset-password.spec.ts
 */
import {
  test,
  expect,
  E2E_CLIENT,
  E2E_RESET_TOKENS,
} from '../fixtures/constants';

test.describe('Reset Password', () => {
  test('forgot-password muestra formulario y confirmación genérica', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('#forgot-email')).toBeVisible();
    await expect(page.getByRole('button', { name: /Enviar enlace/i })).toBeVisible();

    await page.locator('#forgot-email').fill(E2E_CLIENT.email);
    await page.getByRole('button', { name: /Enviar enlace/i }).click();

    await expect(page.getByRole('status')).toBeVisible();
  });

  test('token válido precargado permite formulario de nueva contraseña', async ({ page }) => {
    await page.goto(`/reset-password#token=${encodeURIComponent(E2E_RESET_TOKENS.valid)}`);
    await expect(page.locator('#reset-password')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Guardar contraseña' })).toBeVisible();
  });

  test('token expirado precargado muestra enlace inválido', async ({ page }) => {
    await page.goto(`/reset-password#token=${encodeURIComponent(E2E_RESET_TOKENS.expired)}`);
    await expect(page.getByText(/caducado|inválido/i)).toBeVisible({ timeout: 15_000 });
  });

  test('enlace de login desde forgot-password funciona', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('link', { name: /Volver al inicio de sesión/i }).click();
    await expect(page).toHaveURL(/login/);
  });
});
