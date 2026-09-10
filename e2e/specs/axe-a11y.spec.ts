/**
 * e2e/specs/axe-a11y.spec.ts
 *
 * Escaneo automatizado de accesibilidad con axe-core en rutas críticas
 * y overlays (drawers, popups, modales).
 *
 * Falla si se encuentran violaciones critical o serious.
 * Excepciones documentadas en lib/e2e-axe.ts (AXE_EXCEPTIONS)
 * con fecha de expiración — sin excepciones globales sin fecha.
 */
import { test, expect } from '../fixtures/constants';
import { scanAxe, filterExceptions } from '../../lib/e2e-axe';
import { E2E_PRODUCTS, E2E_ADMIN, doLogin, addProductToCart } from '../fixtures/constants';
import type { AxeViolationSummary } from '../../lib/e2e-axe';

/**
 * Filtra violaciones critical/serious y falla el test si las hay.
 * También imprime violaciones minor para referencia.
 */
async function assertNoCriticalSerious(violations: AxeViolationSummary[], context: string) {
  const filtered = filterExceptions(violations);
  const criticalSerious = filtered.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  if (criticalSerious.length > 0) {
    console.log(`[AXE-FAIL] ${context}: ${criticalSerious.length} critical/serious violation(s) sin excepción:`);
    for (const v of criticalSerious) {
      console.log(`  ${v.id} (${v.impact}): ${v.help}`);
      console.log(`  targets: ${JSON.stringify(v.targets.slice(0, 5))}`);
    }
  }

  const minor = filtered.filter((v) => v.impact === 'minor' || v.impact === 'moderate');
  if (minor.length > 0) {
    console.log(`[AXE-INFO] ${context}: ${minor.length} minor/moderate violation(s) (no fallan):`);
    for (const v of minor) {
      console.log(`  ${v.id} (${v.impact}): ${v.help}`);
    }
  }

  expect(
    criticalSerious,
    `${context}: ${criticalSerious.length} violación(es) critical/serious sin excepción`,
  ).toHaveLength(0);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test.describe('Axe — Accesibilidad automatizada', () => {
  // Aumentar timeout para escaneos axe que pueden ser lentos
  test.setTimeout(120_000);

  test.describe('Páginas públicas navegables', () => {
    const publicPages = [
      { path: '/', label: 'Home' },
      { path: '/productos', label: 'Productos (listado)' },
      { path: `/product/${E2E_PRODUCTS.inStock.slug}`, label: 'PDP (con stock)' },
      { path: `/product/${E2E_PRODUCTS.noStock.slug}`, label: 'PDP (sin stock)' },
      { path: '/cart', label: 'Carrito' },
      { path: '/login', label: 'Login' },
      { path: '/registro', label: 'Registro' },
      { path: '/ofertas', label: 'Ofertas' },
      { path: '/nosotros', label: 'Nosotros' },
      { path: '/devoluciones', label: 'Devoluciones' },
      { path: '/shipping-policy', label: 'Shipping Policy' },
      { path: '/privacy-policy', label: 'Privacidad' },
      { path: '/terms-of-service', label: 'Términos' },
      { path: '/tienda-barquisimeto', label: 'Tienda' },
    ];

    for (const { path, label } of publicPages) {
      test(`${label} — sin violaciones critical/serious`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        // Pequeña espera para que terminen animaciones
        await page.waitForTimeout(1000);

        const result = await scanAxe(page, label);
        await assertNoCriticalSerious(result.violations, label);
      });
    }
  });

  test.describe('Drawers y overlays abiertos', () => {
    test('CartDrawer abierto — sin violaciones critical/serious', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const cartBtn = page.getByRole('button', { name: /Carrito de compras/i });
      await expect(cartBtn).toBeVisible();
      await cartBtn.click();
      await expect(page.getByRole('dialog', { name: /Carrito de compras/i })).toBeVisible({ timeout: 15_000 });

      const result = await scanAxe(page, 'CartDrawer');
      await assertNoCriticalSerious(result.violations, 'CartDrawer');
    });

    test('CategoryDrawer abierto — sin violaciones critical/serious', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const menuBtn = page.getByRole('button', { name: /Abrir menú de categorías/i });
      await expect(menuBtn).toBeVisible();
      await menuBtn.click();
      await expect(page.getByRole('dialog', { name: /Menú de categorías/i })).toBeVisible({ timeout: 20_000 });

      const result = await scanAxe(page, 'CategoryDrawer');
      await assertNoCriticalSerious(result.violations, 'CategoryDrawer');
    });

    test('SearchMobileOverlay abierto — sin violaciones critical/serious', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const searchBtn = page.getByRole('button', { name: /Abrir búsqueda/i });
      await expect(searchBtn).toBeVisible();
      await searchBtn.click();
      const overlay = page.getByRole('dialog', { name: /Buscar productos/i });
      await expect(overlay).toBeVisible({ timeout: 10_000 });
      await expect(overlay.locator('input[type="search"]')).toBeVisible();

      const result = await scanAxe(page, 'SearchMobileOverlay');
      await assertNoCriticalSerious(result.violations, 'SearchMobileOverlay');
    });
  });

  test.describe('Checkout flow', () => {
    test('Checkout página — sin violaciones critical/serious', async ({ page }) => {
      // Agregar producto al carrito primero
      await addProductToCart(page, E2E_PRODUCTS.inStock.slug);
      await page.goto('/checkout');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const result = await scanAxe(page, 'Checkout');
      await assertNoCriticalSerious(result.violations, 'Checkout');
    });

    test('Checkout success (sin orden) — sin violaciones critical/serious', async ({ page }) => {
      // La página de success sin parámetros debería mostrar error controlado o fallar gracefulmente
      await page.goto('/checkout/success');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      const result = await scanAxe(page, 'Checkout Success (sin orden)');
      await assertNoCriticalSerious(result.violations, 'Checkout Success (sin orden)');
    });
  });

  test.describe('Admin pages', () => {
    test('Admin dashboard — sin violaciones critical/serious', async ({ page }) => {
      await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);

      // Navegar al admin dashboard
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const result = await scanAxe(page, 'Admin Dashboard');
      await assertNoCriticalSerious(result.violations, 'Admin Dashboard');
    });

    test('Admin products — sin violaciones critical/serious', async ({ page }) => {
      await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);

      await page.goto('/admin/products');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const result = await scanAxe(page, 'Admin Products');
      await assertNoCriticalSerious(result.violations, 'Admin Products');
    });

    test('Admin orders — sin violaciones critical/serious', async ({ page }) => {
      await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);

      await page.goto('/admin/orders');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const result = await scanAxe(page, 'Admin Orders');
      await assertNoCriticalSerious(result.violations, 'Admin Orders');
    });
  });

  test.describe('Auth pages — accesibilidad de formularios', () => {
    // Ya escaneamos login y registro en páginas públicas,
    // pero aquí escaneamos con estado autenticado para cubrir
    // redirects post-login y páginas protegidas.
    test('Login form — sin violaciones critical/serious', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await emailInput.fill('test@example.com');
      await passwordInput.fill('somepassword');
      await page.waitForTimeout(500);

      const result = await scanAxe(page, 'Login Form (relleno)');
      await assertNoCriticalSerious(result.violations, 'Login Form (relleno)');
    });

    test('Registro form — sin violaciones critical/serious', async ({ page }) => {
      await page.goto('/registro');
      await page.waitForLoadState('networkidle');

      const result = await scanAxe(page, 'Registro form');
      await assertNoCriticalSerious(result.violations, 'Registro form');
    });

    test('Forgot password — sin violaciones critical/serious', async ({ page }) => {
      await page.goto('/forgot-password');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const result = await scanAxe(page, 'Forgot Password');
      await assertNoCriticalSerious(result.violations, 'Forgot Password');
    });
  });

  test.describe('Account pages (autenticado)', () => {
    test('Account dashboard — sin violaciones critical/serious', async ({ page }) => {
      await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);

      await page.goto('/account');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const result = await scanAxe(page, 'Account Dashboard');
      await assertNoCriticalSerious(result.violations, 'Account Dashboard');
    });

    test('Account orders — sin violaciones critical/serious', async ({ page }) => {
      await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);

      await page.goto('/account/orders');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const result = await scanAxe(page, 'Account Orders');
      await assertNoCriticalSerious(result.violations, 'Account Orders');
    });

    test('Account details — sin violaciones critical/serious', async ({ page }) => {
      await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);

      await page.goto('/account/details');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const result = await scanAxe(page, 'Account Details');
      await assertNoCriticalSerious(result.violations, 'Account Details');
    });
  });
});
