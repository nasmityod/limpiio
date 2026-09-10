/**
 * e2e/specs/mobile-smoke.spec.ts
 *
 * Smoke test móvil real (Android/Pixel 7 e iOS/iPhone 13, ver playwright.config.ts:
 * proyectos `mobile-android` y `mobile-ios`).
 *
 * Cubre: overflow horizontal, CategoryDrawer, SearchMobileOverlay, PDP (swipe de
 * galería), carrito, CartDrawer, checkout de invitado, login CLIENT, reducedMotion,
 * orientación landscape y tamaño mínimo de objetivos táctiles (44×44).
 */
import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  E2E_CLIENT,
  E2E_PRODUCTS,
  E2E_HEIC_FIXTURE,
  productPdpPath,
  doLogin,
  fillGuestShippingStep,
  fillPagoMovilPaymentStep,
  fillWhatsAppGuestCheckout,
  mockHeicConversion,
  addProductToCart,
} from '../fixtures/constants';

/** Falla si el elemento no cumple el objetivo táctil mínimo (WCAG 2.5.5 / 44×44). */
async function assertMinTapTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label}: sin boundingBox (¿no visible?)`).not.toBeNull();
  if (!box) return;
  expect(box.width, `${label}: ancho ${box.width}px < 44px`).toBeGreaterThanOrEqual(44);
  expect(box.height, `${label}: alto ${box.height}px < 44px`).toBeGreaterThanOrEqual(44);
}

/** Simula un swipe táctil horizontal sobre un locator (touchscreen real de Playwright). */
async function swipeHorizontal(page: Page, locator: Locator, deltaX: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('swipeHorizontal: locator sin boundingBox');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + deltaX;

  await locator.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: startX, clientY: startY, pageX: startX, pageY: startY }],
    changedTouches: [{ identifier: 1, clientX: startX, clientY: startY, pageX: startX, pageY: startY }],
    targetTouches: [{ identifier: 1, clientX: startX, clientY: startY, pageX: startX, pageY: startY }],
  });
  await page.waitForTimeout(50);
  await locator.dispatchEvent('touchmove', {
    touches: [{ identifier: 1, clientX: endX, clientY: startY, pageX: endX, pageY: startY }],
    changedTouches: [{ identifier: 1, clientX: endX, clientY: startY, pageX: endX, pageY: startY }],
    targetTouches: [{ identifier: 1, clientX: endX, clientY: startY, pageX: endX, pageY: startY }],
  });
  await page.waitForTimeout(50);
  await locator.dispatchEvent('touchend', {
    touches: [],
    changedTouches: [{ identifier: 1, clientX: endX, clientY: startY, pageX: endX, pageY: startY }],
    targetTouches: [],
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

test.describe('Mobile smoke — Android/iOS reales', () => {
  test.setTimeout(60_000);

  test('home sin overflow horizontal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalOverflow(page);
  });

  test('carrusel de estantería: primer producto completo y snap', async ({ page }) => {
    async function assertCarouselAt(width: number, height: number) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const carousel = page.getByTestId('product-shelf-carousel').first();
      if ((await carousel.count()) === 0) {
        test.skip();
        return;
      }

      const firstCard = carousel.getByTestId('product-card').first();
      await expect(firstCard).toBeVisible();

      const fullyVisible = await firstCard.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth) + 1
        );
      });
      expect(fullyVisible, `primer card no cabe completo en ${width}px`).toBe(true);

      await carousel.evaluate((el) => {
        (el as HTMLElement).scrollLeft += 120;
      });

      await expect
        .poll(async () => {
          return carousel.evaluate((el) => {
            const cards = Array.from(
              el.querySelectorAll('[data-testid="product-card"]'),
            ) as HTMLElement[];
            if (cards.length === 0) return false;
            const left = el.scrollLeft;
            // Alineación razonable a un snap-start (±8 px).
            return cards.some((card) => Math.abs(card.offsetLeft - left) <= 8);
          });
        }, { timeout: 3000 })
        .toBe(true);

      // Dos rAF para estabilizar layout
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve());
            });
          }),
      );

      await assertNoHorizontalOverflow(page);
    }

    await assertCarouselAt(390, 844);
    await assertCarouselAt(320, 800);
  });

  test('viewport 320: sin overflow horizontal del documento', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalOverflow(page);
  });

  test('CategoryDrawer: abrir y cerrar por Escape y por tap', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const menuBtn = page.getByRole('button', { name: /Abrir menú de categorías/i });
    await expect(menuBtn).toBeVisible();
    await assertMinTapTarget(menuBtn, 'CategoryDrawer trigger');
    await menuBtn.tap();

    const dialog = page.getByRole('dialog', { name: /Menú de categorías/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    await menuBtn.tap();
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const closeBtn = dialog.getByRole('button', { name: /Cerrar menú/i });
    await assertMinTapTarget(closeBtn, 'CategoryDrawer close button');
    await closeBtn.tap();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('SearchMobileOverlay: input visible, submit y resultado', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const searchBtn = page.getByRole('button', { name: /Abrir búsqueda/i });
    await expect(searchBtn).toBeVisible();
    await assertMinTapTarget(searchBtn, 'Search trigger');
    await searchBtn.tap();

    const overlay = page.getByRole('dialog', { name: /Buscar productos/i });
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const input = overlay.locator('input[type="search"]');
    await expect(input).toBeVisible();

    const query = E2E_PRODUCTS.inStock.name.slice(0, 12);
    await input.fill(query);
    await overlay.getByRole('button', { name: /Ir al catálogo con esta búsqueda/i }).click();

    await expect(page).toHaveURL(/\/buscar\?q=/);
    await expect(page.getByText(E2E_PRODUCTS.inStock.name).first()).toBeVisible({ timeout: 10_000 });
  });

  test('PDP: swipe en galería, agregar al carrito y CartDrawer', async ({ page }) => {
    await page.goto(productPdpPath(E2E_PRODUCTS.inStock.slug));
    await page.waitForLoadState('networkidle');

    const fullscreenBtn = page.getByRole('button', { name: 'Pantalla completa' }).first();
    await expect(fullscreenBtn).toBeVisible();
    await fullscreenBtn.tap();

    const lightbox = page.getByRole('dialog', { name: /Visor de imágenes/i });
    await expect(lightbox).toBeVisible({ timeout: 10_000 });

    const viewport = lightbox.locator('div.touch-pan-y').first();
    await swipeHorizontal(page, viewport, -120);
    await expect(lightbox).toBeVisible();

    await lightbox.getByRole('button', { name: 'Cerrar' }).tap();
    await expect(lightbox).not.toBeVisible({ timeout: 5_000 });

    const addBtn = page.getByRole('button', { name: /Añadir al carrito/i });
    await expect(addBtn).toBeVisible();
    await assertMinTapTarget(addBtn, 'Add to cart button');
    await addBtn.tap();

    // Agregar al carrito abre el CartDrawer automáticamente (CartContext.addToCart → openCart()).
    const cartDialog = page.getByRole('dialog', { name: /Carrito de compras/i });
    await expect(cartDialog).toBeVisible({ timeout: 15_000 });
    await expect(cartDialog.getByText(E2E_PRODUCTS.inStock.name)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(cartDialog).not.toBeVisible({ timeout: 5_000 });

    const cartBtn = page.getByRole('button', { name: /Carrito de compras/i });
    await assertMinTapTarget(cartBtn, 'Cart trigger');
    await cartBtn.tap();
    await expect(cartDialog).toBeVisible({ timeout: 15_000 });

    await page.keyboard.press('Escape');
    await expect(cartDialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('Checkout WhatsApp invitado: envío, pago y Realizar compra @whatsapp', async ({ page }) => {
    await addProductToCart(page, E2E_PRODUCTS.inStock.slug);

    await page.goto('/checkout');
    await expect(page.getByText(/Pedido por WhatsApp/i)).toBeVisible({ timeout: 10_000 });
    await fillWhatsAppGuestCheckout(page);

    const compraBtn = page.getByRole('button', { name: /Realizar compra/i });
    await expect(compraBtn).toBeVisible();
    await assertMinTapTarget(compraBtn, 'Realizar compra');
  });

  test('Checkout full invitado: comprobante HEIC (iPhone) se normaliza a JPEG — HEIC', async ({ page }) => {
    await mockHeicConversion(page);

    await page.goto(productPdpPath(E2E_PRODUCTS.inStock.slug));
    await page.getByRole('button', { name: /Añadir al carrito/i }).click();
    await page.waitForTimeout(800);

    await page.goto('/checkout');
    await fillGuestShippingStep(page);

    let uploadedProofContentType: string | null = null;
    await page.route('**/api/checkout/upload-proof', async (route) => {
      const body = route.request().postData() ?? '';
      const match = body.match(/name="file"[^]*?Content-Type:\s*([\w./+-]+)/i);
      uploadedProofContentType = match?.[1] ?? null;
      await route.continue();
    });

    await fillPagoMovilPaymentStep(page, {
      name: 'foto-iphone.heic',
      mimeType: 'image/heic',
      buffer: E2E_HEIC_FIXTURE,
    });

    await page.getByRole('button', { name: /Confirmar pedido/i }).click();

    await expect.poll(() => uploadedProofContentType, { timeout: 20_000 }).toBe('image/jpeg');
  });

  test('login como CLIENT usando doLogin', async ({ page }) => {
    await doLogin(page, E2E_CLIENT.email, E2E_CLIENT.password);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  });

  test.describe('reducedMotion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('CategoryDrawer abre y cierra con motion reducido', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const menuBtn = page.getByRole('button', { name: /Abrir menú de categorías/i });
      await menuBtn.tap();

      const dialog = page.getByRole('dialog', { name: /Menú de categorías/i });
      await expect(dialog).toBeVisible({ timeout: 20_000 });

      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test('CategoryDrawer: backdrop bloquea scroll de fondo y restaura la posición al cerrar', async ({ page }) => {
    await page.goto(productPdpPath(E2E_PRODUCTS.inStock.slug));
    await page.waitForLoadState('networkidle');

    const menuBtn = page.getByRole('button', { name: /Abrir menú de categorías/i });
    await assertMinTapTarget(menuBtn, 'CategoryDrawer trigger');

    // Bajar lo suficiente para que el "bug clásico" de overflow:hidden sin
    // position:fixed sea detectable (en iOS el fondo seguía scrolleando).
    let scrollYBeforeOpen = await page.evaluate(() => {
      window.scrollTo(0, 500);
      return window.scrollY || document.documentElement.scrollTop;
    });
    if (scrollYBeforeOpen === 0) {
      const vp = page.viewportSize();
      if (vp) {
        await page.mouse.move(vp.width / 2, vp.height / 2);
        for (let i = 0; i < 8; i++) {
          await page.mouse.wheel(0, 400);
          await page.waitForTimeout(80);
        }
      }
      scrollYBeforeOpen = await page.evaluate(
        () => window.scrollY || document.documentElement.scrollTop,
      );
    }
    expect(scrollYBeforeOpen).toBeGreaterThan(0);

    // Click programático: un tap/click real de Playwright hace scroll-into-view
    // del elemento antes de disparar el evento, lo que ensuciaría la métrica de
    // scroll que estamos probando aquí.
    await menuBtn.evaluate((el: HTMLElement) => el.click());

    const dialog = page.getByRole('dialog', { name: /Menú de categorías/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const backdrop = page.getByLabel('Cerrar menú').first();
    await expect(backdrop).toBeVisible();

    // El hook fija el body con top negativo = scroll capturado al abrir.
    const lockedOffset = await page.evaluate(() => {
      const top = document.body.style.top;
      return top ? Math.abs(parseInt(top, 10)) : 0;
    });
    expect(lockedOffset).toBeGreaterThan(0);

    const closeBtn = dialog.getByRole('button', { name: /Cerrar menú/i });
    await assertMinTapTarget(closeBtn, 'CategoryDrawer close button');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    await expect.poll(
      () => page.evaluate(() => window.scrollY),
      { timeout: 3_000 },
    ).toBe(lockedOffset);
  });

  test('CartDrawer: backdrop bloquea scroll de fondo y restaura la posición al cerrar', async ({ page }) => {
    await page.goto(productPdpPath(E2E_PRODUCTS.inStock.slug));
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Añadir al carrito/i }).tap();
    const cartDialog = page.getByRole('dialog', { name: /Carrito de compras/i });
    await expect(cartDialog).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(cartDialog).not.toBeVisible({ timeout: 5_000 });

    const cartBtn = page.getByRole('button', { name: /Carrito de compras/i });
    await assertMinTapTarget(cartBtn, 'Cart trigger');

    const scrollYBeforeOpen = await page.evaluate(() => {
      window.scrollTo(0, 250);
      return window.scrollY;
    });
    expect(scrollYBeforeOpen).toBeGreaterThan(0);

    // Click programático: evita el scroll-into-view automático de Playwright.
    await cartBtn.evaluate((el: HTMLElement) => el.click());
    await expect(cartDialog).toBeVisible({ timeout: 15_000 });

    const lockedOffset = await page.evaluate(() => {
      const top = document.body.style.top;
      return top ? Math.abs(parseInt(top, 10)) : 0;
    });
    expect(lockedOffset).toBeGreaterThan(0);

    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    const scrollYWhileOpen = await page.evaluate(() => window.scrollY);
    expect(scrollYWhileOpen).toBe(0);

    await page.keyboard.press('Escape');
    await expect(cartDialog).not.toBeVisible({ timeout: 5_000 });

    await expect.poll(
      () => page.evaluate(() => window.scrollY),
      { timeout: 3_000 },
    ).toBe(lockedOffset);
  });

  test('orientación landscape: home sin overflow y menú abre', async ({ page }) => {
    const viewport = page.viewportSize();
    if (viewport) {
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalOverflow(page);

    const menuBtn = page.getByRole('button', { name: /Abrir menú de categorías/i });
    await expect(menuBtn).toBeVisible();
    await menuBtn.tap();

    const dialog = page.getByRole('dialog', { name: /Menú de categorías/i });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
  });
});
