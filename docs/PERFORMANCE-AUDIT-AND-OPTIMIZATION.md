# Auditoría y optimización de rendimiento — MundoTech

**Fecha:** 2026-08-27
**Rama de trabajo:** `perf/audit-2026-08` (git worktree en `/home/deploy/mundotech-audit`)
**Commit base:** `0d05152`
**Next.js:** 16.2.10 (Turbopack) · **React:** 19.2.5 · App Router · Node 22

---

## 0. INCIDENTE DE PRODUCCIÓN (previo a la auditoría)

> Este incidente lo causé yo al inicio de la sesión. Se documenta completo porque
> define la regla de aislamiento que rige el resto del trabajo.

### Comando que lo causó

```bash
npx next build
```

### Mecanismo

`/var/www/mundotech` **no es una copia de trabajo: es el despliegue de producción**.
El servicio systemd `mundotech.service` ejecuta `next start` sirviendo desde
`/var/www/mundotech/.next`.

`next build` **borra y regenera `.next` in-place**. La ejecución falló a mitad:

```
Error: ENOTEMPTY: directory not empty, rmdir
  '.next/server/app/product/dispensador-y-aceitero-multiuso-con-atomizador.segments/product/$d$slug'
```

`.next` quedó con únicamente `cache/`, un `server/` parcial y ficheros de traza:
**sin `BUILD_ID`, sin `static/`, sin manifests**.

### Impacto

- El proceso en ejecución seguía sirviendo lo que ya tenía resuelto en memoria:
  `/` → 200, `/productos` → 200.
- Cualquier ruta que requiriera lectura diferida de disco → **500**. `/cart` caía.
- Los chunks `/_next/static/*` con hash ya no existían en disco: cualquier cliente
  nuevo habría recibido 404.
- El sitio **no habría sobrevivido a un reinicio ni a un despliegue** en ese estado.

Error real en `journalctl -u mundotech`:

```
⨯ Error [ChunkLoadError]: Failed to load chunk server/chunks/ssr/_0pauh9z._.js
  [cause]: Cannot find module '/var/www/mundotech/.next/server/chunks/ssr/_0pauh9z._.js'
```

### Build afectado

El `.next` destruido correspondía al commit `0d05152` (build del 26-ago 23:19).

### Restauración

`.next-previous/` contenía un build íntegro (`BUILD_ID dAGvg1PHxviK0xkhBQ9AE`,
26-ago 10:54). Verificado **antes** de tocar nada:

| Comprobación | Resultado |
|---|---|
| `BUILD_ID` | `dAGvg1PHxviK0xkhBQ9AE` |
| `static/` | 289 ficheros |
| `static/chunks/` | 260 ficheros |
| `server/` | 4485 ficheros |
| `server/app/` | 3492 ficheros |
| Manifests (`routes`, `build`, `prerender`, `app-path-routes`, `required-server-files`, `images`) | presentes |
| Chunks referenciados por `build-manifest.json` | 11 referenciados, **0 ausentes** |
| `static/<BUILD_ID>/` | presente |

`react-loadable-manifest.json` no existe: **no lo usan los builds de App Router**, no es un fallo.

Pasos ejecutados:

```bash
mv .next .next-BROKEN-20260827-102807     # el build dañado se CONSERVA
cp -a .next-previous .next
# (re-merge de server/ — ver nota abajo)
sudo systemctl restart mundotech          # ejecutado manualmente por el propietario
```

**Nota sobre la copia:** el primer `cp -a` falló parcialmente porque el servidor vivo
recreó `.next/cache` y `.next/server` durante la copia, dejando `server/` con 20
ficheros en lugar de 4485. Se re-fusionó con
`cp -a --remove-destination .next-previous/server/. .next/server/` y se verificaron
los conteos contra el origen.

### Verificación posterior al restart

HTTP (todas las rutas públicas):

| Ruta | Código |
|---|---|
| `/` | 200 |
| `/productos` | 200 |
| `/categoria/belleza` | 200 |
| `/buscar?q=audifonos` | 200 |
| `/product/mini-cpu-de-escritorio-dell-optiplex` | 200 |
| `/cart` | 200 |
| `/checkout` | 200 |
| `/login` | 200 |
| `/wishlist` | 200 |
| `/ofertas` | 200 |
| `/nosotros` | 200 |

Assets: **17 chunks JS/CSS únicos referenciados por `/`, 0 respuestas != 200.**
Imágenes: `next/image` sobre logos locales y R2 remoto, **todas 200**.
Servicio: `active (running)`, `BUILD_ID` = `dAGvg1PHxviK0xkhBQ9AE` (el esperado).
Logs desde el restart: **0 `ChunkLoadError` / `MODULE_NOT_FOUND` / `Cannot find module`.**

### Efecto secundario asumido

`.next-previous` es anterior al commit `0d05152`, así que producción quedó sirviendo
código de `fa7e71d` (20-ago). El delta es casi todo panel admin + tests + scripts,
pero **incluye `lib/home-cache.ts` y el nuevo `lib/home-shelf-rotation.ts`**: la
rotación de estanterías del home está ausente hasta desplegar un build correcto.

Se verificó que esto es **seguro respecto a la base de datos**: la migración de
`0d05152` (`20260826120000_add_admin_performance_indexes`) es **puramente aditiva** —
cinco `CREATE INDEX IF NOT EXISTS`, sin cambios de columnas ni tablas. El código
anterior funciona sin problemas contra el esquema migrado.

### Regla permanente de aislamiento

> **PROHIBIDO** ejecutar `next build`, `npx next build` o cualquier comando que
> escriba en `/var/www/mundotech/.next` mientras esa carpeta sea producción.

Todo el trabajo de auditoría se realiza en un **git worktree aislado**:

- Ubicación: `/home/deploy/mundotech-audit` (rama `perf/audit-2026-08`)
- Puerto local exclusivo: **3210** (producción sigue en 3000; el 3100 pertenece a
  otro servicio preexistente y no se tocó)
- `node_modules` es una **copia real** (no symlink: Turbopack rechaza symlinks que
  salen de la raíz del proyecto con `Symlink [project]/node_modules is invalid`)
- `.next` del worktree es desechable y se borra entre builds

### Medidas para impedir que se repita

1. **Despliegue únicamente vía `npm run deploy:vps`**, y solo tras verificar los
   cambios en el worktree.
2. `next.config.mjs` ya soporta `distDir: process.env.NEXT_BUILD_DIR || '.next'`.
   Si alguna vez hay que construir dentro del directorio de producción, usar
   `NEXT_BUILD_DIR=.next-validate npx next build` — **nunca** el `.next` vivo.
3. Reiniciar siempre el servidor después de un build: un proceso Next vivo mantiene
   en memoria los nombres de chunk del build anterior. *(Esto se reprodujo también
   dentro del worktree: tras reconstruir sin reiniciar, el servidor servía HTML que
   referenciaba CSS ya inexistente y el layout aparecía sin estilos.)*
4. Un build correcto también requiere borrar `.next` del worktree: se observó que
   Turbopack **reutilizó la página ISR prerenderizada de `.next/cache`** y no
   regeneró `/` pese a haber cambiado el código fuente. Sin `rm -rf .next` las
   mediciones habrían sido falsas.

---

## 1. Executive Summary

### Estado inicial

El home montaba **114 componentes `ProductCard`** para **37 productos únicos**.
`ProductShelf` renderizaba la misma colección **tres veces** —carrusel móvil, grid
tablet y grid desktop— ocultando dos de los tres árboles con CSS. Los **76 duplicados
invisibles se hidrataban igual**: React montaba, suscribía a contextos y ejecutaba
efectos para nodos que ningún usuario vería jamás.

Sobre eso, `ProductCard` consumía `useCart()` solo para obtener `addToCart`, pero el
value del contexto es un objeto literal recreado en cada render, así que **cualquier**
cambio de estado del carrito (abrir el drawer, añadir un producto, un anuncio aria-live)
re-renderizaba **todas** las tarjetas.

Y el elemento LCP —la primera imagen de producto— se servía con `loading="lazy"` y sin
`fetchpriority`, con **617 ms de puro retraso de descubrimiento**.

### Problemas principales

1. Triple render de la colección de productos (multiplicador **3,08×**).
2. Recurso LCP sin prioridad ni descubrimiento temprano.
3. `ProductCard` acoplado al *estado* del carrito cuando solo necesita *acciones*.
4. Meta Pixel (105 KiB) descargado en la ruta crítica pese a arrancar sin consentimiento.

### Optimizaciones aplicadas

| # | Optimización | Riesgo |
|---|---|---|
| OPT-1 | `ProductShelf`: render único + breakpoints por CSS | Bajo |
| OPT-2 | Prioridad LCP en las 2 primeras tarjetas de la primera estantería | Bajo |
| OPT-3 | `CartContext`: separación estado / acciones estables | Bajo |
| OPT-4 | Meta Pixel: descarga diferida a tiempo ocioso | Bajo |

### Resultado

Mediciones deterministas (sin ruido de CPU):

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| `ProductCard` montados | 114 | **38** | **−66,7 %** |
| Nodos DOM (Lighthouse) | 4146 | **1707** | **−58,8 %** |
| Nodos DOM (medición propia) | 4214 | **1731** | **−58,9 %** |
| HTML del home | 975 930 B | **430 753 B** | **−55,9 %** |
| `<img>` en el DOM | 117 | **41** | **−65,0 %** |
| Tarjetas ocultas por CSS | 76 | **0** | **−100 %** |
| LCP · *resource load delay* | 617 ms | **45 ms** | **−92,7 %** |
| Scripting del chunk principal | 2475 ms | **1524 ms** | **−38,4 %** |
| Inicio de descarga `fbevents.js` | 390 ms | **1144 ms** | fuera de ruta crítica |

Y la funcionalidad y el diseño se mantienen: **geometría de render idéntica al píxel
en los 8 breakpoints exigidos**, incluida la altura total de página.

---

## 2. Métricas

### 2.1 Datos aportados por PageSpeed (referencia del cliente, NO medidos por mí)

| Métrica | Valor |
|---|---:|
| Performance | 68 |
| FCP | ~1,7 s |
| LCP | ~3,3 s |
| TBT | ~1080 ms |
| CLS | 0 |
| Speed Index | ~2,6 s |

Campo (CrUX): LCP ~2,9 s · INP ~249 ms · CLS 0 · FCP ~1,8 s · TTFB ~0,8 s.

### 2.2 Datos medidos localmente

**Limitación del entorno, declarada explícitamente:** este VPS es sensiblemente más
lento que la máquina de referencia de PageSpeed, y **con varianza alta entre
ejecuciones**. Los valores absolutos NO son comparables con los de PageSpeed; sólo
los deltas *antes/después medidos en la misma máquina* son significativos.

Que el entorno es fiel se confirma porque dos auditorías independientes del tamaño
coinciden exactamente con lo que reportó PageSpeed: **JS no utilizado 145 KiB** y
**CSS no utilizado 16,1 KiB**.

Se ejecutaron **dos series pareadas completas de 3 ejecuciones cada una** (medianas).

#### Serie A — con `/api/auth/session` y `/api/config/exchange-rate` devolviendo 500

*(artefacto del sandbox: yo había vaciado credenciales; afectó por igual a antes y después)*

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Performance | 60 | 68 | **+8** |
| FCP | 1125 ms | 957 ms | −14,9 % |
| LCP | 4119 ms | 3874 ms | −5,9 % |
| TBT | 1735 ms | **838 ms** | **−51,7 %** |
| CLS | 0 | 0 | = |
| Speed Index | 2393 ms | 1976 ms | −17,4 % |
| JS execution | 4131 ms | **2633 ms** | **−36,3 %** |
| Main-thread work | 8815 ms | 6254 ms | −29,1 % |
| Long tasks | 20 | 14 | −30 % |
| Long tasks (total) | 4022 ms | 2131 ms | −47,0 % |
| Max Potential FID | 1210 ms | 387 ms | −68,0 % |

#### Serie B — entorno corregido (todas las rutas 200)

| Métrica | Antes | Después | Δ |
|---|---:|---:|---:|
| Performance | 59 | 65 | **+6** |
| FCP | 1199 ms | 955 ms | −20,4 % |
| LCP | 4067 ms | 3784 ms | −7,0 % |
| TBT | 2022 ms | **1148 ms** | **−43,2 %** |
| CLS | 0 | 0 | = |
| Speed Index | 2137 ms | 2376 ms | +11,2 % ⚠ |
| JS execution | 3714 ms | 2861 ms | −23,0 % |
| Main-thread work | 8259 ms | 7345 ms | −11,1 % |
| Long tasks | 20 | 19 | −5 % |
| Long tasks (total) | 4258 ms | 2809 ms | −34,0 % |
| Max Potential FID | 1028 ms | 564 ms | −45,1 % |

**Lectura honesta de las dos series.** Los rangos de mejora robustos —consistentes en
ambas— son: TBT **−43 % a −52 %**, JS execution **−23 % a −36 %**, long tasks totales
**−34 % a −47 %**, FCP **−15 % a −20 %**, Max FID **−45 % a −68 %**, Performance
**+6 a +8 puntos**, LCP **−6 % a −7 %**.

El Speed Index de la serie B sube un 11 %, pero con dispersión enorme entre
ejecuciones (1670–2515 ms). No lo considero una regresión real: **es ruido de la
máquina**. Los conteos deterministas de la sección 1 no dependen de la CPU y son la
evidencia sólida.

**No fue posible medir INP de forma fiable en este entorno**: INP es una métrica de
campo y Lighthouse no la reporta. Como proxy de laboratorio se usa *Max Potential FID*
(−45 % a −68 %) y una medición directa de latencia de interacción con
`PerformanceObserver` sobre el click de "Añadir al carrito": **48–56 ms**.

---

## 3. Root causes

### Problema 1 — Triple render de la colección de productos

```
Problema:  TBT ~1735 ms, 20 long tasks, DOM de 4146 nodos, HTML de 976 KB.
Causa:     ProductShelf recorría `slice.map(...)` TRES veces: carrusel móvil
           (`sm:hidden`), grid tablet (`hidden sm:grid ... lg:hidden`) y grid
           desktop (`hidden lg:grid`). Los tres árboles existen simultáneamente
           en el DOM; dos se ocultan con CSS. Como ProductCard es 'use client',
           los 76 duplicados invisibles se hidrataban igual.
Archivo:   app/components/ProductShelf.tsx
Componente:ProductShelf (bloque de layout, antiguas líneas 146-214)
Impacto:   37 productos únicos -> 114 ProductCard montados (3,08x).
           66,7 % de la hidratación del home era trabajo puro desperdiciado.
Comprobado:Medición directa con Playwright en móvil (390px) y desktop (1440px):
           productCardRoots=114, uniqueProducts=37, cardsVisible=38,
           cardsHiddenByCss=76 — idéntico en ambos viewports.
           Confirmado en el HTML servido por producción (:3000), no solo local.
```

### Problema 2 — Recurso LCP sin prioridad

```
Problema:  LCP 4119 ms; PageSpeed marcaba "imagen LCP con lazy loading".
Causa:     El elemento LCP en móvil es la PRIMERA imagen de producto de la primera
           estantería. ProductShelf soporta `priorityFirstItems`, pero app/page.tsx
           pasaba `priorityFirstItems={0}` en TODAS las estanterías, así que ninguna
           imagen recibía priority. Además, en el código original el `priority` solo
           se pasaba en el mapa del carrusel móvil; los grids no lo pasaban nunca.
Archivo:   app/page.tsx (renderShelf / renderCategoryShelf)
Impacto:   LCP discovery: fetchpriority=high AUSENTE, eagerlyLoaded FALSO.
           Desglose: TTFB 32 ms | resource load delay 617 ms | load 38 ms | render 67 ms.
Comprobado:Auditoría `lcp-discovery-insight` de Lighthouse, score 0/1.
           Elemento identificado: <img alt="Set de Termo de Vacío 500ml con Tazas
           de Acero" loading="lazy"> en boundingRect {top:456, w:176, h:220}.
```

Nota: el hero **no contiene ninguna fotografía**. `circuit-bg` son gradientes CSS y el
logo ya venía con preload correcto. Por eso el LCP recae en la primera tarjeta.

### Problema 3 — `ProductCard` acoplado al estado del carrito

```
Problema:  INP de campo 249 ms. Cada acción del carrito re-renderizaba todas las
           tarjetas del home.
Causa:     CartContext.Provider recibía un OBJETO LITERAL inline como value, y
           addToCart/removeFromCart/updateQuantity/clearCart/getCartTotal/
           silentAddToCart/showNotification eran funciones recreadas en cada render.
           ProductCard hacía `const { addToCart } = useCart()` — solo necesita la
           acción — pero quedaba suscrito a TODO el estado: cart, isCartOpen,
           itemAdded, notification, announcement, isCartLoading.
Archivo:   context/CartContext.tsx (línea 468 original: `value={{ ... }}`)
           components/ProductCard.tsx (línea 48 original: `useCart()`)
Impacto:   Añadir un producto disparaba setCart + setItemAdded + openCart y, 500 ms
           después, setItemAdded(false). Cada uno re-renderizaba las 114 tarjetas.
Comprobado:Inspección de código + confirmación de que ProductCard no lee ningún
           campo de estado del carrito, solo invoca addToCart.
```

**Por qué `useMemo` NO era suficiente** (punto que el propietario señaló explícitamente,
y tenía razón): memoizar el value no arregla nada, porque el value *cambia
legítimamente* cuando cambia el estado. La corrección real es que **las tarjetas dejen
de depender del estado**: se expone un contexto separado solo con acciones de identidad
estable.

### Problema 4 — Meta Pixel en la ruta crítica

```
Problema:  105 KiB descargados y ~464 ms de hilo principal antes de la interactividad.
Causa:     El base code se inyecta con strategy="beforeInteractive" y el stub descarga
           fbevents.js inmediatamente — pese a arrancar con fbq('consent','revoke'),
           es decir, sin poder registrar NADA hasta que el usuario acepta cookies.
Archivo:   app/layout.tsx (<Script id="meta-pixel">)
Impacto:   fbevents.js comenzaba a descargar a los 390 ms.
Comprobado:Auditoría `bootup-time`: fbevents.js total=464 ms, scripting=363 ms.
           lib/meta-pixel.ts confirma que todo evento pasa por un gate de
           consentimiento (`getAnalyticsConsent() !== 'granted'` -> no-op).
```

---

## 4. Files Modified

### app/components/ProductShelf.tsx

**Motivo:** eliminar el triple render de la colección.

**Antes:** tres contenedores hermanos, cada uno con su propio `slice.map(...)`:
`sm:hidden` (carrusel), `hidden sm:grid ... lg:hidden` (tablet), `hidden lg:grid` (desktop).

**Después:** un único contenedor con un solo `slice.map(...)`; los breakpoints se
resuelven íntegramente con CSS:

```
flex gap-3 overflow-x-auto ... snap-x snap-mandatory scroll-px-4 px-4 pb-2
sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-x-visible sm:snap-none sm:px-0 sm:pb-0
md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6
```

y en el envoltorio de cada tarjeta:

```
flex-shrink-0 w-[44vw] min-w-[150px] max-w-[178px] snap-start
sm:w-auto sm:min-w-0 sm:max-w-none sm:flex-shrink
```

**Cambios:**
- Un único recorrido de `slice`, en lugar de tres.
- La tarjeta final "Ver todo" (que solo existía en el carrusel) lleva ahora `sm:hidden`.
- Se conserva `data-testid="product-shelf-carousel"` en el contenedor unificado para
  no romper `e2e/specs/mobile-smoke.spec.ts`, que hace scroll y comprueba el snap.
- `priority` pasa ahora a través de un único mapa, de modo que aplica en todos los
  breakpoints (antes solo lo recibía el carrusel móvil).

**Métrica afectada:** hidratación, TBT, JS execution, tamaño de DOM, peso de HTML.
**Riesgo:** Bajo.
**Validación:** geometría idéntica al píxel en 320/360/390/430/768/1024/1280/1440
(ancho y alto de tarjeta, tarjetas por fila, `display`, `gap`, `scroll-snap-type`,
`overflow-x` y altura total de página). Carrusel móvil sigue haciendo scroll (0→81 px).

### app/page.tsx

**Motivo:** dar prioridad al recurso LCP real, sin aplicarla indiscriminadamente.

**Cambios:**
- Nueva constante `LCP_PRIORITY_ITEMS = 2`.
- `renderShelf` y `renderCategoryShelf` aceptan `priorityFirstItems`.
- Se calcula `lcpShelfKey`: la clave de la **primera estantería que realmente pinta
  productos**. Solo esa recibe `LCP_PRIORITY_ITEMS`; el resto sigue en 0.
- Se refactorizó a descriptores (`builtInDescriptors` / `categoryDescriptors`) para
  determinar `lcpShelfKey` **sin mutar variables durante el render** — la primera
  implementación usaba un flag mutable y ESLint la rechazaba con
  `react-hooks/immutability: Cannot reassign variable after render completes`.

**Por qué 2 y no todas:** a 44vw en móvil se ven ~2,2 tarjetas; dos imágenes cubren el
elemento LCP sin abrir conexiones de más ni competir por ancho de banda.

**Métrica afectada:** LCP.
**Riesgo:** Bajo.
**Validación:** `lcp-discovery-insight` pasa de score 0 a **score 1**, con los tres
checks en verde (`priorityHinted`, `requestDiscoverable`, `eagerlyLoaded`).
*Resource load delay* 617 ms → **45 ms**.

### context/CartContext.tsx

**Motivo:** desacoplar las tarjetas del estado del carrito.

**Cambios:**
- Se estabilizan con `useCallback` las acciones que se recreaban en cada render:
  `showNotification`, `addToCart`, `silentAddToCart`, `removeFromCart`,
  `updateQuantity`, `clearCart`, `getCartTotal`.
- `getCartTotal` pasa a leer de `cartRef.current` en lugar de `cart`, para no depender
  del estado y mantener identidad estable.
- `dbRemoveItem` y `dbClearCart` se envuelven también en `useCallback` — sin esto,
  las acciones memoizadas capturaban versiones obsoletas (ESLint lo detectó como
  `react-hooks/exhaustive-deps`; era un riesgo real de stale closure que introduje yo).
- **Nuevo `CartActionsContext`** con un objeto `actions` memoizado, y el hook público
  `useCartActions()`.
- El provider envuelve ahora: `<CartActionsContext.Provider><CartContext.Provider>`.

`useCart()` **se conserva intacto** para los consumidores que sí necesitan estado
(`Navbar`, `CartDrawer`, `CartClient`, `CheckoutFlow`, `ReviewStep`, `WhatsAppCheckout`,
`AppContent`). No hay cambio de API para ellos.

**Métrica afectada:** INP, TBT, re-renders.
**Riesgo:** Bajo (aditivo; ninguna firma existente cambia).
**Validación:** 561 tests unitarios en verde; añadir al carrito, abrir y cerrar el
drawer y la persistencia siguen funcionando en pruebas con navegador real.

### components/ProductCard.tsx

**Motivo:** consumir solo acciones.
**Antes:** `import { useCart }` → `const { addToCart } = useCart();`
**Después:** `import { useCartActions }` → `const { addToCart } = useCartActions();`
**Métrica afectada:** re-renders, INP. **Riesgo:** Bajo.

### app/product/[slug]/ProductActions.tsx · app/wishlist/WishlistClient.tsx

**Motivo:** mismos consumidores solo-acciones (`addToCart`, `silentAddToCart`).
**Riesgo:** Bajo.

### app/layout.tsx

**Motivo:** sacar los 105 KiB del Meta Pixel de la ruta crítica sin perder eventos.

**Cambios:** el stub sigue definiendo `window.fbq` **de forma síncrona** (los eventos
se encolan en `n.queue`), pero la inserción de `<script src="fbevents.js">` se envuelve
en `requestIdleCallback(l, {timeout: 4000})`, con `setTimeout(l, 2500)` de reserva.
Cuando el SDK carga, vacía `n.queue` por sí mismo: **no se pierde ningún evento**.

**Métrica afectada:** TBT, JS execution, red en ruta crítica.
**Riesgo:** Bajo — el pixel no puede emitir nada antes del consentimiento (arranca en
`revoke` y `lib/meta-pixel.ts` bloquea toda llamada sin `granted`).
**Validación:** inicio de descarga de `fbevents.js` **390 ms → 1144 ms**.

### tests/product-card.test.tsx

**Motivo:** el mock de `@/context/CartContext` debía exponer el nuevo hook.
**Cambios:** se añade `useCartActions: () => ({ addToCart })`.
**Riesgo:** Ninguno (solo test).

---

## 5. Archivos creados / eliminados / dependencias

**Creados (código de la aplicación):** ninguno.
**Creados (documentación):** `docs/PERFORMANCE-AUDIT-AND-OPTIMIZATION.md` (este fichero).
**Eliminados:** ninguno.
**Dependencias añadidas / eliminadas / actualizadas en `package.json`:** **ninguna.**

`lighthouse` se instaló **solo dentro del worktree** con
`npm install --no-save --ignore-scripts lighthouse`. `--no-save` garantiza que
`package.json` y `package-lock.json` no se modifican: no llega nada a producción.

Nota: `@next/bundle-analyzer` (ya presente como devDependency) **no es compatible con
builds Turbopack** — el propio build lo advierte y no genera informe. El análisis se
hizo con datos reales de red y `bootup-time` de Lighthouse, que es más fiel que un
treemap estático.

---

## 6. Bundle Analysis

JS total transferido en `/`: **447 KiB antes y después.** El trabajo realizado **no
reduce bytes descargados**, reduce **trabajo de CPU**: se ejecuta el mismo código
muchas menos veces.

Coste de arranque por script (mediana, `bootup-time`):

| Script | Antes (total / scripting) | Después (total / scripting) |
|---|---:|---:|
| `0cnmh_hbsires.js` (chunk principal) | 2762 / **2475 ms** | 1711 / **1524 ms** |
| inline + raíz del documento | 2651 / 287 ms | 1737 / 114 ms |
| `1ofidn6p8nj3i.js` | 1015 / 225 ms | 1004 / 226 ms |
| `fbevents.js` (Meta, terceros) | 464 / 363 ms | 387 / 338 ms *(a los 1144 ms)* |

El chunk principal —que contiene React, los contextos y `ProductCard`— baja **951 ms
de scripting (−38,4 %)**. Ése es exactamente el coste de hidratar 76 tarjetas invisibles.

**JS no utilizado: 145 KiB antes y después.** No se abordó (ver sección 9).

---

## 7. Server / Client Component Optimization

Auditoría del boundary: **131 ficheros con `'use client'`** en total. En el home,
`ProductShelf`, `PromoBanners`, `DiscoverMosaic`, `CategoryRow`, `Benefits`,
`HomeFreeShippingStrip` y `Promotions` **ya eran Server Components** — trabajo previo
del proyecto, correcto.

**No se convirtió ningún componente cliente a servidor.** Concretamente **no** se
dividió `ProductCard` en cáscara servidor + islas cliente, pese a ser una de las
hipótesis de partida. Razones:

1. La causa dominante no era *que* `ProductCard` fuese cliente, sino que se montaba
   **tres veces**. Eliminando la duplicación se recupera el 66,7 % del coste sin tocar
   la arquitectura del componente.
2. `ProductCard` necesita de verdad estado cliente: `useWishlist` (estado del corazón
   por producto) y `useExchangeRate` (precio en Bs, que se refresca cada 15 min).
   Partirlo obligaría a 2-3 islas por tarjeta —38 tarjetas → >100 islas— con su propio
   coste de arranque, más props serializados por duplicado.
3. El principio de mantenibilidad que fijó el propietario: preferir la optimización
   simple que elimina el 80 % del problema antes que una compleja por un punto extra.

**Nueva isla cliente introducida:** ninguna. La mejora vino de *reducir suscripciones*
(`useCartActions`), no de crear islas.

---

## 8. Image Optimization

- **Imagen LCP:** primera imagen de producto de la primera estantería con productos.
  Ahora `priority` → `fetchpriority="high"`, sin `loading="lazy"`, con preload.
- **Estrategia de prioridad:** exactamente **2 imágenes** en toda la página reciben
  prioridad alta. Todas las demás siguen en `loading="lazy"`. Se rechazó
  explícitamente aplicar `priority` a todas las tarjetas.
- Recuento en el DOM: **117 → 41 imágenes** (−65 %), consecuencia directa de eliminar
  los duplicados. `loading="lazy"`: 116 → 38; las 3 restantes son las 2 prioritarias
  más el logo del hero (que ya tenía preload).
- **`sizes` sin cambios:** `(max-width: 640px) 44vw, (max-width: 1024px) 33vw,
  (max-width: 1280px) 25vw, 16vw` se auditó y es correcto para el nuevo layout —los
  breakpoints CSS no cambiaron, solo desapareció la duplicación.
- **`quality` sin cambios** (75 en tarjetas, 80 en el banner CTA). **No se degradó
  ninguna imagen.**
- Formato: WebP, según `next.config.mjs` (AVIF ya se había descartado por latencia).
- Verificación de integridad: **0 imágenes rotas** en home y en ficha de producto
  (`naturalWidth === 0` sobre 41 y 18 imágenes respectivamente).

---

## 9. Core Web Vitals Impact

### LCP

El cuello de botella **cambió de naturaleza**, que es la parte importante:

| Subfase | Antes | Después |
|---|---:|---:|
| Time to first byte | 32 ms | 53 ms |
| **Resource load delay** | **617 ms** | **45 ms** |
| Resource load duration | 38 ms | 63 ms |
| **Element render delay** | 67 ms | **532 ms** |

El descubrimiento del recurso está **resuelto** (`lcp-discovery-insight` 0 → 1). Lo que
ahora limita el LCP es el *render delay*: la imagen llega pronto pero no puede pintarse
porque el hilo principal sigue ocupado. Por eso el LCP total solo baja un 6-7 % pese a
eliminar 617 ms de retraso de red: **el LCP pasó a estar limitado por CPU, no por red.**
Es también la razón por la que seguir bajando TBT bajará el LCP directamente.

### INP

**No medible de forma fiable en este entorno** (INP es métrica de campo). Evidencia
indirecta:

- *Max Potential FID*: 1210 → 387 ms (serie A), 1028 → 564 ms (serie B).
- Latencia real de interacción del click "Añadir al carrito", medida con
  `PerformanceObserver({type:'event'})` en Chrome: **48–56 ms**.
- Causal: una acción de carrito ya no re-renderiza ninguna `ProductCard`. Antes
  re-renderizaba las 114.

Los datos CrUX seguirán mostrando ~249 ms durante un tiempo: **la ventana de CrUX es de
28 días**. Eso es esperado y no indica que la optimización no funcione.

### CLS

**0,000 en las 12 ejecuciones de Lighthouse**, antes y después. Se preservó porque:
- Todas las imágenes conservan `fill` con contenedor de ratio fijo (`aspect-[4/5]` /
  `sm:aspect-square`), así que reservan espacio igual que antes.
- La altura total de página es **idéntica al píxel** en los 8 breakpoints.
- No se introdujo ningún montaje diferido de contenido visible.

---

## 10. Before / After

```
ANTES  (mediana de 3, serie B, entorno corregido)
Performance:  59
FCP:          1199 ms
LCP:          4067 ms
TBT:          2022 ms
CLS:          0
Speed Index:  2137 ms
JS execution: 3714 ms
Main thread:  8259 ms

DESPUÉS (mediana de 3, serie B, entorno corregido)
Performance:  65
FCP:          955 ms
LCP:          3784 ms
TBT:          1148 ms
CLS:          0
Speed Index:  2376 ms   (ruido: rango 1670-2515 ms)
JS execution: 2861 ms
Main thread:  7345 ms
```

Ninguna cifra de este documento está inventada. Todas provienen de ficheros JSON de
Lighthouse o de mediciones con Playwright conservadas en el directorio de trabajo.

---

## 11. Testing

```
npx tsc --noEmit         -> PASS (0 errores)
npx eslint .             -> PASS (0 errores, 34 warnings preexistentes)
npx vitest run           -> PASS (561 tests, 55 ficheros)
npx next build           -> PASS (exit 0)
```

**Errores encontrados durante el trabajo y su resolución:**

1. `react-hooks/immutability` en `app/page.tsx`: la primera versión asignaba un flag
   mutable durante el render. **Resuelto** refactorizando a descriptores y calculando
   `lcpShelfKey` de forma declarativa.
2. `react-hooks/exhaustive-deps` (×3) en `context/CartContext.tsx`: al memoizar las
   acciones capturé versiones obsoletas de `dbUpsertItem` / `dbRemoveItem` /
   `dbClearCart`. Riesgo real de stale closure introducido por mí. **Resuelto**
   estabilizando también esos helpers y declarándolos como dependencias.
3. 8 tests de `tests/product-card.test.tsx` fallando con
   `No "useCartActions" export is defined on the mock`. **Resuelto** añadiendo el hook
   al mock.

---

## 12. Regression Checklist

Solo se marca lo verificado de verdad, con navegador real contra el build de producción
del worktree.

```
[x] Home                — 4 estanterías, 38 tarjetas, 0 imágenes rotas
[x] Product cards       — imagen, precio USD/Bs, badges, stock, rating, envío gratis
[x] Product page        — navegación desde tarjeta, h1 correcto, 7 CTAs, 18 imágenes OK
[x] Cart                — añadir, feedback "¡En el carrito!", drawer abre y cierra,
                          persistencia en localStorage
[x] Wishlist            — alterna "Agregar a favoritos" <-> "Quitar de favoritos"
[x] Mobile navigation   — carrusel con scroll y snap (scrollLeft 0 -> 81)
[x] Responsive          — 320/360/390/430/768/1024/1280/1440 idénticos al píxel
[x] Images              — 0 rotas en home y ficha de producto
[x] Header              — renderiza en todas las rutas probadas (200)
[ ] Checkout            — la página responde 200; NO se completó ningún pedido a
                          propósito (evitar efectos reales). Sin verificar: métodos de
                          pago, cálculo de envío, retiro, conversión de moneda.
[ ] SEO                 — no re-auditado. Los cambios no tocan metadata, JSON-LD,
                          canonical, sitemap ni robots; el marcado semántico
                          (h2/h3, alt, enlaces) es idéntico.
[ ] Accessibility       — no re-auditado con axe. Se preservaron aria-labels, roles,
                          región aria-live y targets táctiles de 44 px.
[ ] Admin panel         — no probado. Ningún fichero de /admin fue modificado.
```

---

## 13. Bug independiente corregido — bloque de métodos de pago duplicado y roto

> **No es una optimización de Core Web Vitals.** Es un bug de producto preexistente,
> descubierto durante la auditoría y corregido por separado (commit `e5655f6`).

### Lo que realmente ocurría

La hipótesis inicial era "faltan seis imágenes". La causa real resultó ser peor: la
ficha de producto renderizaba **DOS bloques de métodos de pago**.

| Línea | Componente | Estado |
|---|---|---|
| 419 | `PaymentMethods` | Server Component correcto. Chips de texto con icono, alimentados por `seo.paymentAccepted` (configurable en `/admin/settings/seo-local`). Rótulo "Pagas como quieras". |
| 469 | `PaymentLogos` | Client Component que pedía seis PNG de `/payments/*`. Rótulo "Métodos de pago". |

`public/payments/` **no existe y nunca estuvo versionado en git**. Cada visita a una
ficha lanzaba **18 peticiones fallidas** (6 logos × `src` + `srcSet` 1x/2x) y las
registraba como error en el log del servidor:

```
⨯ The requested resource isn't a valid image for /payments/zelle.png received null
```

Como `PaymentLogoItem` ocultaba cada logo con `onError`, el resultado visible era un
encabezado **"MÉTODOS DE PAGO" sobre una fila vacía**, justo debajo de un bloque que
sí funcionaba. Es decir: información duplicada, de la cual una copia estaba rota y era
invisible.

### Corrección aplicada

- **Eliminado** `app/product/[slug]/PaymentLogos.tsx` y su uso en `page.tsx`
  (2 líneas: el import y `<PaymentLogos />`).
- `PaymentMethods` queda como **única fuente de verdad**. Ya era Server Component,
  no usa JavaScript de cliente, y su lista la controla el admin.
- Se añadió soporte de **Zelle** y **Cashea** en `STATIC_METHODS` y en
  `mapPaymentLabel`, para que rendericen con el mismo diseño de chip (iconos `Send`
  y `CreditCard`) en cuanto el admin los añada.

**No se crearon imágenes, placeholders ni imitaciones de logotipos. No se modificó
ningún dato.**

### Por qué NO se añadió un segundo bloque de chips

La instrucción original pedía sustituir los logos rotos por chips de texto. Al
descubrir que ya existía un bloque de chips funcional 50 líneas más arriba, añadir
otro habría **duplicado la información de pago** en la misma pantalla. La corrección
correcta era eliminar el duplicado roto.

### Nota sobre qué métodos se muestran

El bloque superviviente muestra hoy **4 chips** — Efectivo USD/Bs, Transferencia,
Pago Móvil, Binance — porque eso es lo que contiene `seo.paymentAccepted` en la base
de datos. **Zelle y Cashea no aparecerán hasta que se añadan desde
`/admin/settings/seo-local`.**

Esto NO es una pérdida de información visible: antes de esta corrección, Zelle y
Cashea solo existían como texto `alt` de imágenes rotas que **nunca se pintaban**.
El código ya está preparado; falta únicamente el dato, que es una decisión del
propietario y no una modificación que corresponda hacer desde una auditoría.

### Verificación (móvil 390px y desktop 1440px)

| Comprobación | Resultado |
|---|---|
| Peticiones a `/payments/*` | **0** |
| 404 / 400 relacionados | **0** |
| Errores de `next/image` | **0** |
| Imágenes rotas en la ficha | **0** |
| Errores de consola | **0** |
| Bloque visible y renderizado | **Sí** |
| CLS introducido | **0.0000** (móvil) |
| Nodos DOM de la ficha | 777 |

### Impacto en rendimiento — A/B pareado (`0b3e4e7` vs `e5655f6`)

Medido back-to-back en la misma máquina para que la deriva afectara por igual:

| Métrica | A (solo perf) | B (perf + fix) | Δ |
|---|---:|---:|---|
| Performance | 63 | 64 | +1 |
| LCP | 3996 ms | 3712 ms | −284 ms |
| TBT | 1249 ms | 1307 ms | +58 ms (ruido) |
| CLS | 0 | 0 | = |
| Long tasks | 20 | 18 | −2 |
| Long tasks (total) | 3273 ms | 3158 ms | −115 ms |
| JS transferido | 447,2 KiB | 446,9 KiB | −0,3 KiB |

**Sin regresión.** Las diferencias caben dentro del ruido de la máquina: las tres
ejecuciones de la propia rama A dieron TBT de 1108, 1249 y 1905 ms.

---

## 13.b Validaciones de cierre (post-optimización)

### Checkout — PASS (sin crear ningún pedido)

Verificado en móvil (390px) y desktop (1440px), con carrito anónimo sembrado desde el
home (solo `localStorage`, cero escrituras en BD). **Nunca se pulsó "Realizar compra".**

| Comprobación | Resultado |
|---|---|
| Carga de `/checkout` | 200, `h1` = "MundoTech — Pedido por WhatsApp" |
| Campos de formulario | 9 inputs / 8 labels / 4 radios |
| Métodos de pago presentes | Pago Móvil, Zelle, Binance, Efectivo, Transferencia, Cashea |
| Envío / retiro | ambos presentes |
| Transportistas | MRW, Zoom, Tealca |
| Selección de sede | presente (retiro en tienda) |
| Selección de los 4 métodos de envío | `tienda`, `mrw`, `zoom`, `tealca` — todos seleccionables sin error |
| Precios | USD (`$10.00`) y Bs (`Bs. 7.913,25`) coherentes con la tasa |
| Total | presente |
| Overflow horizontal | **ninguno** en móvil ni desktop |
| Errores 4xx/5xx | **0** |
| Errores de consola | **0** |

*Instalación:* no aparece en este flujo con el producto de prueba; el servicio de
instalación es condicional por producto y no se pudo ejercitar sin elegir un artículo
que lo ofrezca. Queda **sin verificar**.

### Admin — PASS (read-only, con limitación declarada)

| Ruta | Resultado |
|---|---|
| `/admin`, `/admin/products`, `/admin/orders`, `/admin/settings`, `/admin/stats`, `/admin/banners`, `/admin/categories`, `/admin/home-manager` | **307 → `/login`** |

El guard de autenticación funciona en todas; **ningún 500**. `git diff` confirma que
**no se modificó ni un solo fichero de `/admin`, `components/admin` o `/api/admin`**.

**Limitación honesta:** sin credenciales no se pudo renderizar el interior del panel.
Crear un usuario administrador habría sido una mutación de datos, expresamente
prohibida. Lo verificado es: routing, guard de auth, compilación en el build de
producción y ausencia de cambios en ficheros de admin. **El render interno del panel
queda sin verificar.**

### SEO — PASS

| Elemento | Home | Ficha de producto |
|---|---|---|
| `<title>` | "MundoTech Barquisimeto \| Tecnología, gadgets y variedades" | "Set de Termo… \| MundoTech" (plantilla aplicada) |
| `description` | presente | presente |
| `canonical` | `https://mundotechve.com` | `https://mundotechve.com/product/<slug>` |
| `robots` | `index, follow` | `index, follow` |
| Open Graph | 7 tags | 6 tags |
| JSON-LD | 3 bloques: WebSite, LocalBusiness, Organization | 6 bloques: + Product, BreadcrumbList, FAQPage |

`robots.txt` correcto (`/admin`, `/api`, `/checkout`, `/account`, `/cart`, `/wishlist`
en Disallow; GPTBot bloqueado). `sitemap.xml`: **259 URLs**.

Lighthouse SEO: **100** en home y en ficha de producto.
**Ningún fichero de metadata, JSON-LD, sitemap o robots fue modificado.**

### Accesibilidad — PASS (sin regresión)

axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`), viewport móvil:

| Página | Violaciones |
|---|---|
| Home | **0** |
| /productos | **0** |
| /cart | **0** |
| /checkout | **0** |
| /login | **0** |
| Ficha de producto | 1 (`color-contrast`, 2 nodos) |

Lighthouse por categoría: **home a11y 100 / SEO 100 / Best Practices 100** — idéntico
al baseline que aportó el propietario. Ficha de producto: a11y 97.

Las dos violaciones de contraste son **preexistentes y ajenas a este trabajo**, en
`app/product/[slug]/page.tsx`:

- línea 397 — `text-slate-400 line-through` sobre el precio tachado (contraste 2,56)
- línea 402 — `bg-rose-50 text-rose-600` en la píldora "Ahorra 23%" (contraste 4,27)

El `git diff` de ese fichero son **exactamente dos líneas eliminadas** (el import y el
uso de `PaymentLogos`); las líneas 397 y 402 no se tocaron. Solo aparecen en productos
con descuento, razón por la que el baseline de "Accessibility 100" —medido sobre el
home— nunca las detectó. **No se corrigieron**: cambiar esos colores altera la
identidad visual y requiere aprobación. Anotadas en Future Optimization Opportunities.

## 14. Future Optimization Opportunities

### 14.1 JavaScript no utilizado — 145 KiB

**Beneficio:** potencialmente alto (TBT y LCP siguen limitados por CPU).
**Dificultad:** alta. **Riesgo:** medio.
**Recomendación:** analizar con `next experimental-analyze` (el analizador clásico no
sirve con Turbopack). El sospechoso principal es el chunk compartido que arrastra
`next-auth`, los cuatro providers globales y `framer-motion` a todas las rutas. No se
tocó porque exige entender bien qué necesita cada provider en el arranque.

### 14.2 `ExchangeRateContext` — `value` inline

**Beneficio:** bajo. **Dificultad:** trivial. **Riesgo:** bajo.
`<ExchangeRateContext.Provider value={{ rate, loading, stale }}>` crea objeto nuevo en
cada render, pero el provider **solo** re-renderiza cuando cambian esos tres valores,
así que el desperdicio real se limita a los cambios de `loading` (dos renders extra por
refresco, cada 15 min). **Deliberadamente no tocado:** el impacto medible es
despreciable y el propietario pidió no añadir memoización sin justificación.

### 14.3 `WishlistContext` — re-render global al marcar favorito

**Beneficio:** medio (INP en la acción de favoritos). **Dificultad:** media.
El value está memoizado sobre `[wishlist, isWishlistLoading]`, así que alternar un
favorito re-renderiza las 38 tarjetas. Se arreglaría igual que el carrito: contexto de
acciones + suscripción por producto. No se hizo porque marcar favoritos es mucho menos
frecuente que añadir al carrito, y ya se redujo el coste de 114 a 38 tarjetas.

### 14.4 `ProductContext` — `value` sin memoizar

**Beneficio:** medio en catálogo/búsqueda. **Dificultad:** baja.
El value es un objeto literal sin memoizar, así que cada cambio de `searchTerm` /
`filterCategory` re-renderiza a todos los consumidores. **No afecta al home**
(`ProductCard` no lo consume). Debería auditarse junto con `/productos` y `/buscar`.

### 14.5 Forced reflow — 85 ms

**Beneficio:** bajo. **Dificultad:** desconocida.
Lighthouse sigue reportando `forced-reflow-insight` con score 0, pero atribuye el
tiempo a **`[unattributed]`**: no señala fichero ni función. Sin una causa identificada
no se tocó nada — corregir a ciegas contradice el principio de no trabajar por
adivinación. Requiere un perfilado manual con la pestaña Performance de DevTools.

### 14.5.b Contraste en la ficha de producto (WCAG AA)

**Beneficio:** accesibilidad (a11y 97 → 100 en fichas con descuento).
**Dificultad:** trivial. **Riesgo:** visual — cambia colores de marca.
`text-slate-400` → `text-slate-500` en el precio tachado y `text-rose-600` →
`text-rose-700` en la píldora de descuento bastarían. **Requiere aprobación** por ser
un cambio de diseño. Preexistente, no introducido por esta auditoría.

### 14.6 Legacy JavaScript — 12 KiB

**Beneficio:** bajo. **Riesgo:** medio.
`next.config.mjs` ya sustituye `polyfill-module` por un stub. Los 12 KiB restantes
salen de transpilación dentro de dependencias. Poco margen sin tocar `browserslist`.

### 14.7 Política de caché — 93 KiB

**Sin acción posible.** El único recurso señalado es
`https://connect.facebook.net/en_US/fbevents.js`, servido por Meta con 20 min de caché.
No es controlable desde este servidor. Los ~102 KiB que reportaba PageSpeed son, en la
práctica, el Meta Pixel — que ahora al menos se descarga en tiempo ocioso.

### 14.8 TTFB

**Sin acción.** Localmente el home responde en **16-53 ms** con `x-nextjs-cache: HIT`
e ISR (`s-maxage=300`). Los ~0,8 s de TTFB de campo son latencia de red hacia Venezuela,
no tiempo de servidor. La mejora estaría en un CDN por delante del origen —decisión de
infraestructura, fuera del alcance de este trabajo.

---

## 15. Estado del despliegue

**Nada de este trabajo está en producción.** Todos los cambios viven en la rama
`perf/audit-2026-08` dentro de `/home/deploy/mundotech-audit`.

Producción sigue sirviendo el build restaurado `dAGvg1PHxviK0xkhBQ9AE` (código
`fa7e71d`, 20-ago), que es **un commit anterior a `0d05152`** por el incidente de la
sección 0.

Para desplegar:

```bash
npm run deploy:vps
```

y solo después de verificar los cambios. Esto además devolvería a producción el código
de `0d05152` (rotación de estanterías del home y mejoras del panel admin), hoy ausente.
