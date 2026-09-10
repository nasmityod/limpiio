# Auditoría de rendimiento, escalabilidad y carga de archivos del Panel Admin

**Fecha:** 26 de agosto de 2026
**Ámbito:** `/admin/**`, `app/actions/*`, `app/api/admin/**`, `components/admin/*`, `prisma/schema.prisma`
**Estado del repositorio al auditar:** commit `fa7e71d` (`main`)

---

## Resumen ejecutivo

El Panel Admin de mundotech se degradaba de forma **lineal con el tamaño del
catálogo** porque su pantalla central —Inventario— estaba construida sobre una
premisa que dejó de ser cierta al crecer la tienda: *«descarga todo el catálogo y
filtra/pinta en el navegador»*.

Concretamente, `getProductsAdmin()` ejecutaba un `prisma.product.findMany()`
**sin `take`, sin `skip` y sin cursor**, con un `select` que incluía todos los
campos de edición (`description`, `specs`, `media`, `cost`, `profitMarginPct`).
Cada vez que el operador entraba a Inventario, escribía una letra en el buscador,
cambiaba un filtro, guardaba un producto, editaba un stock o eliminaba un
artículo, viajaba **el inventario completo** desde PostgreSQL hasta el navegador.
Medido sobre un dataset de 5 000 productos: **6,43 MB de JSON y ~186 ms de
consulta, por interacción.**

Sobre eso se acumulaban tres multiplicadores más:

1. **`DataTable` renderizaba dos veces cada registro**: construía el árbol de
   cards móviles *y* el de la tabla de escritorio, y escondía uno con Tailwind
   (`md:hidden` / `hidden md:block`). Ocultar por CSS no evita que React
   construya el árbol ni que el navegador cree los nodos. Con 500 filas eran
   **17 012 nodos DOM** en lugar de 5 511.
2. **Las categorías se recalculaban con cada búsqueda**: la misma acción que
   traía los productos ejecutaba además `category.findMany()` y
   `product.findMany({ distinct: ['category'] })`.
3. **La búsqueda `contains` + `mode: 'insensitive'`** se traduce a
   `ILIKE '%texto%'`, patrón que ningún B-tree puede servir: el plan era **Seq
   Scan siempre**, y `Product` sólo tenía índices por `category` e `isActive`
   —ni siquiera por `createdAt`, que es la columna de ordenación del listado.

El mismo patrón «traer todo y calcular en Node» aparecía en otras cuatro
pantallas: el Dashboard descargaba **todos los pedidos validados** para sumar
tres números; Estadísticas descargaba **el mapa de costes de todo el catálogo**
para usar 20 valores (y lo repetía al cambiar de período); Reseñas pedía hasta
**300 reseñas completas** sin paginar; y Usuarios renderizaba **la tabla `User`
entera**, clientes incluidos, con un `COUNT` de pedidos por fila.

En paralelo, el bug de las imágenes tenía una causa distinta de la que sugería el
síntoma. **Nunca hubo un límite de 5 MB sobre la suma de la selección**: el
límite era y sigue siendo por archivo. Lo que fallaba es que `AddProductModal`
era el único punto del panel que **no usaba `normalizeImageForUpload()`**
—subía el `File` original sin convertir HEIC ni comprimir— y que su bucle hacía
`alert()` + `break` al primer error, así que una sola foto de cámara por encima
de 5 MB abortaba el resto de la selección. Desde fuera se percibía exactamente
como «si juntas pasan de 5 MB, falla».

Todo lo anterior está corregido. El resultado medido con 5 000 productos:

| | Antes | Después |
|---|---|---|
| Productos recibidos al abrir Inventario | 5 000 | 30 |
| Payload de la primera carga | 6,43 MB | 9,47 KB |
| Tiempo de consulta | 186,4 ms | 10,6 ms |
| Nodos DOM con 500 registros | 17 012 | 341 (página de 30) |
| Búsqueda de un término poco frecuente | 20,49 ms (Seq Scan) | 0,32 ms (índice GIN) |
| Ingresos del dashboard (20 000 pedidos) | 491 KB / 570 ms | 73 bytes / 25 ms |

Y, lo más importante: **el coste de la primera carga ya no depende del total de
productos existentes.** Con 100, 1 000 o 5 000 productos el navegador recibe
siempre ~9,4 KB y 30 filas.

---

## Síntomas reproducidos

| Síntoma reportado | Reproducción |
|---|---|
| «Entrar a Inventario se siente lento» | Confirmado. Con 5 000 productos la Server Action tarda 186 ms en Postgres y devuelve 6,43 MB que React debe deserializar y montar. |
| «Hacer clic en elementos tarda varios segundos» | Confirmado. Tras **cualquier** operación (guardar, eliminar, reactivar, editar stock/precio) se llamaba a `loadProducts()`, que repetía la descarga completa. |
| «Empeora cuanto más productos existen» | Confirmado y cuantificado: el payload crece linealmente — 127 KB con 100 productos, 1,29 MB con 1 000, 6,43 MB con 5 000. |
| «Determinadas interacciones dejan de sentirse inmediatas» | Confirmado. Cada pulsación del buscador (tras el debounce de 300 ms) reemplazaba la tabla por un esqueleto completo y volvía a montar todas las filas. |
| «Varias imágenes que juntas pasan de ~5 MB dan error» | Reproducido, con causa distinta: fallo **por archivo** + `break` que cancelaba el resto. Ver RC‑06. |

Reproducción a escala: `scripts/perf-seed.mjs` siembra una base de pruebas
dedicada (100 / 1 000 / 5 000 productos, pedidos y reseñas) y
`scripts/verify-admin-inventory-scale.mts` mide la carga real del listado.

---

## Root causes

### RC-01 — Inventario descargaba TODOS los productos en cada interacción

**Dónde:** `app/actions/productActions.ts`, `getProductsAdmin()` — antes L973‑L1056.

```ts
const products = await prisma.product.findMany({
  where,
  orderBy: { createdAt: 'desc' },
  select: PRODUCT_ADMIN_SELECT,
});
```

Sin `take`, sin `skip`, sin cursor. La página cliente
(`app/admin/products/page.tsx`) llamaba a esta acción desde `loadProducts()` en
el montaje, en cada cambio de filtro, en cada búsqueda con debounce y después de
cada operación de escritura.

**Por qué empeoraba con el crecimiento:** el coste (bytes transferidos, tiempo de
serialización de Prisma, tiempo de deserialización en React, nodos DOM) es
estrictamente proporcional al número total de productos, no al número de
productos que el operador está mirando.

**Corrección:** paginación **keyset (cursor)** sobre `("createdAt" DESC, id DESC)`
en `lib/products/admin-product-query.ts`, con `pageSize` de 30. No se usa
`OFFSET`: el coste de la página N no crece con N y el orden es estable aunque se
creen productos mientras se navega. Los contadores del encabezado (total, stock
bajo, agotados) pasan a calcularse con agregados en PostgreSQL
(`COUNT(*) FILTER (…)`) en lugar de con `products.filter(...)` en el navegador.

### RC-02 — El DTO del listado traía los datos de edición de todos los productos

**Dónde:** `lib/product-select.ts`, `PRODUCT_ADMIN_SELECT`.

Incluía `description`, `specs`, `media` (relación completa, ordenada), `cost`,
`profitMarginPct`, `originalPrice`, `images` (array completo)… es decir, todo lo
que necesita el **modal de edición**, para **todas las filas del listado**. Una
fila de tabla sólo pinta nombre, SKU, categoría, precio, stock, marca, dos badges
y una miniatura.

Sobre 5 000 productos: 4,50 MB de productos + 1,92 MB de `ProductMedia`.

**Corrección:**

* `PRODUCT_ADMIN_SELECT` pasa a llamarse `PRODUCT_ADMIN_DETAIL_SELECT` y **sólo
  se usa para un producto concreto**, vía `getAdminProductById(id)` (se conserva
  el nombre antiguo como alias `@deprecated` para no romper importaciones).
* El listado usa `AdminProductListItem`, un DTO de fila que además resuelve la
  miniatura en servidor (`image: string`) en lugar de enviar el array `images`.
* Al pulsar «Editar», el modal se abre **al instante** con un esqueleto encima
  del formulario (`detailLoading`) mientras llega el detalle. Al cerrarlo se
  liberan `editingProduct`, `detailLoading` y `detailError`.

### RC-03 — DataTable renderizaba móvil y escritorio simultáneamente

**Dónde:** `components/admin/DataTable.tsx` — antes L60‑L266.

Había **dos** `data.map(...)`: uno dentro de `<ul className="md:hidden">` y otro
dentro de `<div className="hidden md:block">`. Tailwind aplica `display:none`,
pero React construye ambos árboles y el navegador crea ambos conjuntos de nodos,
listeners y closures.

Además, por cada fila se ejecutaba `selectedIds.includes(id)` —O(n) por fila,
**O(n²) por render**— y se recalculaban `mobileColumns.find(c => c.primary)`,
`.find(c => c.secondary)` y `.filter(...)`, tres recorridos idénticos por fila.

**Corrección:** una sola representación, elegida con el hook nuevo
`useIsDesktop()` (`hooks/useIsDesktop.ts`). Usa `useSyncExternalStore` con
`getServerSnapshot` —la forma soportada por React de leer un valor que difiere
entre servidor y cliente—, así que hidrata con el valor de servidor
(mobile‑first, igual que el CSS) y re‑renderiza inmediatamente después: **sin
desajustes de hidratación**. Un único `MediaQueryList` compartido a nivel de
módulo evita registrar N listeners cuando hay varias tablas en pantalla.
`selectedIds` se convierte a `Set` (O(1) por fila) y el reparto
primary/secondary/otros se memoiza una vez por columnas, no por fila.

El aspecto visual es idéntico: mismas clases, mismos breakpoints.

### RC-04 — Las categorías se recalculaban con cada búsqueda del inventario

**Dónde:** `app/actions/productActions.ts`, dentro del mismo `getProductsAdmin()`.

```ts
const [categoryRows, productCategoryRows] = await Promise.all([
  prisma.category.findMany({ … }),
  prisma.product.findMany({ distinct: ['category'], select: { category: true } }),
]);
```

Las categorías cambian cuando se crea/edita/borra un producto o una categoría —
del orden de varias veces al día. Las búsquedas del inventario ocurren varias
veces por minuto. Estaban acopladas.

**Corrección:** `lib/categories/admin-categories.ts` con `unstable_cache`
etiquetado con `categories`, tag que **ya emitían** todas las mutaciones
relevantes (`createProductAction`, `updateProductAction`, `deleteProductAction`,
`setProductActiveAction`, `importProductsFromCSV`, CRUD de `/api/categories`).
La lógica de mezcla y dedupe (registros de `Category` + huérfanas de
`Product.category`) se conserva **literalmente**. La página la pide una vez al
montar y tras guardar, no en cada carga de productos.

### RC-05 — `ILIKE '%texto%'` sin índice utilizable + `Product` sin índice por `createdAt`

**Dónde:** `getProductsAdmin()` (`contains` + `mode: 'insensitive'`) y
`prisma/schema.prisma` (`Product` tenía sólo `@@index([category])` y
`@@index([isActive])`).

El listado ordena **siempre** por `createdAt DESC` y no había índice por esa
columna: el plan era `Seq Scan` + `top-N heapsort` de todo el catálogo, incluso
para pedir 30 filas. Y la búsqueda con comodín inicial no puede usar un B-tree.

Planes reales medidos sobre 5 000 productos en la sección «Evidencia».

**Corrección:** migración `20260826120000_add_admin_performance_indexes` con
cinco índices en `Product` y uno en `Review`, todos justificados con
`EXPLAIN (ANALYZE, BUFFERS)` sobre las consultas reales. La búsqueda se reescribe
sobre la expresión normalizada que indexa un GIN `pg_trgm`, misma técnica que ya
usaba el catálogo público.

### RC-06 — Multiupload de imágenes: sin normalización y con aborto en cascada

**Dónde:** `app/components/AddProductModal.tsx`, `uploadFilesViaApi()` — antes
L431‑L460 — y `app/api/upload/route.ts` (`MAX_BYTES = 5 MB`, antes L11).

```ts
for (const file of list) {
  const fd = new FormData();
  fd.append('file', file);          // ← el File ORIGINAL, sin normalizar
  …
  if (!res.ok || !data.url) {
    alert(data.error ?? 'No se pudo subir una de las imágenes.');
    break;                          // ← cancela TODA la selección restante
  }
}
```

Tres defectos encadenados:

1. **No usaba `normalizeImageForUpload()`**, el helper que sí usan
   `PhotoUploader` y el checkout. Por tanto: sin conversión HEIC→JPEG (una foto
   de iPhone se rechazaba con 415 aunque el input declare `accept="image/*"`),
   sin corrección de orientación y **sin compresión**: una foto de cámara de
   8 MB se enviaba tal cual contra un límite de 5 MB.
2. **Aborto en cascada:** un `break` al primer fallo. Seleccionar 4 fotos donde
   la segunda pesa 7 MB subía sólo la primera.
3. **Bucle estrictamente secuencial**, lo que en móvil (latencia alta) hacía la
   operación innecesariamente lenta.

**El límite nunca fue agregado.** No existía —ni existe— ninguna suma de
`files.size` en el cliente ni en el servidor. El síntoma «si juntas pasan de
5 MB falla» era la consecuencia observable de (1) + (2).

**Corrección:** ver la sección «Imágenes».

### RC-07 — El Dashboard descargaba todos los pedidos validados para sumar tres números

**Dónde:** `app/actions/adminDashboardActions.ts` — antes L111‑L149.

```ts
prisma.order.findMany({
  where:  { status: { in: [...VALIDATED_REVENUE_STATUSES] } },
  select: { total: true, exchangeRateUsdBs: true },
})
```

…y a continuación un bucle en Node que produce `revenueUsd`, `revenueBs` y
`hasLegacyUsdRevenue`. Con 20 000 pedidos ya son 10 103 filas y 491 KB movidos
desde Postgres en cada carga del dashboard. El propio archivo documentaba haber
cerrado un OOM por este mismo patrón (PRD‑195/225); quedaba esta consulta.

En la misma acción, `prisma.product.findMany({ distinct: ['category'] })` traía
una fila por categoría sólo para hacer `.length`.

**Corrección:** una sola fila agregada en PostgreSQL, preservando la semántica al
detalle (ver «Antes vs después» y `tests/admin-dashboard-revenue.test.ts`), y
`COUNT(DISTINCT category)` para el contador de categorías.

### RC-08 — Estadísticas descargaba los costes de TODO el catálogo

**Dónde:** `app/api/admin/product-costs/route.ts` (antes L7‑L21) y
`app/admin/stats/page.tsx` (antes L53‑L88).

```ts
const products = await prisma.product.findMany({ select: { id: true, cost: true } });
```

El endpoint devolvía el mapa de costes completo. La página lo usa **sólo** para
calcular la ganancia estimada de los `topProducts`, que el propio
`/api/admin/stats` limita a **20**. Con 5 000 productos se enviaban 254 KB para
usar 20 valores; con 20 000 serían ~1 MB. Además, `cost` está marcado en el
esquema como dato sensible del negocio.

Agravante: el `useEffect` que lo pedía dependía de `[period]`, así que cambiar de
7 d a 30 d a 90 d volvía a descargar el mapa entero **y** el ranking de «más
vistos», que tampoco depende del período.

**Corrección:** el endpoint exige `?ids=` (máx. 50) y devuelve sólo esos costes.
La página pide los costes de los `topProducts` ya cargados, y los tres `fetch` se
separan en efectos con las dependencias correctas y `AbortController` (una
respuesta de un período anterior ya no puede pisar la del período actual).

### RC-09 — Reseñas: la UI no paginaba aunque el endpoint sí sabía hacerlo

**Dónde:** `app/admin/reviews/page.tsx` (antes L42‑L56) y `app/api/reviews/route.ts`.

```ts
const res = await fetch(`/api/reviews?status=${tab}`);
```

Sin `page` ni `pageSize`. El endpoint, sin esos parámetros, devolvía **hasta 300
reseñas completas** (texto, fotos, nombre del producto). Y esas 300 filas se
renderizaban de golpe — duplicadas, por RC‑03.

**Corrección:** la UI pagina de 25 en 25 con navegación Anterior/Siguiente, y el
default del endpoint sin parámetros baja de 300 a 50 para que ninguna llamada
futura vuelva a arrastrar cientos de filas por descuido. **Los contadores de
pendientes / aprobadas / rechazadas siguen saliendo de un `groupBy` sobre TODAS
las reseñas**, no de la página visible.

### RC-10 — Usuarios renderizaba la tabla `User` completa, con un COUNT por fila

**Dónde:** `app/actions/userActions.ts`, `listAdminUsers()` — antes L67‑L94.

```ts
const rows = await prisma.user.findMany({
  orderBy: [...],
  select: { …, _count: { select: { orders: true } } },
});
```

Sin `where`, sin `take`. Devuelve **todos** los usuarios —clientes incluidos—,
cada uno con una subconsulta `COUNT` de sus pedidos, y
`app/admin/settings/users/page.tsx` lo renderizaba entero desde el servidor. Es
la pantalla del panel que peor escala con el crecimiento del negocio: 50 000
pedidos implican decenas de miles de clientes, es decir decenas de miles de filas
con PII y decenas de miles de subconsultas por visita.

**Corrección:** `listAdminUsers({ search, page, pageSize, onlyStaff })` con página
de 25, búsqueda por nombre/email y filtro «Solo personal» (superadmin, rol admin
o con permisos). El conteo de pedidos se conserva pero se calcula sólo para las
25 filas visibles. La página sigue renderizando la primera página en servidor; el
resto se navega desde el cliente.

### RC-11 — El recálculo masivo de precios no cabía en una transacción

**Dónde:** `app/actions/productActions.ts`, `recalculateAllProductPrices()`.

Acumulaba **un `prisma.product.update` por producto** y los pasaba todos a
`prisma.$transaction([...])`. Traer todos los productos aquí es correcto —la
operación es explícitamente masiva por naturaleza— pero 10 000 sentencias en una
sola transacción agotan el timeout por defecto de Prisma y mantienen bloqueadas
las filas durante todo el proceso.

**Corrección:** las escrituras se agrupan en sentencias
`UPDATE … FROM (VALUES …)` por lotes de 500, dentro de la misma transacción
interactiva y con timeout explícito. **Se conserva la atomicidad todo‑o‑nada** que
exigía RUN‑04. Medido sobre 5 000 productos: 1 258 ms frente a ~22 s extrapolados
del método anterior (2 241 ms por cada 500 filas), y con verificación fila a fila
de que precio, `originalPrice` (incluidos los nulos) y `priceBaseFactor` quedan
exactamente donde debían: 5 000 correctas, 0 incorrectas.

### RC-12 — Facetas del catálogo público: DISTINCT en JavaScript

**Dónde:** `lib/products/query-products.ts`, `queryCatalogProducts()`.

```sql
SELECT category, brand FROM "Product" WHERE …
```

…y después `extractFacets()` deduplicaba en JS con `new Set(...)`. Es decir: se
traía **una fila por producto** que cumpliera el filtro para construir dos listas
de unas decenas de valores. No es una pantalla admin, pero es el mismo defecto de
diseño y crece con el catálogo: 3 758 filas / 161 KB por carga de `/productos`
con 5 000 productos activos.

**Corrección:** `SELECT DISTINCT category, brand`. Resultado idéntico
(comprobado), 80 filas / 3,4 KB. **47× menos transferencia.**

### RC-13 — Listado de cupones sin tope

**Dónde:** `app/api/coupons/route.ts`.

Único `findMany` sin `take` que quedaba en una pantalla admin cotidiana. Los
cupones se crean a mano de uno en uno, así que el riesgo real es bajo, pero una
consulta sin cota es una consulta sin cota.

**Corrección:** `take: 500` + `count()`, con cabeceras `X-Total-Count` y
`X-Truncated`; si se alcanza el tope la UI lo avisa explícitamente en vez de
mostrar una lista incompleta en silencio.

### RC-14 — La búsqueda no protegía contra respuestas obsoletas

**Dónde:** `app/admin/products/page.tsx` (`loadProducts`), `app/admin/reviews/page.tsx`
(`fetchReviews`), `app/admin/stats/page.tsx` (efecto de `[period]`).

Ninguna de las tres tenía control de concurrencia. Con el debounce de 300 ms y
consultas que tardaban ~200 ms, dos cargas podían solaparse y **la más lenta
escribir el estado al final**, dejando en pantalla resultados que no
correspondían a lo que el operador acababa de escribir o seleccionar. Además,
cada carga ponía `loading = true`, lo que reemplazaba la tabla entera por un
esqueleto en cada pulsación.

**Corrección:** guardia por número de secuencia (`requestSeq`) en las Server
Actions —sólo la respuesta con el número vigente puede escribir estado— y
`AbortController` donde el transporte es `fetch`. Se añade además el estado
`refreshing`, distinto de `loading`: **los datos anteriores permanecen visibles y
sólo se atenúan** mientras llega la búsqueda nueva.

---

## Evidencia

Todas las cifras provienen de mediciones reales sobre una base de datos de
pruebas dedicada (`mundotech_perf`), nunca de producción. La siembra es
reproducible con `scripts/perf-seed.mjs`, que **se niega a escribir** si el
nombre de la base no contiene `perf` o `test`.

### Payload y tiempo de consulta del listado (antes)

Consulta equivalente a `PRODUCT_ADMIN_SELECT` + la relación `media`, tal como la
resolvía Prisma:

| Productos | Filas devueltas | JSON transferido | Tiempo Postgres (p50) |
|---:|---:|---:|---:|
| 100 | 100 | **127 KB** | 14,6 ms |
| 1 000 | 1 000 | **1,29 MB** | 53,8 ms |
| 5 000 | 5 000 | **6,43 MB** | 186,4 ms |

Sobre la base real de producción (240 productos en el momento de la auditoría):
215 KB de productos + 108 KB de media = **323 KB por interacción**.

### Payload y tiempo de consulta del listado (después)

`npm run verify:inventory-scale` con `pageSize = 30`:

| Productos | Filas devueltas | Payload | Tiempo Postgres (p50) |
|---:|---:|---:|---:|
| 100 | **30** | **9,33 KB** | 6,1 ms |
| 1 000 | **30** | **9,41 KB** | 7,2 ms |
| 5 000 | **30** | **9,47 KB** | 10,6 ms |

Multiplicar por 50 el catálogo cambia el payload en **un 1,5 %**. Ése era el
criterio de aceptación fundamental.

Resto de operaciones con 5 000 productos (p50, incluye el agregado de contadores):

```
Página 2 (keyset)          8,5 ms   9 467 B
Búsqueda por texto        11,0 ms   9 439 B
Filtro por categoría       4,5 ms   9 353 B
Filtro agotados            3,6 ms   9 430 B
Filtro despublicados       4,5 ms   9 539 B
Rango de precio            7,9 ms   9 476 B
```

Recorrido completo del catálogo paginando: **167 páginas, 5 000 filas, 5 000
únicas, 828 ms (5,0 ms/página)**, orden idéntico al de Prisma y **sin filas
perdidas ni duplicadas**. El coste por página es constante: es la propiedad que
distingue keyset de `OFFSET`.

### Planes de PostgreSQL

**Ordenación del listado, antes (sin índice por `createdAt`):**

```
Limit  (cost=716.10..716.22 rows=50) (actual time=5.826..5.835 rows=50)
  ->  Sort  (Sort Key: "createdAt" DESC, id DESC)
        Sort Method: top-N heapsort  Memory: 30kB
        ->  Seq Scan on "Product"  (actual time=0.020..4.708 rows=5000)
Execution Time: 5.869 ms
```

**Después (`Product_createdAt_id_idx`):**

```
Index Scan using "Product_createdAt_id_idx"
Execution Time: 0.223 ms          ← 26× más rápido, y sin leer 5 000 filas
```

**Búsqueda de un término poco frecuente (3 coincidencias en 5 000), antes:**

```
Seq Scan on "Product"
  Filter: ((name ~~* '%zafiro%') OR (sku ~~* '%zafiro%') OR (brand ~~* '%zafiro%'))
  Rows Removed by Filter: 4997
  Buffers: shared hit=501
Execution Time: 20.492 ms
```

**Después (`product_admin_search_trgm_idx`, GIN pg_trgm):**

```
Bitmap Index Scan on product_admin_search_trgm_idx
  Buffers: shared hit=11
Execution Time: 0.324 ms          ← 63× más rápido, 45× menos buffers
```

**Índice descartado por medición:** se probó `Product_price_idx` para el filtro de
rango de precio. El planificador lo elegía y el resultado era **más lento** que el
escaneo ordenado por `createdAt` con filtro (0,347 ms frente a 0,237 ms), así que
**no se incluyó**. La consigna era índices razonados, no veinte índices.

### Nodos DOM (jsdom, columnas reales del inventario)

| Registros | Sólo escritorio | Sólo móvil | **Antes (ambos árboles)** |
|---:|---:|---:|---:|
| 30 | 341 | 691 | **1 032** |
| 50 | 561 | 1 151 | **1 712** |
| 100 | 1 111 | 2 301 | **3 412** |
| 500 | 5 511 | 11 501 | **17 012** |

Con 500 productos en catálogo: **17 012 nodos antes** → **341 nodos ahora**
(página de 30 en escritorio). **50× menos.** El test
`tests/data-table-responsive.test.tsx` fija el invariante: el coste por fila es
el de UNA representación (≤ 8 nodos), y multiplicar por 10 los datos multiplica
por ~10 los nodos, no por ~20.

### Tiempo de render de React (jsdom; valores relativos, no absolutos de navegador)

| Registros | Sólo escritorio | Sólo móvil | Antes (ambos) |
|---:|---:|---:|---:|
| 30 | 67,4 ms | 47,8 ms | **115,2 ms** |
| 500 | 743,3 ms | 668,7 ms | **1 412,0 ms** |

Combinando paginación + un solo árbol: **1 412 ms → 67 ms** para un catálogo de
500 productos, ~21×. (jsdom es sensiblemente más lento que un navegador real; lo
relevante aquí es la proporción.)

### Ingresos del Dashboard

`npm run verify:dashboard-revenue` compara la implementación anterior
(`findMany` + suma en Node) contra la agregación en SQL, en la misma ejecución:

```
BD de pruebas — 10 103 pedidos validados
ANTES   usd=3597478.22 bs=396403108.2 legado=true   569.8 ms · 491 377 bytes
DESPUÉS usd=3597478.22 bs=396403108.2 legado=true    24.8 ms ·      73 bytes
✔ Equivalencia exacta.

BD real (solo lectura) — 11 pedidos validados
ANTES   usd=334 bs=252936.51 legado=false           281.8 ms ·     569 bytes
DESPUÉS usd=334 bs=252936.51 legado=false            10.4 ms ·      61 bytes
✔ Equivalencia exacta.
```

**23× más rápido y 6 700× menos transferencia, con los mismos números al
céntimo.**

### Paridad funcional de la nueva consulta

Comprobación de que los filtros devuelven exactamente los mismos conjuntos que la
implementación con Prisma:

```
filtro category  nuevo=494  prisma=494   OK
filtro out       nuevo=611  prisma=611   OK
filtro low       nuevo=340  prisma=340   OK
filtro price     nuevo=1052 prisma=1052  OK
filtro inactive  nuevo=715  prisma=715   OK
búsqueda "cable"      nuevo=326  ILIKE=326   OK
búsqueda "apple"      nuevo=1187 ILIKE=1187  OK
búsqueda "Audífonos"  nuevo=339  ILIKE=339   OK
búsqueda "audifonos"  nuevo=339  ILIKE=0     ← mejora: ahora insensible a acentos
```

La última fila es una mejora de UX derivada del cambio de índice: buscar
«audifonos» sin tilde antes no encontraba nada; ahora encuentra los 339
resultados, igual que ya hacía el buscador del catálogo público.

### Peso de los índices nuevos (sobre 5 000 productos)

```
product_admin_search_trgm_idx      528 kB
Product_category_createdAt_id_idx  384 kB
Product_createdAt_id_idx           304 kB
Product_stock_createdAt_idx        168 kB
Review_status_createdAt_idx         96 kB
Product_updatedAt_idx               72 kB
```

Total ~1,5 MB por cada 5 000 productos. Coste de escritura despreciable frente al
volumen de mutaciones del panel.

---

## Archivos modificados

> Las líneas «después» son las reales del archivo tras los cambios.

### Servidor — inventario

| Ruta | Función / componente | Antes | Después | Qué cambió | Por qué |
|---|---|---|---|---|---|
| `lib/products/admin-product-query.ts` | **nuevo** — `queryAdminProducts`, `countAdminProducts`, `iterateAdminProductsForCsv`, codec del cursor | — | L1‑L285 (`queryAdminProducts` L157‑L206) | Consulta paginada por keyset en SQL con filtros, búsqueda trigram y agregados de contadores | Sustituye el `findMany` ilimitado; el coste deja de depender del total de productos |
| `lib/products/admin-product-dto.ts` | **nuevo** — tipos, constantes y saneado de filtros | — | L1‑L119 | Contrato puro, sin Prisma | El Client Component del inventario lo importa sin arrastrar `pg` al bundle del navegador |
| `lib/product-select.ts` | `PRODUCT_ADMIN_SELECT` → `PRODUCT_ADMIN_DETAIL_SELECT` | L43‑L62 | **L51‑L71** (alias `@deprecated` L76) | Pasa de ser el select del **listado** a ser el select del **detalle** | RC‑02: los campos de edición ya no viajan por cada fila |
| `app/actions/productActions.ts` | `getProductsAdmin()` | L973‑L1056 | **L993‑L1006** | Consulta ilimitada → delega en `queryAdminProducts` (cursor + `pageSize`) | RC‑01 |
| `app/actions/productActions.ts` | `getAdminProductCategories()` | — (estaba embebido) | **L1014‑L1017** | Categorías separadas del listado y cacheadas | RC‑04 |
| `app/actions/productActions.ts` | `getAdminProductById()` | **nuevo** | **L1026‑L1056** | Detalle completo de UN producto para el modal | RC‑02 |
| `app/actions/productActions.ts` | `recalculateAllProductPrices()` | L1064‑L1160 | **L1066‑L1193** | N `update` en una transacción → `UPDATE … FROM (VALUES …)` por lotes de 500 | RC‑11; conserva la atomicidad todo‑o‑nada |
| `lib/categories/admin-categories.ts` | **nuevo** — `getCachedAdminCategoryNames` | — | L1‑L77 (`readAdminCategoryNames` L30‑L67) | Misma lógica de mezcla/dedupe, ahora cacheada por tag `categories` | RC‑04 |
| `app/api/admin/products/export.csv/route.ts` | **nuevo** — `GET` | — | **L47‑L129** | Export del conjunto filtrado **completo**, por lotes keyset en servidor | Evita que la paginación convierta «Exportar inventario» en «exportar la página visible» |

### Cliente — inventario

| Ruta | Función / componente | Antes | Después | Qué cambió | Por qué |
|---|---|---|---|---|---|
| `app/admin/products/page.tsx` | `AdminProductsContent` (completo) | L73‑L666 (705 líneas) | **L93‑L926** (954 líneas) | Paginación con pila de cursores, DTO ligero, detalle bajo demanda, filtro de estado | RC‑01/02 |
| `app/admin/products/page.tsx` | `loadProducts()` | L159‑L191 | **L224‑L261** | Guardia de concurrencia por número de secuencia; `refreshing` en vez de esqueleto completo | RC‑14 |
| `app/admin/products/page.tsx` | `handleExportCsv()` | L213‑L226 | **L297‑L333** | Generaba el CSV con el array del navegador → descarga desde `/api/admin/products/export.csv` | Preserva la intención («todo lo filtrado») bajo paginación |
| `app/admin/products/page.tsx` | `handleEdit()` | L230 (una línea) | **L360‑L381** | Pide el detalle por id con guardia de carrera y muestra esqueleto en el modal | RC‑02 |
| `app/admin/products/page.tsx` | `commitInlineEdit()` | L269‑L294 | **L459‑L491** | Borrador leído de una ref (evita doble envío `onBlur` + Enter) + resincronización silenciosa de la página | Consistencia de los contadores agregados tras editar stock/precio |
| `app/admin/products/page.tsx` | Navegación de páginas | — | **L872‑L908** | Anterior/Siguiente + «X–Y de N · Página P de T», objetivos táctiles de 44 px | Navegación clara en PC y móvil |
| `components/admin/DataTable.tsx` | `DataTable` | L60‑L266 | **L81‑L318** | Un solo árbol por breakpoint; `Set` para la selección; layout móvil memoizado; prop `refreshing`; `data-testid` estables | RC‑03 |
| `hooks/useIsDesktop.ts` | **nuevo** — `useIsDesktop`, `useMediaQuery` | — | L1‑L87 (`useIsDesktop` L60‑L62) | Breakpoint por `useSyncExternalStore` + `matchMedia` compartido | RC‑03 sin desajustes de hidratación |

### Imágenes

| Ruta | Función / componente | Antes | Después | Qué cambió | Por qué |
|---|---|---|---|---|---|
| `lib/upload-limits.ts` | **nuevo** | — | L1‑L54 | Fuente única de los tres límites (origen / objetivo cliente / máximo servidor), todos **por archivo** | Evita que cliente y servidor se desincronicen (antes `PhotoUploader` permitía 8 MB contra un servidor de 5 MB) |
| `lib/client-image-normalize.ts` | `normalizeImageForUpload()` | L106‑L134 | **L171‑L213** | GIF intactos; compresión progresiva en 4 pasos; errores tipados con `code` | RC‑06: una foto de 8 MB se comprime en vez de rechazarse |
| `lib/client-image-normalize.ts` | `downscaleToJpeg()` | L71‑L99 | **L127‑L160** | Si el navegador no puede decodificar, devuelve el original en vez de lanzar | Un fallo de `createImageBitmap` ya no tumba un archivo válido |
| `lib/products/upload-product-images.ts` | **nuevo** — `uploadProductImages`, `completedUrlsInOrder` | — | L1‑L163 | Normalización por archivo, concurrencia limitada a 3, estado individual, aislamiento de fallos | RC‑06 |
| `app/components/AddProductModal.tsx` | `uploadFilesViaApi()` | L431‑L460 | **L541‑L605** | Bucle secuencial con `alert` + `break` → orquestador con progreso por archivo | RC‑06 |
| `app/components/AddProductModal.tsx` | `UploadProgressList` | **nuevo** | **L231‑L290** | Lista de estado por imagen (✓ / subiendo / error con motivo) | Sustituye el `alert()` que interrumpía toda la operación |
| `app/components/AddProductModal.tsx` | Esqueleto de detalle | **nuevo** | **L828‑L847** | Overlay mientras carga el detalle; el `<form>` permanece montado | El modal abre al instante sin congelar la interfaz |
| `app/api/upload/route.ts` | `POST` + `MAX_BYTES` | L11 / L35‑L111 | **L22 / L46‑L129** | Límite por archivo 5 MB → 10 MB, con mensaje que aclara que es por imagen | Deja margen para GIF animado y para el caso en que la normalización no aplique |
| `components/admin/PhotoUploader.tsx` | props | L42 | **L46** | `maxSizeMB` por defecto 8 → `CLIENT_IMAGE_TARGET_BYTES` (5 MB) | Alinea cliente y servidor; antes el cliente aceptaba tamaños que el servidor rechazaba |

### Otras pantallas del panel

| Ruta | Función / componente | Antes | Después | Qué cambió | Por qué |
|---|---|---|---|---|---|
| `app/actions/adminDashboardActions.ts` | `fetchValidatedRevenueTotals()` | **nuevo** (sustituye L111‑L149) | **L106‑L142** | `findMany` + bucle → `SUM` / `COUNT FILTER` en SQL | RC‑07 |
| `app/actions/adminDashboardActions.ts` | `countDistinctProductCategories()` | **nuevo** (sustituye L89) | **L145‑L150** | `findMany({ distinct })` → `COUNT(DISTINCT category)` | RC‑07 |
| `app/actions/adminDashboardActions.ts` | `getAdminDashboardData()` | L70‑L192 | **L152‑L258** | Usa los dos helpers anteriores | RC‑07 |
| `lib/analytics-orders.ts` | `accumulateValidatedRevenue()` + tipos | **nuevo** | **L177‑L229** (función L205‑L229) | Implementación de referencia (el bucle antiguo), exportada y testeada | Documenta y fija la semántica que la agregación SQL debe respetar |
| `app/api/admin/product-costs/route.ts` | `GET` | L7‑L21 | **L28‑L73** | Volcado del catálogo → requiere `?ids=` (máx. 50) | RC‑08; además `cost` es dato sensible |
| `app/admin/stats/page.tsx` | Efectos de carga | L53‑L88 | **L53‑L130** | Tres `fetch` acoplados a `[period]` → efectos separados con `AbortController`; costes sólo de los `topProducts` | RC‑08, RC‑14 |
| `app/admin/reviews/page.tsx` | `fetchReviews()` + navegación | L42‑L56 | **L61‑L87** (navegación L308‑L347) | Paginación de 25 con guardia de concurrencia; contadores siguen siendo globales | RC‑09, RC‑14 |
| `app/api/reviews/route.ts` | `GET` | L15‑L70 | **L24‑L79** | Default sin parámetros 300 → 50 | RC‑09 |
| `app/actions/userActions.ts` | `listAdminUsers()` | L67‑L94 | **L105‑L174** | Tabla completa → página de 25 con búsqueda y filtro «solo personal» | RC‑10 |
| `app/admin/settings/users/page.tsx` | `AdminUsersPage` | L1‑L20 | **L1‑L24** | Renderiza en servidor sólo la primera página | RC‑10 |
| `app/admin/settings/users/UsersClient.tsx` | `loadUsers()` + buscador + navegación | — | **L97‑L110** (buscador L241‑L266, navegación L319‑L356) | Búsqueda con debounce, filtro «Solo personal» y paginación | RC‑10 |
| `app/api/coupons/route.ts` | `GET` + `MAX_COUPONS` | L8‑L24 | **L19 / L22‑L45** | `findMany` sin tope → `take: 500` + cabeceras `X-Total-Count` / `X-Truncated` | RC‑13 |
| `app/admin/coupons/page.tsx` | `fetchCoupons()` + aviso | L44‑L52 | **L46‑L67** (aviso L169‑L178) | Lee las cabeceras y avisa si la lista está acotada | RC‑13: nunca mostrar una lista incompleta en silencio |
| `lib/products/query-products.ts` | facetas de `queryCatalogProducts` | L233‑L237 | **L234‑L242** | `SELECT category, brand` → `SELECT DISTINCT category, brand` | RC‑12 |

### Esquema, migraciones y utilidades

| Ruta | Qué cambió | Por qué |
|---|---|---|
| `prisma/schema.prisma` | `Product`: `@@index([createdAt, id])`, `@@index([category, createdAt, id])`, `@@index([stock, createdAt])`, `@@index([updatedAt])` (L53‑L67). `Review`: `@@index([status, createdAt])` (L456‑L460) | RC‑05 |
| `prisma/migrations/20260826120000_add_admin_performance_indexes/migration.sql` | **nueva** — 6 índices, todos `IF NOT EXISTS` | RC‑05 |
| `scripts/perf-seed.mjs` | **nuevo** — siembra 100 / 1 000 / 5 000 productos en una base de pruebas; se niega a escribir si el nombre no contiene `perf`/`test` | Pruebas de escalabilidad reproducibles sin tocar producción |
| `scripts/verify-admin-inventory-scale.mts` | **nuevo** — mide la carga real y verifica la integridad del recorrido keyset | Criterio de aceptación comprobable |
| `scripts/verify-dashboard-revenue.mts` | **nuevo** — compara antes/después de los ingresos contra una BD real (solo lectura) | Equivalencia numérica demostrable |
| `package.json` | `perf:seed`, `verify:dashboard-revenue`, `verify:inventory-scale` | Reproducibilidad |

---

## Migraciones

**`prisma/migrations/20260826120000_add_admin_performance_indexes/migration.sql`**

Todos los índices son **aditivos**: no se elimina ninguno existente.

| Índice | Definición | Motivo | Evidencia |
|---|---|---|---|
| `Product_createdAt_id_idx` | `("createdAt", "id")` | Orden y paginación keyset del inventario | Seq Scan + top‑N heapsort (5,87 ms) → Index Scan (0,22 ms) |
| `Product_category_createdAt_id_idx` | `("category", "createdAt", "id")` | Filtro por categoría con el mismo orden keyset | Bitmap + sort (1,48 ms) → Index Scan (0,09 ms) |
| `Product_stock_createdAt_idx` | `("stock", "createdAt")` | Filtros «agotados» / «stock bajo» y los `COUNT(*) FILTER` del encabezado | Elegido por el planificador en ambos casos |
| `Product_updatedAt_idx` | `("updatedAt")` | Buscador de productos del Gestor Home (`ORDER BY "updatedAt" DESC LIMIT 12`) | Index Scan, 0,25 ms |
| `product_admin_search_trgm_idx` | GIN `gin_trgm_ops` sobre `immutable_unaccent(lower(name ‖ ' ' ‖ sku ‖ ' ' ‖ brand))` | Búsqueda por nombre/SKU/marca con comodín inicial | Seq Scan 20,49 ms → Bitmap Index Scan 0,32 ms |
| `Review_status_createdAt_idx` | `("status", "createdAt")` | Pestañas de moderación paginadas | Recorría `Review_createdAt_idx` descartando filas de otros estados |

**Extensiones PostgreSQL:** ninguna nueva. `pg_trgm`, `unaccent` y la función
`immutable_unaccent(text)` ya los crea la migración
`20260613130000_add_search_trgm` (índice equivalente del catálogo público) y
están instalados en la base (`pg_trgm 1.6`).

**Índices existentes que quedan parcialmente redundantes:** `Product_category_idx`
queda cubierto como prefijo de `Product_category_createdAt_id_idx`, y
`Review_status_idx` por `Review_status_createdAt_idx`. **No se eliminan**: las
estadísticas de producción muestran uso activo (`Product_category_idx`: 142 891
escaneos; `Review_status_idx`: 665) y el planificador puede seguir prefiriendo el
índice más estrecho para búsquedas de pura igualdad. Retirarlos sería un cambio
independiente, con su propia ventana de observación.

**Concurrencia:** se usa `CREATE INDEX` y no `CREATE INDEX CONCURRENTLY` porque
Prisma ejecuta cada migración dentro de una transacción y `CONCURRENTLY` no puede
correr en una. Con el volumen actual (240 productos) el bloqueo es de
milisegundos; medido sobre 5 000 productos tarda < 120 ms. **Si `Product` llegara
a cientos de miles de filas**, crear los índices a mano con `CONCURRENTLY` antes
de desplegar y dejar que el `IF NOT EXISTS` los dé por hechos.

**Rollback:**

```sql
DROP INDEX IF EXISTS "Product_createdAt_id_idx";
DROP INDEX IF EXISTS "Product_category_createdAt_id_idx";
DROP INDEX IF EXISTS "Product_stock_createdAt_idx";
DROP INDEX IF EXISTS "Product_updatedAt_idx";
DROP INDEX IF EXISTS product_admin_search_trgm_idx;
DROP INDEX IF EXISTS "Review_status_createdAt_idx";
```

Ningún dato se altera; la migración sólo crea índices. Revertirla degrada el
rendimiento pero no rompe funcionalidad — salvo que la búsqueda del inventario
volvería a hacer Seq Scan.

**Invariante protegido por test:** la expresión indexada en el SQL debe coincidir
**carácter a carácter** con `ADMIN_SEARCH_EXPR` de
`lib/products/admin-product-query.ts`. Si divergen, PostgreSQL deja de usar el
índice **en silencio** y nada falla a la vista.
`tests/admin-product-query.test.ts` compara ambas cadenas, y por eso la expresión
se escribe en una sola línea en la migración.

---

## Imágenes

### Causa del error de 5 MB

**El límite nunca fue agregado.** No existía —ni existe— ninguna suma de
`files.size` en el cliente ni en el servidor. `app/api/upload/route.ts` validaba
`file.size > MAX_BYTES` sobre **un** archivo, y cada imagen viajaba en su propia
petición.

Lo que producía el síntoma era la combinación de dos defectos en
`AddProductModal`:

1. **No normalizaba.** Era el único punto del panel que no llamaba a
   `normalizeImageForUpload()`: subía el `File` original. Con fotos de cámara o
   de móvil moderno (7–12 MB habituales), el servidor devolvía 413 aunque la
   imagen se pudiera optimizar a menos de 1 MB sin pérdida perceptible para web.
2. **Abortaba la selección.** El bucle hacía `alert(...)` + `break` en el primer
   error, así que las imágenes posteriores ni se intentaban.

Resultado observable: seleccionar varias fotos «que juntas pasan de 5 MB» → una
de ellas superaba el límite **por sí sola** → el resto se cancelaba → el operador
concluye, razonablemente, que el límite es colectivo.

Colateral encontrado: `PhotoUploader` traía `maxSizeMB = 8` por defecto contra un
servidor que aceptaba 5 MB. El cliente daba por buena una imagen que el servidor
rechazaría después.

### Comportamiento nuevo

Cadena de validación, **toda por archivo** (`lib/upload-limits.ts`):

```
origen (≤ 20 MB)
  → normalización en cliente  (HEIC→JPEG · orientación EXIF · reescalado · compresión)
    objetivo ≤ 5 MB
  → POST /api/upload   (rechaza > 10 MB por archivo)
  → magic bytes  (lib/detect-image-mime.ts — nunca se confía en la extensión ni en el MIME del navegador)
  → sharp: reescalado a 1200 px + WebP q80   (GIF se conserva tal cual)
```

| Parámetro | Antes | Después |
|---|---|---|
| Tamaño máximo de la imagen **fuente** | 20 MB (sólo donde se usaba el normalizador) | 20 MB, en todos los puntos |
| Objetivo tras normalizar en cliente | 8 MB en `PhotoUploader`, **sin normalizar** en el modal de producto | 5 MB en todo el panel |
| Límite del servidor **por archivo** | 5 MB | 10 MB |
| Límite sobre la **suma** de una selección | nunca existió | sigue sin existir |
| Formatos de entrada aceptados | JPEG/PNG/WEBP/GIF (+ HEIC sólo donde se normalizaba) | Iguales, con HEIC/HEIF convertido en **todos** los puntos |
| Formato de salida | WebP q80 (GIF intacto) | Sin cambios |

**Compresión progresiva.** Antes había un único intento (2000 px, calidad 0,82) y
si no bastaba se rechazaba el archivo. Ahora se recorren cuatro pasos —
`2000/0,82 → 1600/0,75 → 1280/0,70 → 1024/0,65` — y se para en cuanto se baja del
objetivo. Una foto de 8 MB queda típicamente por debajo de 1,5 MB sin afectar la
calidad necesaria para web (el servidor reescala a 1200 px de todos modos).

**HEIC / iPhone.** `AddProductModal` usa ahora la misma infraestructura que el
resto del panel: `heic2any` en import dinámico (no se bundlea para quien no lo
necesita) y el seam `window.__E2E_HEIC_DECODER__`, gateado por
`NODE_ENV !== 'production'`. Cubierto por pruebas unitarias y por E2E en
navegador real.

**GIF animado — no se rompe.** `isGifFile()` detecta GIF por MIME y por extensión
y lo devuelve **intacto**: pasarlo por `<canvas>` lo convertiría en un JPEG de un
solo fotograma. En servidor, `processImage()` ya conservaba los GIF
(`sharp(buffer, { animated: true })`, sin convertir a WebP) y eso no se ha
tocado. Precisamente por esto el límite del servidor sube a 10 MB: un GIF grande
no se puede optimizar en cliente y necesita margen. Un test bloquea la regresión.

**Vídeo — sin mezclar.** El vídeo usa otra infraestructura (`/api/upload-video`,
95 MB, jobs de procesamiento con `posterUrl`, polling de estado y limpieza de
huérfanos). No se ha modificado ninguno de sus límites ni de sus rutas. En el
modal se conservan intactos: procesamiento, póster, polling cada 3 s, borrado de
vídeos subidos en la sesión al cerrar sin guardar, y los avisos de «espera a que
termine de procesarse».

**Concurrencia: 3 subidas simultáneas.** Decisión técnica: cada subida es un POST
completo que el servidor procesa con `sharp` (CPU‑bound, VPS de un solo nodo).
Una sola en vuelo desaprovecha la latencia móvil; diez apilan diez trabajos de
`sharp` y consumen el rate limit (60 subidas / 10 min) de golpe. Tres solapa red
y CPU sin saturar. Configurable vía `UPLOAD_CONCURRENCY`.

**Aislamiento de fallos y orden.** Cada archivo lleva su propio estado
(`pending → processing → uploading → done | error`) visible en la UI. Un error
afecta sólo a esa imagen; las que sí subieron se conservan. El orden final de la
galería es el de **selección**, no el de finalización: la galería se reconstruye
desde la base previa más las URLs completadas ordenadas por índice.

**Se preserva:** `MAX_SLOTS = 6` (con aviso por archivo cuando la selección excede
los huecos libres), reordenación por drag & drop, imagen principal (primer
elemento), eliminación de slots, edición de productos existentes con sus URLs
antiguas, y la limpieza de archivos huérfanos en R2
(`cleanupRemovedProductMedia`). **No hay pérdida de media al editar.**

---

## Antes vs después

Todos los valores son medidos, no estimados. Dataset de referencia: 5 000
productos, 20 000 pedidos, 5 000 reseñas en `mundotech_perf`.

### Inventario (`/admin/products`)

| Métrica | Antes | Después | Mejora |
|---|---|---|---|
| Productos recibidos en la carga inicial | 5 000 | **30** | 167× |
| Payload de la carga inicial | 6,43 MB | **9,47 KB** | **679×** |
| Payload con 100 productos en catálogo | 127 KB | 9,33 KB | 13,6× |
| Payload con 1 000 productos en catálogo | 1,29 MB | 9,41 KB | 137× |
| Tiempo de consulta (p50) | 186,4 ms | **10,6 ms** | 17,6× |
| Consultas por carga del listado | 4 (productos + media + 2 de categorías) | **2** (página + agregados) | — |
| Búsqueda: plan de PostgreSQL | Seq Scan | Bitmap Index Scan (GIN) | — |
| Búsqueda de término poco frecuente | 20,49 ms | **0,32 ms** | 64× |
| Nodos DOM (500 registros) | 17 012 | **341** (página de 30) | 50× |
| Tiempo de render React (500 registros, jsdom) | 1 412 ms | **67 ms** (página de 30) | 21× |
| Peticiones al escribir 9 caracteres rápido | 1 por debounce, con esqueleto completo cada vez | ≤ 3, con la tabla anterior visible | — |
| Respuesta obsoleta puede pisar la nueva | **Sí** | No (guardia por número de secuencia) | — |
| Coste tras guardar un producto | Catálogo completo | Página actual (30 filas) | — |
| Coste de la página N | Igual (todo) | Constante: 5,0 ms/página | — |
| Exportar CSV | Array del navegador (habría exportado sólo la página) | Servidor, conjunto filtrado completo, 5 000 filas en 146 ms | — |

### Dashboard, Estadísticas, Reseñas, Usuarios

| Pantalla | Métrica | Antes | Después |
|---|---|---|---|
| Dashboard | Filas leídas para los ingresos | 10 103 | **1** |
| Dashboard | Bytes transferidos | 491 377 | **73** |
| Dashboard | Tiempo | 569,8 ms | **24,8 ms** |
| Dashboard | Contador de categorías | 1 fila por categoría | 1 escalar |
| Estadísticas | Costes descargados | 5 000 (254 KB) | ≤ 20 (< 1 KB) |
| Estadísticas | Recarga al cambiar de período | costes + «más vistos» + stats | **sólo stats** |
| Reseñas | Filas por respuesta | hasta 300 completas | **25** |
| Reseñas | Contadores por estado | globales (`groupBy`) | globales (`groupBy`) — **sin cambio** |
| Usuarios | Filas + subconsultas COUNT | toda la tabla `User` | **25** |
| Catálogo público (facetas) | Filas para construir 2 listas | 3 758 (161 KB) | **80** (3,4 KB) |
| Recálculo masivo de precios | 5 000 productos | ~22 s extrapolados | **1,26 s** |

### Independencia del tamaño del catálogo

| Productos en catálogo | Payload inicial (antes) | Payload inicial (después) |
|---:|---:|---:|
| 100 | 127 KB | **9,33 KB** |
| 1 000 | 1,29 MB | **9,41 KB** |
| 5 000 | 6,43 MB | **9,47 KB** |

Multiplicar por 50 el catálogo cambia el payload en un 1,5 %. **El rendimiento
inicial ya no depende linealmente de los productos existentes.**

---

## Problemas adicionales encontrados

Hallazgos que no estaban en el encargo inicial y se corrigieron:

1. **`recalculateAllProductPrices()` no habría podido ejecutarse a escala** — N
   `update` en una sola transacción. Corregido con `UPDATE … FROM (VALUES …)` por
   lotes (RC‑11).
2. **`listAdminUsers()` volcaba la tabla `User` entera con PII** — clientes
   incluidos y un `COUNT` por fila. Corregido con paginación + búsqueda (RC‑10).
3. **Facetas del catálogo público con DISTINCT en JavaScript** — 47× de
   transferencia innecesaria en una ruta pública (RC‑12).
4. **`/api/coupons` sin `take`** — última pantalla admin cotidiana sin cota (RC‑13).
5. **`PhotoUploader` aceptaba 8 MB contra un servidor de 5 MB.** Los límites de
   cliente y servidor no compartían fuente. Unificados en `lib/upload-limits.ts`.
6. **`downscaleToJpeg()` tumbaba el archivo si `createImageBitmap` fallaba.**
   Ahora devuelve el original y deja decidir al servidor por magic bytes.
7. **«Más vistos» de Estadísticas se recargaba al cambiar de período** aunque no
   dependa de él, y **una respuesta lenta de un período anterior podía pisar la
   del período actual**. Efectos separados + `AbortController` (RC‑14).
8. **Doble envío en la edición rápida de stock/precio**: `onBlur` y `Enter`
   podían disparar dos peticiones. El borrador se lee ahora de una ref que se
   limpia al instante.
9. **Contadores del inventario inconsistentes (preexistente, conservado):** el
   filtro «stock bajo» usa `stock <= 3` mientras el contador del encabezado y el
   badge usan `stock < 3`. Se ha **preservado exactamente** el comportamiento
   anterior para no cambiar cifras que el operador ya conoce, pero queda
   documentado como discrepancia real.
10. **Un `export const` en un archivo `'use server'` rompe el build.** Detectado
    al añadir `ADMIN_USERS_PAGE_SIZE` a `userActions.ts`: Next sólo admite
    exports de funciones async (y tipos) en esos archivos, y el módulo entero
    queda sin exports. Corregido y documentado en el propio archivo.
11. **Importar el módulo de consulta desde un Client Component arrastraba `pg` al
    bundle del navegador.** Por eso el contrato (tipos, constantes, saneado de
    filtros) vive en `lib/products/admin-product-dto.ts`, un módulo puro.

Hallazgo verificado **sin** necesidad de cambios:

12. **Los providers globales NO cargan el catálogo en `/admin`.**
    `app/layout.tsx` monta `CartProvider`, `WishlistProvider`, `ProductProvider`
    y `ExchangeRateProvider` en todas las rutas, pero `ProductContext` es de carga
    perezosa —sólo el primer consumidor real de `useProducts()` dispara el
    fetch— y **ningún componente administrativo lo consume**: los únicos
    consumidores son `components/CategorySidebar.tsx`, `components/CategoryNav.tsx`
    y `components/ProductFilters.tsx`, todos del catálogo público. `AppContent`
    además devuelve `null` en `/admin`, así que Navbar y CartDrawer no se montan.
    El overhead que queda en `/admin` es el JS de los providers vacíos y el layout
    raíz (JSON‑LD, fuentes, Meta Pixel), no datos. **No se ha reestructurado en
    route groups por falta de evidencia de beneficio**, tal como se pidió.

---

## Pruebas realizadas

### Unitarias e integración (`npm test` — Vitest)

**55 archivos, 561 pruebas, todas en verde.** Archivos nuevos:

| Archivo | Pruebas | Qué cubre |
|---|---:|---|
| `tests/admin-product-query.test.ts` | 20 | Cursor keyset (ida/vuelta, entradas maliciosas, opacidad); saneado de filtros y tope de `pageSize`; que la consulta **siempre** lleva `LIMIT`; que **no** selecciona `description`/`specs`/`cost`/`profitMarginPct`/`media`; que la miniatura se resuelve en servidor; que los contadores salen de agregados SQL; que la búsqueda usa trigram y no `ILIKE`; **paridad literal entre `ADMIN_SEARCH_EXPR` y el índice de la migración** |
| `tests/data-table-responsive.test.tsx` | 8 | Que en escritorio no hay ninguna card móvil montada y viceversa; que no quedan nodos con `.md:hidden` / `.hidden.md:block`; que el coste por fila es el de una sola representación (≤ 8 nodos); que ×10 datos = ×10 nodos; selección de 100/200 con `Set`; `loading` vs `refreshing` |
| `tests/client-image-normalize.test.ts` | 16 | 1 MB pasa sin tocar; **dos de 3 MB independientes**; foto de 8 MB comprimida (y reescalada a 2000 px); compresión progresiva multi‑paso; imagen cerca de 20 MB aceptada; > 20 MB rechazada **sólo ese archivo**; imposible de comprimir → error tipado; JPEG/PNG/WEBP; **GIF animado intacto**; HEIC por MIME y por extensión; HEIC convertido; HEIC grande convertido **y** comprimido |
| `tests/upload-product-images.test.ts` | 12 | Dos de 3 MB (6 MB en total) → ambas suben; seis que suman 18 MB → todas suben; una petición por archivo; normalización por archivo; **413 en una no cancela las demás**; fallo de normalización aislado; respuesta no‑JSON legible; estado individual por archivo; concurrencia ≤ 3 y > 1; **orden de selección preservado** aunque terminen desordenadas |
| `tests/upload-route-limits.test.ts` | 17 | Coherencia cliente < servidor < origen; 6 MB aceptado (antes 413); > 10 MB rechazado con mensaje «por imagen, no por selección»; dos de 3 MB → ambas 200; **ausencia de cualquier comprobación agregada en el código de la ruta**; magic bytes JPEG/PNG/WEBP/GIF; **archivo que finge ser imagen rechazado (415)**; HEIC crudo rechazado; origen, permiso `CATALOG`, rate limit y `purpose` intactos; GIF conservado |
| `tests/admin-dashboard-revenue.test.ts` | 12 | Semántica de `accumulateValidatedRevenue` (vacío, con tasa, legado, tasa 0/negativa, mezcla, **redondeo por pedido y no sólo al final**); y que el SQL implementa exactamente esas reglas: mismos estados, `ROUND(total/tasa, 2)`, condición de legado, Bs excluye legado, sin `findMany` de pedidos ni `distinct` de categorías |

### Verificación contra base de datos real (scripts nuevos)

```
npm run verify:dashboard-revenue     ✔ Equivalencia exacta (BD real y BD de 20 000 pedidos)
npm run verify:inventory-scale       ✔ Paginación íntegra: 5 000 filas, 5 000 únicas, orden idéntico
npm run perf:seed -- --products N    Siembra reproducible (rechaza bases que no sean perf/test)
```

Escalabilidad verificada a **100 / 1 000 / 5 000 productos**: en los tres casos el
frontend recibe 30 filas y ~9,4 KB, el recorrido keyset completo no pierde ni
duplica ninguna fila, y el orden coincide exactamente con el de Prisma.

### E2E (Playwright, Chromium, navegador real)

`e2e/specs/admin-inventory.spec.ts` — **nuevo, 8 pruebas, todas en verde**:

* El listado pagina en servidor y **la representación móvil ni siquiera está
  montada** (`[data-testid="datatable-cards"]` con `toHaveCount(0)`).
* Nunca más filas que el `pageSize`; el contador del encabezado viene del servidor.
* Escribir 9 caracteres rápido produce **≤ 3** cargas, no una por tecla.
* Los filtros se conservan en la URL.
* **Dos fotos JPEG reales de 3 MB (6 MB en total) se suben ambas.**
* **El fallo de una imagen no cancela ni borra las demás** (2 de 3 subidas, con el
  motivo del error visible por archivo).
* **Un HEIC de iPhone se convierte y se sube** (seam `__E2E_HEIC_DECODER__`).
* Mezcla HEIC + JPEG + PNG en una sola selección.
* Seleccionar 8 imágenes con `MAX_SLOTS = 6`: se suben 6 y las 2 restantes se
  reportan como error **de esos archivos**, no de la tanda.

Los JPEG del E2E se generan con `sharp` a partir de ruido aleatorio para que sean
**decodificables de verdad**: unos bytes con la cabecera correcta pero sin imagen
no ejercitarían el camino real (`createImageBitmap` + `<canvas>`).

### Comprobaciones estáticas y build

```
npm run typecheck                  ✔ sin errores  (sin `any`, sin @ts-ignore, sin eslint-disable nuevos)
npm run lint                       ✔ 0 errores, 34 warnings — exactamente los mismos 34 que en HEAD
npm test                           ✔ 55 archivos · 561 pruebas
npx next build                     ✔ compila; 240 páginas de producto pregeneradas
npm run security:api-guards        ✔ todos los handlers de mutación tienen guard de origen
npm run security:permission-guards ✔ RBAC OK
npm run security:admin-page-guards ✔ OK
npx prisma migrate diff            ✔ esquema y base sincronizados (sin deriva de índices)
```

### Pruebas manuales / de navegador

Ejecutadas dentro del E2E sobre el panel real: entrar a Inventario, buscar,
filtrar por categoría/stock/estado/precio, paginar, abrir el modal de creación,
subir imágenes múltiples (incluidas HEIC y casos de error) y comprobar el estado
por archivo. Responsive verificado por diseño (la navegación de páginas usa la
misma disposición en móvil y escritorio, con objetivos táctiles de 44 px) y por el
test unitario de `DataTable` en ambos breakpoints.

### Fallos preexistentes (NO provocados por este trabajo)

Al ejecutar la suite E2E completa aparecen **9 fallos**. Se comprobó que son
preexistentes ejecutando **exactamente las mismas especificaciones sobre el commit
`fa7e71d` sin ninguno de estos cambios** (mediante `git stash`, con la misma base
de datos recién sembrada): el resultado fue **idéntico — los mismos 9 fallos, con
los mismos nombres de prueba**.

| Especificación | Prueba | Motivo observado |
|---|---|---|
| `auth-roles.spec.ts` | logout funciona | El enlace «Iniciar sesión» no aparece tras cerrar sesión |
| `rbac-permissions.spec.ts` | SoloFinanzas ve tasa y cuentas | Formulario financiero no visible |
| `rbac-permissions.spec.ts` | SoloFinanzas no ve formulario general | Conteo de elementos distinto del esperado |
| `rbac-permissions.spec.ts` | campos requeridos para FINANCIAL | Ídem |
| `rbac-permissions.spec.ts` | Superadmin ve Usuarios en navegación móvil | `page.goto('/admin/menu')` supera los 15 s (compilación en dev de Turbopack) |
| `rbac-permissions.spec.ts` | Cliente autenticado no entra a pedidos admin | Ídem, navegación |
| `rbac-permissions.spec.ts` | Log de auditoría tras cambio de permisos | Ídem |
| `stock-double-submit.spec.ts` | producto con stock muestra unidades | El texto existe en el DOM pero está `hidden` |
| `stock-double-submit.spec.ts` | doble submit crea un solo pedido | Encadenado con el anterior |

Ninguno toca las rutas, componentes ni acciones modificados aquí. Quedan
documentados, **no silenciados**.

También falla `npm run plan:check`, porque el script busca un archivo
`PLAN-AUDITORIA-CORRECCION-MUNDOTECH.md` que no existe en el repositorio.
Preexistente y ajeno a este trabajo.

---

## Riesgos pendientes y deuda técnica

Documentados honestamente, con el criterio aplicado en cada caso.

1. **`app/sitemap.ts` carga todos los productos activos sin `take`.** Es inherente
   a un sitemap (Google necesita todas las URLs) y la ruta está cacheada, no es
   una pantalla interactiva. Se convertirá en un problema real por encima de
   ~50 000 URLs, límite de un sitemap único; en ese punto habría que emitir un
   índice de sitemaps paginado. **No se ha tocado.**

2. **`/api/merchant-feed` y `/api/admin/migrate-slugs` recorren el catálogo
   completo.** Son operaciones explícitamente masivas por naturaleza (feed de
   Google Merchant y migración puntual de slugs). Se han revisado y se dejan como
   están, conforme a la consigna de no sobreoptimizar lo que es masivo por diseño.

3. **`/api/banners?showAll=true` y `/api/promotions?showAll=true` siguen sin
   `take`.** Son tablas redactadas a mano con unidades de filas (banners del hero,
   promociones de la home). El riesgo es teórico; se documenta en vez de añadir
   paginación a pantallas que nunca la necesitarán.

4. **El total del inventario se recalcula en cada página.** La consulta de
   contadores (`COUNT(*)` + dos `COUNT(*) FILTER`) se ejecuta en paralelo con la
   de la página. Con 5 000 productos cuesta ~4 ms y con índices se mantiene
   razonable, pero con cientos de miles de filas y un filtro poco selectivo el
   `COUNT` exacto pasa a ser la parte cara. Alternativa si llega ese momento:
   contar sólo al cambiar de filtro (no al cambiar de página) o usar una
   estimación de `pg_class.reltuples` cuando no hay filtros.

5. **La búsqueda del inventario cambió de semántica de forma sutil.** La expresión
   indexada concatena `name ‖ ' ' ‖ sku ‖ ' ' ‖ brand`, así que una consulta de
   varias palabras puede casar **cruzando el límite entre campos** (p. ej. «Cable
   Anker» encuentra un producto llamado «Cable» de marca «Anker», cosa que el
   `ILIKE` por columna no hacía). Es la misma técnica que ya usaba el buscador del
   catálogo público y en la práctica es mejor UX, pero es un cambio de
   comportamiento y conviene saberlo. La búsqueda también pasó a ser **insensible
   a acentos**.

6. **Términos de 1 o 2 caracteres no pueden usar el índice de trigramas**
   (necesitan 3 caracteres) y caen en Seq Scan. Con debounce de 300 ms y un
   catálogo de miles de productos el impacto es asumible; si molestara, la
   solución es exigir un mínimo de 3 caracteres para buscar, como ya hace
   `isQueryTooShort()` en el catálogo público.

7. **Los índices se crean sin `CONCURRENTLY`.** Irrelevante con el volumen actual
   (< 120 ms medidos sobre 5 000 filas), pero anotado arriba con el procedimiento
   a seguir si `Product` creciera mucho antes de desplegar.

8. **`Product_category_idx` y `Review_status_idx` quedan parcialmente redundantes**
   con los nuevos compuestos. No se eliminan porque las estadísticas de producción
   muestran uso activo; retirarlos merece su propia ventana de observación.

9. **Equivalencia de ingresos demostrada empíricamente, no formalmente.** La
   agregación en SQL usa aritmética `numeric` exacta mientras que el bucle anterior
   usaba coma flotante binaria. En teoría podrían diferir en un caso de empate
   exacto (`x.xx5`); en la práctica coincidieron **al céntimo** sobre la base real
   y sobre 10 103 pedidos sintéticos con tasas y totales aleatorios.
   `npm run verify:dashboard-revenue` permite volver a comprobarlo en cualquier
   momento. Donde difieran, la versión SQL es la **más** correcta.

10. **`/api/coupons` trunca a 500 filas.** Si una tienda llegara a superarlo, la UI
    lo avisa pero la pantalla necesitaría paginación real. Se ha priorizado cerrar
    la consulta sin cota frente a construir una paginación que ninguna tienda real
    va a usar.

11. **La base de pruebas `mundotech_perf` queda creada en el servidor.** Es una
    base separada, sembrada con datos sintéticos, que **nunca** se toca desde la
    aplicación (sólo desde los scripts, y con la guarda de nombre). Puede
    eliminarse con `DROP DATABASE mundotech_perf` cuando ya no se necesite.

12. **La navegación del inventario es Anterior/Siguiente, no salto directo a una
    página.** Es la contrapartida natural de la paginación keyset, que a cambio da
    coste constante y orden estable. Se conserva el indicador «X–Y de N · Página P
    de T» para que el operador sepa siempre dónde está.

---

## Cómo reproducir las mediciones

```bash
# 1. Crear y sembrar una base de pruebas (NUNCA producción; el script lo verifica)
createdb mundotech_perf
PERF_URL="postgresql://USUARIO:CLAVE@127.0.0.1:5432/mundotech_perf"
DATABASE_URL="$PERF_URL" DIRECT_URL="$PERF_URL" npx prisma migrate deploy
PERF_DATABASE_URL="$PERF_URL" npm run perf:seed -- --products 5000 --orders 20000 --reviews 5000

# 2. Medir la carga real del inventario y la integridad de la paginación
DATABASE_URL="$PERF_URL" DIRECT_URL="$PERF_URL" npm run verify:inventory-scale

# 3. Comprobar la equivalencia de los ingresos del dashboard
DATABASE_URL="$PERF_URL" DIRECT_URL="$PERF_URL" npm run verify:dashboard-revenue

# 4. Suite completa
npm run typecheck && npm run lint && npm test && npx next build
```
