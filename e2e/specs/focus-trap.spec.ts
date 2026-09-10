/**
 * e2e/specs/focus-trap.spec.ts
 *
 * Verifica focus trap en browser real: Escape solo cierra overlay superior,
 * Tab/Shift+Tab ciclan dentro del drawer.
 */
import { test, expect } from '../fixtures/constants';

test.describe('Focus trap — teclado en overlays', () => {
  test.setTimeout(60_000);

  test('CategoryDrawer: Tab cicla y Escape cierra', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const menuBtn = page.getByRole('button', { name: /Abrir menú de categorías/i });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    const dialog = page.getByRole('dialog', { name: /Menú de categorías/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const focusables = dialog.locator(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const count = await focusables.count();
    expect(count).toBeGreaterThan(1);

    const firstHandle = focusables.first();
    const lastHandle = focusables.nth(count - 1);

    await expect(firstHandle).toBeVisible();
    await lastHandle.focus();
    await expect(lastHandle).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(firstHandle).toBeFocused();

    await firstHandle.focus();
    await expect(firstHandle).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(lastHandle).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('CartDrawer: Escape cierra el panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /Añadir al carrito/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();
    await page.waitForTimeout(800);

    const cartBtn = page.getByRole('button', { name: /Carrito de compras/i });
    await expect(cartBtn).toBeVisible();
    await cartBtn.click();

    const dialog = page.getByRole('dialog', { name: /Carrito de compras/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const closeBtn = dialog.locator('button[aria-label*="Cerrar carrito" i]').first();
    await closeBtn.focus();
    await expect(closeBtn).toBeFocused();

    await page.keyboard.press('Tab');
    const focusedAfterTab = dialog.locator(':focus');
    await expect(focusedAfterTab).toBeVisible();
    expect(await dialog.locator(':focus').count()).toBe(1);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
