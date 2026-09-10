/**
 * e2e/specs/home-manager.spec.ts
 * Persistencia inmediata del Gestor Home al cambiar de pestaña.
 */
import { test, expect, E2E_ADMIN, doLogin } from '../fixtures/constants';

test.describe('Gestor Home — sincronización de pestañas', () => {
  test.setTimeout(90_000);

  test('guardar título de estantería y conservar tras cambiar de pestaña', async ({
    page,
  }) => {
    await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await page.goto('/admin/home-manager');
    await expect(
      page.getByRole('heading', { name: /Gestión de la Home/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Estanterías de productos/i }).click();

    const titleInput = page.locator('#shelf-title-offers');
    await expect(titleInput).toBeVisible({ timeout: 20_000 });

    const original = await titleInput.inputValue();
    const tempTitle = `E2E Ofertas ${Date.now().toString().slice(-6)}`;

    await titleInput.fill(tempTitle);
    await page.getByRole('button', { name: /Guardar estanterías/i }).click();
    await expect(page.getByText(/Estanterías guardadas correctamente/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /Barra de Beneficios/i }).click();
    await expect(page.getByText(/Barra de Beneficios/i).first()).toBeVisible();

    await page.getByRole('button', { name: /Estanterías de productos/i }).click();
    await expect(page.locator('#shelf-title-offers')).toHaveValue(tempTitle);

    // Restaurar valor original para no contaminar otras pruebas.
    await page.locator('#shelf-title-offers').fill(original || 'Ofertas del Día');
    await page.getByRole('button', { name: /Guardar estanterías/i }).click();
    await expect(page.getByText(/Estanterías guardadas correctamente/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
