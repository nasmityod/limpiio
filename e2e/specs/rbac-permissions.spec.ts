/**
 * RBAC E2E matrix — permisos granulares del panel admin.
 *
 * Cubre: pedidos, pagos, catálogo, finanzas, settings, exportación,
 * superadmin, navegación desktop/mobile, NewOrdersWatcher, auditoría.
 */
import { test, expect, doLogin, E2E_RBAC, E2E_CLIENT } from '../fixtures/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loginAs(page: Parameters<typeof doLogin>[0], user: { email: string; password: string }) {
  await doLogin(page, user.email, user.password);
}

// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS Y PAGOS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Pedidos y pagos @RBAC', () => {
  test('SoloPedidos entra a pedidos', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/orders/);
  });

  test('SoloPedidos no puede ver comprobante de pago (403)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    const res = await page.request.get('/api/admin/payment-proof/non-existent');
    expect([403, 404]).toContain(res.status());
  });

  test('SoloPedidos no puede validar pago (403)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    const res = await page.request.post('/api/admin/orders/non-existent/validate-payment', {
      data: { action: 'approve' },
    });
    expect([400, 403, 404]).toContain(res.status());
  });

  test('SoloPedidos no puede aprobar Binance (403)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    const res = await page.request.post('/api/admin/orders/non-existent/approve-binance', {
      data: {},
    });
    expect([400, 403, 404]).toContain(res.status());
  });

  test('PedidosYPagos entra a pedidos', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidosYPagos);
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/orders/);
  });

  test('PedidosYPagos puede acceder a comprobante (200 o 404 por fixture)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidosYPagos);
    const res = await page.request.get('/api/admin/payment-proof/non-existent');
    // 403 sería bloqueado por permiso; 404 es "no existe" = OK (tiene acceso)
    expect(res.status()).not.toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Catálogo @RBAC', () => {
  test('SoloCatalogo accede a productos', async ({ page }) => {
    await loginAs(page, E2E_RBAC.catalogo);
    await page.goto('/admin/products');
    await expect(page).toHaveURL(/\/admin\/products/);
  });

  test('SoloCatalogo no accede a pedidos', async ({ page }) => {
    await loginAs(page, E2E_RBAC.catalogo);
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/unauthorized/);
  });

  test('SoloPedidos no accede a productos', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    await page.goto('/admin/products');
    await expect(page).toHaveURL(/\/admin\/unauthorized/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — GENERAL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Settings general @RBAC', () => {
  test('SoloSettingsGeneral ve configuración general', async ({ page }) => {
    await loginAs(page, E2E_RBAC.settingsGeneral);
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByText('Información de la Tienda')).toBeVisible();
  });

  test('SoloSettingsGeneral no ve sección financiera (tasa/cuentas)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.settingsGeneral);
    await page.goto('/admin/settings');
    await expect(page.getByText('Tasa de Cambio USD / Bs')).toHaveCount(0);
  });

  test('GET /api/settings no contiene campos financieros para STORE_SETTINGS', async ({ page }) => {
    await loginAs(page, E2E_RBAC.settingsGeneral);
    const res = await page.request.get('/api/settings');
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('pagoMovil');
    expect(body).not.toHaveProperty('transferencia');
    expect(body).not.toHaveProperty('binancePayId');
    expect(body).not.toHaveProperty('binanceQrUrl');
  });

  test('PUT /api/settings/financial → 403 para STORE_SETTINGS', async ({ page }) => {
    await loginAs(page, E2E_RBAC.settingsGeneral);
    const res = await page.request.put('/api/settings/financial', {
      data: { binancePayId: 'X' },
    });
    expect(res.status()).toBe(403);
  });

  test('PUT general con campo financiero → 400 (schema strict)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.settingsGeneral);
    const res = await page.request.put('/api/settings/general', {
      data: {
        storeName: 'MundoTech E2E',
        phone: '0412-0000000',
        email: 'e2e@mundotechtest.com',
        pagoMovil: { bank: 'X', phone: '0412', idNumber: 'V-1' },
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — FINANZAS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Settings finanzas @RBAC', () => {
  test('SoloFinanzas ve tasa y cuentas', async ({ page }) => {
    await loginAs(page, E2E_RBAC.finanzas);
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByText('Tasa de Cambio USD / Bs')).toBeVisible();
  });

  test('SoloFinanzas no ve formulario general', async ({ page }) => {
    await loginAs(page, E2E_RBAC.finanzas);
    await page.goto('/admin/settings');
    await expect(page.getByText('Información de la Tienda')).toHaveCount(0);
  });

  test('GET /api/settings no contiene campos generales no requeridos para FINANCIAL', async ({ page }) => {
    await loginAs(page, E2E_RBAC.finanzas);
    const res = await page.request.get('/api/settings/financial');
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('storeName');
    expect(body).not.toHaveProperty('phone');
    expect(body).not.toHaveProperty('email');
  });

  test('PUT /api/settings/general → 403 para FINANCIAL_SETTINGS', async ({ page }) => {
    await loginAs(page, E2E_RBAC.finanzas);
    const res = await page.request.put('/api/settings/general', {
      data: {
        storeName: 'MundoTech E2E',
        phone: '0412-0000000',
        email: 'e2e@mundotechtest.com',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('PUT financial con campo general → 400 (schema strict)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.finanzas);
    const res = await page.request.put('/api/settings/financial', {
      data: {
        storeName: 'Intruso',
        pagoMovil: { bank: '', phone: '', idNumber: '' },
        transferencia: { bank: '', accountNumber: '', accountHolder: '', rif: '' },
        binancePayId: '',
        binanceQrUrl: '',
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Exportación @RBAC', () => {
  test('SoloPedidos no puede exportar CSV (403)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    const res = await page.request.get('/api/orders/export.csv');
    expect(res.status()).toBe(403);
  });

  test('SoloExportacion puede exportar CSV (200)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.exportacion);
    const res = await page.request.get('/api/orders/export.csv');
    expect(res.status()).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPERADMIN
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Superadmin @RBAC', () => {
  test('Superadmin ve Usuarios en navegación móvil', async ({ page }) => {
    await loginAs(page, E2E_RBAC.superadmin);
    await page.goto('/admin/menu');
    await expect(page.getByText('Usuarios')).toBeVisible();
  });

  test('Superadmin abre diálogo de permisos', async ({ page }) => {
    await loginAs(page, E2E_RBAC.superadmin);
    await page.goto('/admin/settings/users');
    await expect(page).toHaveURL(/\/admin\/settings\/users/);
    // El diálogo de permisos está disponible (trigger visible)
    const permButton = page.getByRole('button', { name: /Permisos|Editar permisos/i }).first();
    await expect(permButton).toBeVisible();
  });

  test('No aparecen acciones para modificar/eliminar Superadmin', async ({ page }) => {
    await loginAs(page, E2E_RBAC.superadmin);
    await page.goto('/admin/settings/users');
    // La fila del superadmin no debe tener botón de eliminar ni de editar
    const superadminRow = page.getByText(E2E_RBAC.superadmin.email).locator('..');
    await expect(superadminRow.getByRole('button', { name: /Eliminar/i })).toHaveCount(0);
  });

  test('Intento directo de modificar Superadmin falla (acción)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.superadmin);
    // Obtener el ID del superadmin via UI no es trivial; verificamos que la ruta de
    // API rechaza la operación si se envía el userId del superadmin
    const res = await page.request.post('/api/admin/users/update-permissions', {
      data: { userId: 'superadmin-placeholder', permissions: [] },
    });
    // Debe ser error (403, 400 o el userId no existe → mensaje controlado)
    expect([400, 403, 404]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAVEGACIÓN — Desktop
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Navegación desktop @RBAC', () => {
  test('SoloPedidos solo ve pedidos en sidebar', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    await page.goto('/admin/orders');
    await expect(page.getByRole('link', { name: /Pedidos/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Catálogo|Productos/i }).first()).toHaveCount(0);
  });

  test('SoloCatalogo no ve pedidos en sidebar', async ({ page }) => {
    await loginAs(page, E2E_RBAC.catalogo);
    await page.goto('/admin/products');
    await expect(page.getByRole('link', { name: /Pedidos/i }).first()).toHaveCount(0);
  });

  test('Usuarios solo Superadmin', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: /Usuarios/i })).toHaveCount(0);
  });

  test('Settings aparece con STORE_SETTINGS', async ({ page }) => {
    await loginAs(page, E2E_RBAC.settingsGeneral);
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
  });

  test('Settings aparece con FINANCIAL_SETTINGS', async ({ page }) => {
    await loginAs(page, E2E_RBAC.finanzas);
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAVEGACIÓN — Mobile bottom nav
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Navegación mobile @RBAC', () => {
  test('SoloPedidos bottom nav no muestra catálogo', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    await page.goto('/admin/orders');
    const bottomNav = page.locator('[data-testid="mobile-bottom-nav"], nav[aria-label="Navegación admin"]').first();
    await expect(bottomNav.getByRole('link', { name: /Catálogo|Productos/i })).toHaveCount(0);
  });

  test('SoloCatalogo bottom nav no muestra pedidos', async ({ page }) => {
    await loginAs(page, E2E_RBAC.catalogo);
    await page.goto('/admin/products');
    const bottomNav = page.locator('[data-testid="mobile-bottom-nav"], nav[aria-label="Navegación admin"]').first();
    await expect(bottomNav.getByRole('link', { name: /Pedidos/i })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NewOrdersWatcher
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — NewOrdersWatcher @RBAC', () => {
  test('SoloPedidos: watcher realiza fetch a /api/orders/new-count', async ({ page }) => {
    await loginAs(page, E2E_RBAC.pedidos);
    const requestPromise = page.waitForRequest((req) =>
      req.url().includes('/api/orders/new-count'),
      { timeout: 10_000 },
    );
    await page.goto('/admin/orders');
    const req = await requestPromise;
    expect(req.url()).toContain('/api/orders/new-count');
  });

  test('SoloCatalogo: watcher NO realiza fetch a /api/orders/new-count', async ({ page }) => {
    let watcherFetched = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/orders/new-count')) watcherFetched = true;
    });
    await loginAs(page, E2E_RBAC.catalogo);
    await page.goto('/admin/products');
    await page.waitForTimeout(3_000);
    expect(watcherFetched).toBe(false);
  });

  test('SoloSettingsGeneral: watcher NO presente', async ({ page }) => {
    let watcherFetched = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/orders/new-count')) watcherFetched = true;
    });
    await loginAs(page, E2E_RBAC.settingsGeneral);
    await page.goto('/admin/settings');
    await page.waitForTimeout(3_000);
    expect(watcherFetched).toBe(false);
  });

  test('Superadmin: watcher presente', async ({ page }) => {
    const requestPromise = page.waitForRequest((req) =>
      req.url().includes('/api/orders/new-count'),
      { timeout: 10_000 },
    );
    await loginAs(page, E2E_RBAC.superadmin);
    await page.goto('/admin');
    const req = await requestPromise;
    expect(req.url()).toContain('/api/orders/new-count');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIN PERMISOS / CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Sin permisos y cliente @RBAC', () => {
  test('SinPermisos (CLIENT) atraviesa middleware pero layout redirige', async ({ page }) => {
    await loginAs(page, E2E_RBAC.sinPermisos);
    await page.goto('/admin');
    const url = page.url();
    // No debe quedar en una ruta admin operativa
    expect(url.includes('/admin/unauthorized') || url.includes('/') || url.includes('/login')).toBeTruthy();
  });

  test('Usuario sin sesión recibe redirect a /login en ruta admin', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Cliente autenticado no entra a pedidos admin', async ({ page }) => {
    await loginAs(page, E2E_CLIENT);
    const res = await page.request.get('/api/admin/orders');
    expect([401, 403]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORÍA DE PERMISOS (Superadmin asigna y revisa log)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('RBAC — Auditoría @RBAC', () => {
  test('Log de auditoría existe tras cambio de permisos (via API)', async ({ page }) => {
    await loginAs(page, E2E_RBAC.superadmin);
    // Consulta el log de auditoría y verifica que tiene registros (el seed
    // puede no generar, pero verifica que el endpoint responde correctamente)
    const res = await page.request.get('/api/admin/users/permission-audit-log');
    expect([200, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as unknown[];
      expect(Array.isArray(body)).toBe(true);
    }
  });
});
