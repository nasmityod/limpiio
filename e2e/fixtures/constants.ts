import { test as base, type Page } from '@playwright/test';

/**
 * Fixtures E2E deterministas para MundoTech.
 *
 * Datos generados por scripts/e2e-reset-db.ts.
 */

// ── Identificadores deterministas ──
export const E2E_ADMIN = {
  email: 'admin@mundotechtest.com',
  password: 'admin-e2e-pass',
  name: 'Admin Test',
} as const;

export const E2E_RBAC = {
  superadmin: E2E_ADMIN,
  pedidos: {
    email: 'pedidos@mundotechtest.com',
    password: 'pedidos-e2e-pass',
    name: 'SoloPedidos RBAC',
    permissions: ['ORDERS'] as const,
  },
  pedidosYPagos: {
    email: 'pedidospagos@mundotechtest.com',
    password: 'pedidospagos-e2e-pass',
    name: 'PedidosYPagos RBAC',
    permissions: ['ORDERS', 'PAYMENTS'] as const,
  },
  catalogo: {
    email: 'catalogo@mundotechtest.com',
    password: 'catalogo-e2e-pass',
    name: 'SoloCatalogo RBAC',
    permissions: ['CATALOG'] as const,
  },
  finanzas: {
    email: 'finanzas@mundotechtest.com',
    password: 'finanzas-e2e-pass',
    name: 'SoloFinanzas RBAC',
    permissions: ['FINANCIAL_SETTINGS'] as const,
  },
  settingsGeneral: {
    email: 'settingsgeneral@mundotechtest.com',
    password: 'settingsgeneral-e2e-pass',
    name: 'SoloSettingsGeneral RBAC',
    permissions: ['STORE_SETTINGS'] as const,
  },
  analitica: {
    email: 'analitica@mundotechtest.com',
    password: 'analitica-e2e-pass',
    name: 'SoloAnalitica RBAC',
    permissions: ['ANALYTICS'] as const,
  },
  exportacion: {
    email: 'exportacion@mundotechtest.com',
    password: 'exportacion-e2e-pass',
    name: 'SoloExportacion RBAC',
    permissions: ['ORDERS', 'CUSTOMER_DATA_EXPORT'] as const,
  },
  sinPermisos: {
    email: 'sinpermisos@mundotechtest.com',
    password: 'sinpermisos-e2e-pass',
    name: 'SinPermisos RBAC',
    permissions: [] as const,
  },
  /** ADMIN legacy sin permisos — para probar el invariante de role ADMIN sin permisos. */
  legacyAdminSinPermisos: {
    email: 'legacyadmin@mundotechtest.com',
    password: 'legacyadmin-e2e-pass',
    name: 'LegacyAdmin SinPermisos',
    permissions: [] as const,
  },
} as const;

export const E2E_CLIENT = {
  email: 'cliente@mundotechtest.com',
  password: 'cliente-e2e-pass',
  name: 'Cliente Test',
} as const;

export const E2E_PRODUCTS = {
  inStock: {
    name: 'Audífonos Bluetooth Test',
    slug: 'audifonos-bluetooth-test',
    price: 45.99,
    stock: 10,
    category: 'Electrónicos',
  },
  noStock: {
    name: 'Cargador USB-C Test',
    slug: 'cargador-usb-c-test',
    price: 15.50,
    stock: 0,
    category: 'Accesorios',
  },
} as const;

export const E2E_COUPON = {
  code: 'E2E10',
  discountPercent: 10,
  minPurchase: 20,
  maxDiscount: 10,
} as const;

/** Tokens de reset precargados en BD (hash en passwordResetToken). */
export const E2E_RESET_TOKENS = {
  valid: 'e2e-valid-reset-token-00000001',
  expired: 'e2e-expired-reset-token-00000002',
} as const;

/** PNG 1×1 con magic bytes válidos para upload de comprobante. */
export const E2E_PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * "HEIC" simulado: no es un HEIF real (Playwright no puede generar uno; sharp
 * tampoco puede codificar HEIC por licencia de HEVC). Solo se usa como bytes
 * de origen para `setInputFiles` — la conversión real se mockea con
 * `mockHeicConversion()`, que nunca inspecciona estos bytes.
 */
export const E2E_HEIC_FIXTURE = Buffer.from([
  0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // size + "ftyp"
  0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00, // "heic"
  0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63, // "mif1heic"
]);

/**
 * Mockea `lib/client-image-normalize.ts` para que la conversión HEIC→JPEG no
 * dependa de un HEIF real ni del chunk empaquetado de `heic2any` (frágil de
 * interceptar por URL). Debe llamarse ANTES de `page.goto()`.
 */
export async function mockHeicConversion(page: Page) {
  const jpegLikeBase64 = E2E_PNG_1X1.toString('base64');
  await page.addInitScript(
    ({ base64 }) => {
      window.__E2E_HEIC_DECODER__ = async () => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: 'image/jpeg' });
      };
    },
    { base64: jpegLikeBase64 },
  );
}

export function productPdpPath(slug: string): string {
  return `/product/${slug}`;
}

export async function addProductToCart(page: Page, slug: string) {
  await page.goto(productPdpPath(slug));
  const addBtn = page.getByRole('button', { name: /Añadir al carrito/i });
  await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await addBtn.click();
  await page.waitForTimeout(800);
}

/**
 * Realiza login con el form de credenciales (email + password).
 */
export async function doLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 10_000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  // Selector específico: `button[type="submit"]` es ambiguo (coincide también
  // con el submit del buscador del Navbar), lo que provocaba clicks erróneos.
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => {
    return url.pathname === '/' || url.pathname.startsWith('/admin') || url.pathname.startsWith('/account');
  }, { timeout: 20_000 });
}

export async function fillGuestShippingStep(page: Page) {
  await page.locator('#firstName').fill('Invitado');
  await page.locator('#lastName').fill('E2E');
  await page.locator('#idNumber').fill('12345678');
  await page.locator('#phoneNumber').fill('04121234567');
  await page.locator('#email').fill('invitado@e2e.test');
  await page.getByRole('button', { name: /Continuar al pago/i }).click();
  await page.getByRole('heading', { name: /Método de pago/i }).waitFor({ timeout: 10_000 });
}

/** Checkout WhatsApp embebido (una sola página, sin comprobante). */
export async function fillWhatsAppGuestCheckout(page: Page) {
  await page.locator('#firstName').fill('Invitado');
  await page.locator('#lastName').fill('E2E');
  await page.locator('#idNumber').fill('12345678');
  await page.locator('#phoneNumber').fill('04121234567');
  await page.getByRole('button', { name: 'Pago Móvil' }).click();
}

export async function fillPagoMovilPaymentStep(
  page: Page,
  proofFixture: { name: string; mimeType: string; buffer: Buffer } = {
    name: 'comprobante-e2e.png',
    mimeType: 'image/png',
    buffer: E2E_PNG_1X1,
  },
) {
  await page.getByRole('button', { name: 'Pago Móvil' }).click();
  await page.locator('#bank').selectOption({ index: 1 });
  await page.locator('#holderIdNumber').fill('V-12345678');
  await page.locator('#holderPhone').fill('04121234567');
  await page.locator('#referenceNumber').fill('1234567890');
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(proofFixture);
  // La normalización (HEIC→JPEG o compresión) es async — esperar a que el
  // preview reemplace el botón "Subir comprobante" antes de continuar.
  await page.getByText(/comprobante listo/i).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: /Revisar pedido/i }).click();
  await page.getByRole('heading', { name: /Revisión final/i }).waitFor({ timeout: 10_000 });
}

export async function readProductStock(page: Page, slug: string): Promise<number> {
  await page.goto(productPdpPath(slug));
  const stockText = page.getByText(/En stock — \d+ disponibles/);
  await stockText.waitFor({ state: 'visible', timeout: 10_000 });
  const match = (await stockText.innerText()).match(/— (\d+) disponibles/);
  if (!match) {
    throw new Error('No se pudo leer el stock del producto en PDP');
  }
  return Number(match[1]);
}

export const test = base;
export { expect } from '@playwright/test';
