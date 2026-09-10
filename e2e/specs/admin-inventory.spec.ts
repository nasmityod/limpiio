/**
 * e2e/specs/admin-inventory.spec.ts
 *
 * Auditoría de rendimiento del Panel Admin — verificación en navegador real.
 *
 *  · El Inventario pagina en servidor: el DOM no crece con el catálogo.
 *  · DataTable monta UNA sola representación (no móvil + escritorio a la vez).
 *  · La búsqueda con debounce no genera una tormenta de peticiones y una
 *    respuesta vieja no pisa los resultados nuevos.
 *  · La galería del producto sube varias imágenes de forma independiente:
 *    dos fotos que juntas superan 5 MB se suben ambas, un fallo no cancela el
 *    resto, y un HEIC de iPhone se convierte antes de subir.
 */
import {
  test,
  expect,
  E2E_ADMIN,
  E2E_HEIC_FIXTURE,
  E2E_PNG_1X1,
  doLogin,
  mockHeicConversion,
} from '../fixtures/constants';
import type { Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * JPEG REAL de aproximadamente `targetBytes`.
 *
 * Tiene que ser decodificable: el cliente normaliza cada foto con
 * `createImageBitmap` + `<canvas>` antes de subirla, así que unos bytes con la
 * cabecera correcta pero sin imagen no ejercitarían el camino real. Se genera
 * ruido aleatorio porque comprime mal y permite alcanzar varios MB.
 */
const jpegCache = new Map<number, Buffer>();
async function realJpeg(targetBytes: number): Promise<Buffer> {
  const cached = jpegCache.get(targetBytes);
  if (cached) return cached;

  let side = 512;
  let out = Buffer.alloc(0);
  for (let attempt = 0; attempt < 6; attempt++) {
    const raw = Buffer.allocUnsafe(side * side * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 256) | 0;
    out = Buffer.from(
      await sharp(raw, { raw: { width: side, height: side, channels: 3 } })
        .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
        .toBuffer(),
    );
    if (out.length >= targetBytes) break;
    side = Math.round(side * 1.6);
  }
  jpegCache.set(targetBytes, out);
  return out;
}

/**
 * Intercepta /api/upload devolviendo una URL falsa por archivo, sin tocar R2.
 * `failFor` permite simular el fallo de UNA imagen concreta.
 */
async function stubUploadApi(
  page: Page,
  { failFor }: { failFor?: RegExp } = {},
): Promise<{ count: () => number }> {
  let calls = 0;
  await page.route('**/api/upload', async (route) => {
    calls++;
    const body = route.request().postData() ?? '';
    if (failFor && failFor.test(body)) {
      await route.fulfill({
        status: 413,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Esta imagen supera el tamaño máximo por archivo (10.0 MB).',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: `https://cdn.e2e.test/products/e2e-${calls}-${Date.now()}.webp`,
        publicId: `products/e2e-${calls}.webp`,
        width: 1200,
        height: 900,
        mimeType: 'image/webp',
      }),
    });
  });
  return { count: () => calls };
}

test.describe('Inventario admin — paginación y tabla', () => {
  test.setTimeout(90_000);

  test('el listado se pagina en servidor y no monta las dos vistas', async ({ page }) => {
    await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await page.goto('/admin/products');

    await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();

    // Una sola representación montada: o la tabla o las cards, nunca ambas.
    const tableRows = page.locator('[data-testid="datatable-table"] tbody tr');
    await expect(tableRows.first()).toBeVisible({ timeout: 15_000 });
    // La representación móvil ni siquiera está montada.
    await expect(page.locator('[data-testid="datatable-cards"]')).toHaveCount(0);

    // Nunca más filas que el pageSize del servidor.
    expect(await tableRows.count()).toBeLessThanOrEqual(30);

    // Y el contador del encabezado viene de un agregado del servidor.
    await expect(page.getByText(/\d+ productos/)).toBeVisible();
  });

  test('escribir rápido en el buscador no genera una petición por tecla', async ({ page }) => {
    await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await page.goto('/admin/products');
    await expect(page.locator('[data-testid="datatable-table"] tbody tr').first()).toBeVisible({
      timeout: 15_000,
    });

    // Las Server Actions viajan como POST a la propia ruta.
    let actionCalls = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/admin/products')) actionCalls++;
    });

    const search = page.getByPlaceholder(/Buscar nombre, SKU o marca/i);
    for (const char of 'audifonos') {
      await search.press(char);
      await page.waitForTimeout(30); // más rápido que el debounce de 300 ms
    }
    await page.waitForTimeout(1200);

    // Con 9 pulsaciones y debounce correcto deben quedar muy pocas cargas.
    expect(actionCalls).toBeLessThanOrEqual(3);

    // Y el contenido anterior no desaparece tras un esqueleto completo.
    await expect(page.getByText(/\d+ productos/)).toBeVisible();
  });

  test('la búsqueda conserva los filtros en la URL', async ({ page }) => {
    await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await page.goto('/admin/products');
    await expect(page.locator('[data-testid="datatable-table"] tbody tr').first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByPlaceholder(/Buscar nombre, SKU o marca/i).fill('audifonos');
    await page.waitForURL(/search=audifonos/, { timeout: 10_000 });
    expect(page.url()).toContain('search=audifonos');
  });
});

test.describe('Galería de producto — subida por archivo', () => {
  test.setTimeout(120_000);

  async function openNewProductModal(page: Page) {
    await doLogin(page, E2E_ADMIN.email, E2E_ADMIN.password);
    await page.goto('/admin/products');
    await page.getByRole('button', { name: /Nuevo/i }).click();
    await expect(page.getByRole('dialog', { name: /Nuevo producto/i })).toBeVisible();
  }

  test('dos fotos que juntas superan 5 MB se suben ambas', async ({ page }) => {
    const uploads = await stubUploadApi(page);
    await openNewProductModal(page);

    // 3 MB + 3 MB = 6 MB en total. Cada archivo va en su propia petición.
    const big = await realJpeg(3 * 1024 * 1024);
    expect(big.length).toBeGreaterThan(3 * 1024 * 1024);
    await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles([
      { name: 'foto-a.jpg', mimeType: 'image/jpeg', buffer: big },
      { name: 'foto-b.jpg', mimeType: 'image/jpeg', buffer: big },
    ]);

    await expect(page.getByText('2 de 2 subidas')).toBeVisible({ timeout: 30_000 });
    expect(uploads.count()).toBe(2);
    await expect(page.getByText('(2/6)')).toBeVisible();
  });

  test('el fallo de una imagen no cancela ni borra las demás', async ({ page }) => {
    await stubUploadApi(page, { failFor: /mala\.jpg/ });
    await openNewProductModal(page);

    const small = await realJpeg(120 * 1024);
    await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles([
      { name: 'buena-1.jpg', mimeType: 'image/jpeg', buffer: small },
      { name: 'mala.jpg', mimeType: 'image/jpeg', buffer: small },
      { name: 'buena-2.jpg', mimeType: 'image/jpeg', buffer: small },
    ]);

    await expect(page.getByText(/2 de 3 subidas · 1 con error/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/supera el tamaño máximo por archivo/i)).toBeVisible();
    // Las dos buenas siguen en la galería.
    await expect(page.getByText('(2/6)')).toBeVisible();
  });

  test('una foto HEIC de iPhone se convierte y se sube', async ({ page }) => {
    await mockHeicConversion(page);
    const uploads = await stubUploadApi(page);
    await openNewProductModal(page);

    await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles([
      { name: 'IMG_0042.HEIC', mimeType: 'image/heic', buffer: E2E_HEIC_FIXTURE },
    ]);

    await expect(page.getByText('1 de 1 subidas')).toBeVisible({ timeout: 30_000 });
    expect(uploads.count()).toBe(1);
    await expect(page.getByText('(1/6)')).toBeVisible();
  });

  test('mezcla HEIC + JPEG + PNG en una sola selección', async ({ page }) => {
    await mockHeicConversion(page);
    const uploads = await stubUploadApi(page);
    await openNewProductModal(page);

    await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles([
      { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: E2E_HEIC_FIXTURE },
      { name: 'foto.jpg', mimeType: 'image/jpeg', buffer: await realJpeg(120 * 1024) },
      { name: 'captura.png', mimeType: 'image/png', buffer: E2E_PNG_1X1 },
    ]);

    await expect(page.getByText('3 de 3 subidas')).toBeVisible({ timeout: 30_000 });
    expect(uploads.count()).toBe(3);
  });

  test('seleccionar más de MAX_SLOTS avisa sin perder las que sí caben', async ({ page }) => {
    await stubUploadApi(page);
    await openNewProductModal(page);

    const small = await realJpeg(120 * 1024);
    const files = Array.from({ length: 8 }, (_, i) => ({
      name: `f${i}.jpg`,
      mimeType: 'image/jpeg',
      buffer: small,
    }));
    await page.locator('input[type="file"][accept="image/*"][multiple]').setInputFiles(files);

    await expect(page.getByText('Límite de 6 elementos. Elimina uno para añadir otro.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('(6/6)')).toBeVisible();
    // Las 2 que no caben se reportan como error de ESE archivo, no de la tanda.
    await expect(
      page.getByText('Se alcanzó el límite de 6 elementos en la galería.').first(),
    ).toBeVisible();
  });
});
