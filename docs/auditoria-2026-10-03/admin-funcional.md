# Auditoría funcional del panel administrativo — 3 de octubre de 2026

## Alcance y evidencia

Revisión de código de todas las pantallas de `app/admin`, componentes administrativos, acciones y contratos de API relacionados, modelo Prisma y scripts de despliegue/crontab. No se modificó código de aplicación, no se enviaron correos ni se borraron objetos R2. No se encontraron archivos `AGENTS.md` dentro del repositorio.

El agente principal recorre el navegador con una base de datos local aislada. Este informe distingue reproducción ejecutada de evidencia de código y condiciones futuras. La instalación real del crontab, el estado de backups y el CDN de producción no fueron inspeccionados: los problemas operativos se refieren al despliegue definido en este repositorio.

La prueba [reproducciones-admin.mjs](./reproducciones-admin.mjs) extrae y ejecuta los schemas, helpers y callbacks reales con TypeScript; utiliza respuestas HTTP y Prisma simuladas únicamente para reproducir fallos sin efectos externos. Se ejecuta con `node docs/auditoria-2026-10-03/reproducciones-admin.mjs`. Su salida está en [reproducciones-admin.json](./reproducciones-admin.json). PostgreSQL local confirmó, mediante SELECT sin escrituras, que `1.234::numeric(6,2)` almacena `1.23`.

Severidad: **Alta** = riesgo de integridad de datos persistidos o recuperación operativa; **Media** = una función queda bloqueada, pierde un borrador o produce información incorrecta; **Baja** = inconsistencia localizada de presentación. No se identificó un hallazgo crítico autónomo dentro de este alcance; autenticación, pagos y pedidos transaccionales se auditan en informes separados. Clasificación revisada: 9 altas (incluida Cashea condicional), 17 medias y 2 bajas.

## Catálogo e integridad

### ADM-01 — Alta — Renombrar una categoría separa los productos de su categoría pública

- Evidencia: `app/api/categories/[id]/route.ts:55-79` actualiza únicamente `Category.name/slug`; `prisma/schema.prisma:30` conserva la categoría de cada producto como string. `lib/catalog-cache.ts:165-187` filtra productos por el **nombre nuevo** de la categoría.
- Reproducción: categoría «Accesorios» con productos `Product.category='Accesorios'`; cambiar su nombre a «Accesorios y cables» en Categorías. La API guarda el nombre nuevo, pero los productos conservan el antiguo; la categoría pública pasa a tener cero productos. El contador administrativo también cae a cero (`app/api/categories/route.ts:45-59`). El redirect de slug no resuelve la separación por nombre.
- Impacto: catálogo inaccesible desde navegación por categoría y categorías duplicadas si luego se edita un producto con el nombre antiguo o se ejecuta sincronización.
- Corrección: asociar productos mediante `categoryId`, o renombrar todos los `Product.category` coincidentes en una transacción con la categoría y sus redirects; invalidar también `catalog`.
- Estado: ejecutado el PUT real con Prisma simulado: categoría nueva «Accesorios y cables», producto «Accesorios», filtro público sin correspondencia. No se renombró una categoría de producción.

### ADM-02 — Alta — Editar descripción o fotos repone stock que otra venta ya consumió

- Evidencia: el modal carga stock absoluto (`app/components/AddProductModal.tsx:392,1237`); `updateProductAction` lee stock actual, pero persiste `...rest` con el stock antiguo recibido, sin versión ni comparación (`app/actions/productActions.ts:405,419,434-438`).
- Reproducción ejecutada con función real y Prisma simulado: abrir producto con stock 3; una compra deja BD en 2; cambiar solo descripción y guardar. La acción devuelve éxito y escribe stock 3. Resultado en JSON: `stockInDbAfterSale:2`, `stockWrittenByDescriptionEdit:3`.
- Impacto: sobreventa y desajuste entre inventario físico y panel. La transacción Serializable de la categoría no detecta que la fotografía del formulario quedó obsoleta antes de iniciar la transacción.
- Corrección: enviar únicamente campos modificados; exigir versión/`updatedAt` al modificar stock y mostrar conflicto; ajustes de stock mediante movimientos con delta y motivo.

### ADM-03 — Alta — Guardados simultáneos de tienda y pagos revierten cambios del otro dominio

- Evidencia: `app/actions/settingsActions.ts:134-157,207-234` y `app/api/settings/general/route.ts:27-41`, `app/api/settings/financial/route.ts:27-41` leen `store_settings`, mezclan su dominio y escriben el JSON completo. `lib/data-store.ts:232-237` hace upsert sin lock/versión.
- Reproducción: A y B leen S0; A guarda teléfono nuevo; B guarda cuenta bancaria nueva basado en S0 después de A. B vuelve a escribir el teléfono antiguo aunque su formulario no lo editó. Invertir orden restaura las cuentas bancarias antiguas.
- Impacto: destino de pagos o contacto cambia silenciosamente por concurrencia normal entre operadores; ambos ven éxito.
- Corrección: separar registros por dominio, o hacer lectura/merge/escritura con bloqueo de fila o comparación de versión dentro de una transacción y reintento controlado.
- Estado: ejecutadas ambas acciones reales con schemas de dominio reales y almacenamiento simulado; dos lecturas simultáneas de S0 conservan banco nuevo pero restauran teléfono original. La validación combinada y los helpers DTO se simulan para aislar el mecanismo de escritura.

### ADM-04 — Alta — Cerrar mientras se guarda elimina videos que el guardado referencia

- Evidencia: `app/components/AddProductModal.tsx:721-730` borra todos los videos subidos de la sesión al cerrar; X del encabezado (`813`), fondo (`795-797`) y Escape (`327`) permiten cerrar durante `isPending`. Solo el botón inferior Cancelar está deshabilitado (`1347`). La lista de videos de sesión se limpia al confirmar éxito (`1037`). `app/api/upload-video/route.ts:252-276` elimina activos sin consultar referencias en `ProductMedia`.
- Reproducción: subir un video nuevo, Guardar, cerrar con X/Escape mientras la petición está en vuelo. `DELETE /api/upload-video` y `updateProductAction` compiten; el producto puede persistir un video cuya URL se eliminó.
- Impacto: video/póster rotos y pérdida de un archivo que el usuario cree publicado.
- Corrección: bloquear todos los cierres mientras se guarda; antes de borrar un video comprobar que no está vinculado; manejar subidas como recursos temporales reclamados atómicamente por el producto.
- Estado: confirmado por cadena de código, sin borrar R2 en la auditoría.

### ADM-05 — Media — Productos sin fotos o con placeholder no pueden guardarse

- Evidencia: `lib/product-media.ts:20-34` produce `['/placeholder-product.png']` sin medios; el modal lo envía (`app/components/AddProductModal.tsx:1024-1025`); `productSchema.imagesJson` exige URLs absolutas (`app/actions/productActions.ts:136-142`). Importación CSV, en cambio, crea legítimamente ese placeholder (`711-713`).
- Reproducción ejecutada: galería vacía produce placeholder y schema rechaza `imagesJson[0]` con «URL de imagen inválida». El agente principal reprodujo en navegador la creación sin foto; evidencia `evidencia/producto-sin-foto.png`.
- Impacto: crear sin imágenes falla pese al fallback previsto; productos creados por CSV con placeholder no admiten edición sin subir una imagen real.
- Corrección: unificar validación de medios permitiendo rutas internas verificadas y URLs del CDN; enviar lista vacía y dejar generar fallback al servidor.

### ADM-09 — Media — Importar una categoría nueva por CSV no crea su registro editorial

- Evidencia: `app/actions/productActions.ts:832-855` escribe `category` directamente en productos. El flujo normal sí llama a `ensureProductCategory` (`287,432`); importación no lo hace. La navegación lee registros `Category`, y `resolveCategoryPathFromProductCategory` vuelve a `/productos` si no encuentra correspondencia (`lib/resolve-category-path.ts:25-57`).
- Reproducción: importar SKU nuevo con category «Audio profesional» cuando no existe `Category` con ese nombre. Producto existe y aparece en inventario/catálogo completo, pero no se crea categoría/navegación pública.
- Impacto: importación exitosa deja catálogo inconsistente; requiere la herramienta de reparación manual para completar lo que el flujo normal promete.
- Corrección: normalizar y asegurar categoría en la misma transacción CSV, usando el helper canónico y su control de colisiones.

### ADM-10 — Media — El precio importado por CSV conserva metadatos de precios anteriores

- Evidencia: CSV actualiza `price` pero no `cost`, `profitMarginPct`, `priceBaseFactor` ni `originalPrice` (`app/actions/productActions.ts:834-840`). Edición completa recalcula desde costo/margen (`383-399`); recálculo usa base factor anterior (`1109-1113`).
- Reproducción: producto manual con base 1.5; cambiar factor global a 2; importar precio 100 que se fijó con factor 2. El siguiente recálculo lo cambia a 133.35 por base 1.5. Producto con costo/margen existente puede recuperar otro precio al editar solo descripción. Una oferta anterior puede permanecer tachada al importar un precio no promocional.
- Impacto: resultado CSV aparentemente correcto deja estado de precios incoherente y cambios futuros inesperados.
- Corrección: definir y mostrar política CSV: precio manual calibrado al factor vigente y retiro explícito de oferta, o importar todos los metadatos coherentes; no dejar una combinación implícita.

### ADM-11 — Alta — Recalcular con el mismo factor puede inflar precios repetidamente

- Evidencia: `pricingParamsSchema` acepta factor con cualquier precisión (`app/actions/configActions.ts:55-58`); `Product.priceBaseFactor` es Decimal(6,2) (`prisma/schema.prisma:27`); recálculo usa `factor/base` (`app/actions/productActions.ts:1109-1113`) y escribe base con cast a dos decimales (`1152`).
- Reproducción ejecutada: guardar factor 1.234 (válido); base persistida 1.23; producto manual 100. Recálculo repetido sin cambiar configuración produce **100.35 → 100.70 → 101.05**. PostgreSQL confirmó el truncamiento de precisión por redondeo a 1.23.
- Agravantes: edición rápida solo actualiza `price` (`959-962`), conserva base antigua; y la confirmación/ayuda de Configuración dice que los productos manuales «no se tocan» (`app/admin/settings/PricingSettingsPanel.tsx:94,199-200`), pero el código sí los reescala.
- Impacto: una operación repetible de administración cambia precios sin que cambie la tasa; se conserva la base incoherente y cada ejecución aumenta otra vez el precio.
- Corrección: elegir precisión única para factor global/base; normalizar antes de calcular y persistir; recalcular de forma idempotente; calibrar base al fijar precio manual y corregir confirmación. Prueba obligatoria: dos recálculos consecutivos con el mismo factor no cambian el segundo resultado.

### ADM-20 — Media — Un guardado rechazado borra campos del formulario

- Evidencia: `app/components/AddProductModal.tsx:1005-1055` usa `<form action={async...}>` y dispara `startTransition` sin esperar el resultado en esa función action. Nombre/descripción/stock/marca/SKU son inputs no controlados (`1061,1067,1237,1262,1272`). React resetea los campos no controlados cuando la action termina; un retorno `{success:false}` no conserva automáticamente el formulario.
- Reproducción de navegador por el agente principal: completar creación sin foto, Guardar, cerrar alert «URL de imagen inválida». Nombre/descripción/stock quedan vacíos; costo/margen/categoría controlados permanecen. El guardado no produjo producto.
- Impacto: se pierde el borrador por cualquier fallo de validación/DB, incluyendo errores comunes de SKU duplicado. El reset se dispara antes de conocer el resultado porque la action no espera la operación. Esta reproducción demuestra pérdida de trabajo en el formulario; no demuestra pérdida de datos ya persistidos.
- Corrección: esperar realmente la acción y conservar estado en errores; preferir `onSubmit` controlado o `useActionState` con conservación explícita de valores; resetear únicamente después de éxito.

### ADM-23 — Media — La UI admite imágenes de dominios que Next/Image rechaza

- Evidencia: modal ofrece pegar `https://ejemplo.com/imagen.jpg` (`app/components/AddProductModal.tsx:959-975`); `imagesJson` y `gallerySlotSchema` aceptan dominios arbitrarios (`app/actions/productActions.ts:41-58,136-142`), CSV también (`710-713`). Banners/promos aceptan cualquier https mediante `isSafeEditableImageUrl` (`lib/safe-link.ts:78-89`). `next.config.mjs:20-44,142` solo permite hostname R2 en `remotePatterns`.
- Reproducción ejecutada: producto e imagen editable aceptan `https://ejemplo.com/imagen.jpg`; en desarrollo el agente principal observó excepción de Next/Image con CDN de fixture no configurado. La implementación instalada confirma que la excepción de hostname está dentro de `NODE_ENV !== 'production'` (`node_modules/next/dist/shared/lib/image-loader.js:57,91-96`). El script aislado ejecuta el loader real: desarrollo lanza; producción genera la URL `/_next/image` sin lanzar. `ImageOptimizerCache.validateParams(...,false)` rechaza el host con `errorMessage:'"url" parameter is not allowed'` (`node_modules/next/dist/server/image-optimizer.js:597-599`), y `next-server.js:202-205` convierte ese resultado en HTTP400.
- Impacto: imágenes rotas en las vistas que usan Next/Image en producción; excepción del render en desarrollo. No se demostró que este caso derribe la página completa en producción. La categoría ya usa un saneador correcto que puede reutilizarse.
- Corrección: una única allowlist servidor/cliente coincidente con `remotePatterns`, o importar la imagen a R2 antes de asociarla. Sanear también registros antiguos al renderizar.

### ADM-24 — Alta — Reemplazar una imagen borra un recurso que otro producto puede compartir

- Evidencia: `cleanupRemovedProductMedia` (`app/actions/productActions.ts:172-197`) borra URL de R2 retirada del producto sin consultar referencias de otros productos/medios. CSV acepta `imageUrl` ya existente y lo asocia a nuevos productos (`851-854`).
- Reproducción condicionada: exportar A; crear B con la misma imageUrl de A mediante CSV; sustituir imagen de A. El cleanup elimina el objeto compartido y B conserva una URL rota. También pueden quedar referencias antiguas en snapshots de pedidos que almacenaron esa URL.
- Impacto: modificar un producto perjudica a otros y puede deteriorar el historial visual.
- Corrección: no eliminar físicamente al quitar una asociación; purga posterior de objetos no referenciados con periodo de gracia, o copiar activos al asignarlos a otro producto.
- Estado: contrato y ausencia de control de referencias confirmados; no se ejecutó borrado R2.

## Pedidos, formularios y contenido

### ADM-06 — Media — No se puede seleccionar un transportista personalizado

- Evidencia: `app/components/admin/ShipOrderDialog.tsx:159-174`: al elegir `__custom__`, `onChange` retorna antes de cambiar `trackingCarrier`; el input personalizado se muestra solo si ese estado indica personalizado.
- Reproducción ejecutada de callback real: seleccionar «Personalizado…» desde valor vacío; estado sigue vacío y no aparece input. Ocurre también desde un transportista estándar. Solo se puede editar un nombre personalizado que ya venga guardado.
- Corrección: representar modo personalizado por separado del nombre; al seleccionarlo activar ese modo, enfocar input y no guardar el sentinel como nombre.

### ADM-07 — Media — Banners informa mediante su estado visual cambios que el servidor rechazó

- Evidencia: `app/admin/banners/page.tsx:183-195` no revisa `response.ok` en Delete/Toggle y modifica array local igualmente; Save lanza sin catch/feedback (`156-180`); carga transforma HTTP error en lista vacía (`116-120`). Gestor Home omite validación de HTTP en guardar categoría/promo (`app/admin/home-manager/page.tsx:202-230`).
- Reproducción ejecutada con callback real: DELETE devuelve 500; UI elimina banner de la lista. Al recargar reaparece. Toggle 403/422/500 cambia badge aunque banner público conserva estado anterior. Guardar título por encima del límite rechaza sin error útil en pantalla.
- Impacto: el operador cree haber retirado/publicado contenido; cambios no llegan a la tienda y la UI oculta causa.
- Corrección: confirmar HTTP/contrato antes de modificar estado; errores persistentes visibles y reintento; toggles parciales con control de concurrencia.

### ADM-08 — Media — Un error de validación de categoría causa un crash de React

- Evidencia: categorías POST/PUT devuelven `{error: parsed.error.flatten()}` (`app/api/categories/route.ts:81`, `[id]/route.ts:50`); el diálogo usa `onError(err.error)` como string (`app/admin/categories/page.tsx:237-239`), y feedback lo renderiza directamente (`134`).
- Reproducción ejecutada: nombre de 81 caracteres es aceptado por input sin maxLength, servidor retorna objeto `{formErrors,fieldErrors}`; React renderToStaticMarkup lanza «Objects are not valid as a React child». También ocurre con orden negativo o ID Google inválido.
- Impacto: una validación habitual deja la pantalla de categorías en límite de error y pierde contexto de edición.
- Corrección: respuesta con `message:string` y errores por campo; normalizar mensajes en cliente; reflejar límites y validación antes de enviar.

### ADM-12 — Media — Crear y editar banners/promos tienen contratos incompatibles

- Evidencia: POST admite ruta interna de imagen (`app/api/banners/route.ts:27-32`, promociones `16-21`); PUT exige URL absoluta (`app/api/banners/[id]/route.ts:40`, promociones `[id]/route.ts:14`). Límites también difieren: título banners 160 vs 200, URL 600 vs 500, promociones orden 99 vs 9999.
- Reproducción ejecutada: `imageUrl:'/banners/hero.png'` crea banner y falla al editar; equivalente en promo. Un registro aceptado por una operación no es válido para la otra.
- Corrección: reutilizar schema base canónico, derivando create/update/patch y manteniendo límites iguales. Combina con ADM-23 para definir imágenes válidas.

### ADM-13 — Media, condicional — Fechas de cupones se desplazan si servidor y navegador usan zonas distintas

- Evidencia: UI convierte ISO a hora local (`app/admin/coupons/page.tsx:12-19`), luego envía `datetime-local` sin offset (`262-263`). `lib/coupons.ts:29-33` usa `z.coerce.date`, que interpreta esa cadena en zona del servidor.
- Reproducción ejecutada sin DB: input Caracas «2026-10-03T18:00» se almacena como 18:00Z con proceso UTC, en vez de 22:00Z. Cuatro horas de diferencia. Abrir y guardar repetidamente en zonas diferentes desplaza nuevamente el horario.
- Límite: no reproduce si servidor y navegador comparten America/Caracas; no se verificó TZ del proceso productivo.
- Corrección: enviar `new Date(localValue).toISOString()` o horario de Caracas con offset explícito; mostrar zona de referencia.

### ADM-14 — Baja — Eliminar cupón usado dice que se destruye historial, pero la API solo lo desactiva

- Evidencia: UI advierte pérdida del registro/historial y muestra «Cupón eliminado» (`app/admin/coupons/page.tsx:71-80`). API responde `{softDeleted:true,message:...}` y conserva registro (`app/api/coupons/[id]/route.ts:163-171`). UI no lee respuesta.
- Reproducción: eliminar un cupón usado; reaparece en lista como inactivo, pese al mensaje y confirmación de eliminación permanente.
- Corrección: leer `softDeleted/message` y ofrecer «Desactivar» para usados; mostrar confirmación coincidente con comportamiento real.

### ADM-15 — Media, crecimiento futuro — A partir de 500 cupones los más antiguos quedan fuera de administración

- Evidencia: GET solo entrega 500 nuevos sin cursor/búsqueda (`app/api/coupons/route.ts:19-32`); aviso recomienda «Archiva» (`app/admin/coupons/page.tsx:174`) pero no hay acción de archivo ni paginación. Cupones usados solo se desactivan y continúan ocupando la lista.
- Reproducción condicionada: crear 501 cupones; el más antiguo, incluso activo, no puede encontrarse ni editarse en la UI. Desactivar recientes no reduce filas; eliminarlos usados tampoco.
- Corrección: paginación y búsqueda por código/estado, separando archivo por filtro y conservando historial.

### ADM-16 — Media — Accesibilidad administrativa incompleta en diálogos y tabla

- Evidencia: categorías (`app/admin/categories/page.tsx:244`), cupones (`app/admin/coupons/page.tsx:288`), banners (`app/admin/banners/page.tsx:353`) y respuesta de reseña (`app/admin/reviews/page.tsx:455`) no declaran dialog/aria-modal ni gestionan trampa/restauración de foco/Escape. Labels no asociados con inputs en esos formularios. DataTable checks carecen de nombre accesible (`components/admin/DataTable.tsx:188,254,290`); filas de pedidos desktop solo tienen onClick, sin control enfocable (`283-285`).
- Adicional: combobox de producto selecciona opciones solo mediante `onMouseDown`, carece de selección por Enter/flechas (`app/components/AddProductModal.tsx:145-201`); sus botones no tienen onClick funcional para teclado. La tarjeta móvil interactiva de DataTable envuelve selección/acciones dentro de un `<button>` (`components/admin/DataTable.tsx:170-210`), generando controles interactivos anidados cuando hay acciones o checkbox.
- Reproducción por contrato DOM: recorrer diálogo con Tab alcanza elementos del fondo; lector no anuncia campos/selección; teclado no abre detalle desde una fila desktop. El modal de producto/envío sí tiene infraestructura compartida para reutilizar.
- Corrección: aplicar componentes de diálogo y hooks existentes, labels/ids, nombres para checkboxes y links/botones explícitos; patrón combobox de teclado completo. Validar axe y recorrido manual teclado en todas las pantallas.

### ADM-17 — Media — Una búsqueda anterior puede sustituir resultados nuevos en estanterías

- Evidencia: `app/admin/home-manager/ShelvesEditor.tsx:184-205` cancela el timeout pero no el fetch ya iniciado; no hay AbortController ni contador de petición. `loadSelectedDetails` también escribe respuestas sin guard (`148-166`).
- Reproducción con latencia: escribir «iphone», esperar inicio, cambiar a «cable»; respuesta iphone tarda más y llega después. Input dice cable pero resultados muestran iphone; borrar búsqueda también puede volver a poblar hits cuando llega la anterior.
- Impacto: seleccionar producto equivocado al administrar destacados, estado de cargando engañoso.
- Corrección: abortar fetch y usar secuencia para descartar resultados obsoletos; aplicar lo mismo a detalles seleccionados.

### ADM-18 — Baja — Stock 3 está en filtro «bajo» pero no en contador/badge «bajo»

- Evidencia: filtro SQL `stock <= threshold` (`lib/products/admin-product-query.ts:106`), contador `stock < threshold` (`185`), badge/acento `<3` (`app/admin/products/page.tsx:80,622`), dashboard también `<3` (`app/actions/adminDashboardActions.ts:174`).
- Reproducción: con stock 3 y umbral 3, filtro «bajo» lo incluye pero contador puede mostrar cero y fila no tiene badge de stock bajo.
- Corrección: definir una única regla `<` o `<=` en consulta, contador, dashboard y UI; prueba explícita del valor frontera.

### ADM-19 — Media — Analítica subcuenta pendientes y sobreestima ganancia

- Evidencia y reproducción ejecutada:
  - `pendingVerifyCount` usa `find` de uno de dos estados, no suma (`app/admin/stats/page.tsx:166`): 9 pendientes + 4 Binance produce **9**, esperado 13.
  - Ganancia suma ingresos de todas las unidades y costo cero para las desconocidas (`151-160`), aunque texto asegura que «el margen las ignora» (`458`): ingresos 100 con costo 50 + ingresos 100 sin costo produce ganancia **150 y margen 75%**; ignorar unidad sin costo da 50 y 50%.
  - Usuario ANALYTICS sin CATALOG recibe 403 al leer costos (`app/api/admin/product-costs/route.ts:29`); el catch solo loguea (`app/admin/stats/page.tsx:123-128`) y la UI usa costo cero, pudiendo indicar 100% de margen.
  - Ganancia se calcula únicamente sobre `topProducts` limitado a 20 (`app/api/admin/stats/route.ts:308`), sin explicar ese alcance en la tarjeta de ganancia (`stats/page.tsx:440-458`).
- Impacto: decisiones operativas/financieras basadas en conteos y margen equivocados.
- Corrección: sumar estados; separar ingresos con/sin costo y mostrar «no disponible» al fallar autorización; cálculo agregado servidor con alcance explícito y costos históricos si se requiere rentabilidad real.

### ADM-21 — Media — Cambiar filtros durante «Cargar más pedidos» bloquea la paginación

- Evidencia: `app/admin/orders/page.tsx:153-174` activa loadingMore y solo lo limpia si `requestId` sigue vigente; `fetchFirstPage` incrementa id y nunca resetea loadingMore (`122-149`).
- Reproducción ejecutada del callback real: iniciar cargar más, incrementar id como hace el cambio de filtro, resolver respuesta antigua. `loadingMore` queda **true** incluso tras terminar petición. Si el nuevo filtro tiene más de 50 pedidos, botón permanece «Cargando…» deshabilitado (`469-472`).
- Corrección: resetear estado al iniciar primera página y abortar petición anterior; separar secuencias/cargas para evitar que una limpieza obsoleta bloquee o afecte la actual.

### ADM-22 — Media — Fallos de red/carga quedan como listas vacías o botones bloqueados

- Evidencia: Cupones (`app/admin/coupons/page.tsx:46-61`), Reseñas (`app/admin/reviews/page.tsx:66-83`) y Usuarios (`app/admin/settings/users/UsersClient.tsx:97-111`) no muestran errores al rechazar fetch/action; estado inicial puede parecer cero registros. Responder reseña (`app/admin/reviews/page.tsx:442-451`) marca saving y lo restaura solo después de await: un fetch rechazado deja el botón ocupado. Personalizar/anuncios dejan loading=true al rechazar lectura (`app/admin/personalizar/page.tsx:82-86`, `settings/announcement/page.tsx:17-19`).
- Reproducción: desconectar red o caducar sesión durante carga/guardado; vista no comunica fallo o respuesta de reseña queda guardando hasta cerrar/recargar.
- Corrección: catch/finally en cada operación, mensaje persistente/reintento y diferenciación entre cero resultados y fallo de lectura. Evitar resetear datos en errores y conservar borradores.

## Despliegue y recuperación

### OPS-01 — Alta — El crontab definido no ejecuta los backups que la documentación promete

- Evidencia: `deploy/crontab.vps:15-27` programa siete trabajos, ninguno `backup-postgres.sh`. `README.md:332-352` afirma que el backup diario se instala automáticamente. `scripts/install-crontab.sh:36` **reemplaza todo** el crontab root por ese archivo; el backup del crontab anterior no conserva ejecuciones activas.
- Reproducción no destructiva: inspección de fuente y script de evidencia devuelve `backupScheduled:false`. Si el backup se programó manualmente en root, ejecutar el instalador elimina esa entrada.
- Impacto: nueva instalación queda sin backup programado; actualizar schedule puede dejar tienda existente sin recuperación reciente aunque la guía diga lo contrario.
- Corrección: incluir y probar schedule del backup, o servicio/timer independiente explícito; gestionar bloque propio de crontab conservando otros trabajos; probar restauración desde el bucket privado y alertar por timestamp viejo.
- Límite: no se inspeccionó crontab real de producción; no se afirma ausencia de backups allí.

### OPS-02 — Alta, condicional — Activar Cashea no programa su reconciliación/expiración

- Evidencia: existe `app/api/cron/cashea-reconcile/route.ts`, cuya cabecera declara alta pendiente (`46-48`); `deploy/crontab.vps` no tiene esa invocación y Vercel schedule está vacío. Resultado script `casheaScheduled:false`.
- Reproducción condicionada: instalar fuente de crontab y habilitar Cashea; pedidos RETURNED/VERIFYING que necesitan reintento y reservas vencidas no pasan por el proceso automático descrito.
- Impacto: pedidos quedan pendientes y reservas con stock retenido requieren intervención; el fallo aparece al activar la integración. Contrato/proveedor de pagos se aborda en informe de pedidos.
- Corrección: incorporar schedule y prueba integral de reconciliación/expiración antes de habilitar flag; validar métricas de última ejecución.

### OPS-03 — Alta — Un fallo al arrancar el servicio evita el rollback prometido

- Evidencia: `scripts/deploy-vps.sh:17` usa `set -e`; después de detener/mover builds, `sudo systemctl start "$SERVICE"` se ejecuta fuera de condición (`99`), antes del bloque de rollback (`111-120`).
- Reproducción: `systemctl start` devuelve no cero tras swap (servicio inválido, fallo de arranque/puerto/permiso). Bash termina inmediatamente; nunca llega a health check ni restaura `.next-previous`.
- Impacto: despliegue fallido deja servicio caído aun cuando existe build previo recuperable.
- Corrección: manejar start fallido explícitamente y ejecutar un rollback común; trap de error desde stop/swap, validando que build anterior existe y registrando fallo.
- Estado: confirmado por flujo de Bash; no se detuvo un servicio real.

### OPS-04 — Media — Health de base de datos fallido puede considerarse despliegue sano

- Evidencia: condición de despliegue (`scripts/deploy-vps.sh:104`) acepta `/api/health` **o** HEAD de `/`. Health devuelve 503 si DB está caída (`app/api/health/route.ts:54-60`), pero portada cacheada/estática puede responder 200.
- Reproducción: health503 por BD; HEAD portada200. Condición OR marca healthy1 y publica despliegue exitoso aunque consultas/checkout no funcionen.
- Corrección: exigir health del servicio y validar campos; distinguir fallo transitorio con reintentos del caso que requiere rollback/alerta. No usar home ISR como sustituto de disponibilidad de DB.

## Cobertura por pantalla y límites

| Pantalla / flujo | Revisado | Resultado / límite |
|---|---|---|
| Mostrador / dashboard | KPIs, conteos, alertas, links y query agregada | Diferencia umbral stock ADM-18; lectura banco-config solo existencia puede no significar cuentas completas (recomendación). |
| Productos / inventario | Listado paginado, filtros URL, edición inline, detalle, altas, edición, galería imagen/video, CSV export/import, visibilidad, eliminación | ADM-02,04,05,09,10,11,18,20,23,24. No se ejecutó R2 DELETE ni correo de reposición. |
| Categorías | Lista/conteos, CRUD, slug, SEO, imagen Google category, sync | ADM-01,08,16. Reemplazo de nombre necesita migración transaccional. |
| Pedidos listado/detalle/etiqueta | UI, búsqueda/cursor/selección masiva, estado/tracking/notas, impresión | ADM-06,16,21. Estado/pagos/reintentos/stock transaccional en informe separado. |
| Cupones | CRUD, fechas locales, activación, eliminación/historial, límite | ADM-13,14,15,16,22. Slots/reversiones y financieros en informe de pedidos. |
| Reseñas | Paginación, moderación, auto-aprobar, foto/detalle, respuesta | ADM-16,22. No se publicó una reseña real ni cambió auto-aprobación real. |
| Banners | Lista, filtros/tipos, imagen/foco, CRUD, activo, orden | ADM-07,12,16,23. |
| Gestor Home | Categorías, ofertas, beneficios, flash, estanterías/destacados/categorías, franja envío gratis | ADM-07,17,23; FreeShippingEditor tiene manejo explícito de HTTP/error. No se verificó proveedor de medios. |
| Personalizar sitio | Hero fallback, marca, WhatsApp, trust badges, popup, guardado | ADM-22; datos inicialmente fallback pueden esconder fallos de configuración (recomendación). |
| Barra de anuncios | Preview, texto/link/colores/activo, lectura/escritura | ADM-22 y recomendaciones de borrador/error/contraste. |
| SEO Local | Datos/horarios/mapa y save schema | Recorrido código; geolocation bloqueada por Permissions-Policy la documenta agente principal; no duplicada aquí. |
| Tienda / Pagos / Precios | Formatos, schemas/DTO, formularios y errores por campo, presets/estimados, cambios de tasa/factor/recalcular | ADM-03,11; menú recálculo visible FINANCIAL_SETTINGS pero action requiere CATALOG (coordinado con auditoría RBAC). |
| Usuarios / clientes / permisos | Listado paginado/búsqueda/staff, creación, password reset, delete, modal permisos, log | ADM-16,22; restricciones de conservación de historial existentes. Auth/guards en informe separado. |
| Menú / shell / móvil / tablas | Nav por permisos, shell y tablas responsive | ADM-16; tablas evitan doble DOM y consultas grandes. Labels active ruta settings-users pueden usar genérico por startsWith (recomendación menor). |
| Variantes / ventas manuales | Búsqueda de rutas/modelos/navegación | No existen pantallas/modelos de variantes o venta manual administrativa en el repositorio actual; no se reportan como bugs de una función existente. Hay pedido WhatsApp y validación manual de pago. |
| Crons/despliegue/backups | Fuente schedule, wrappers, install, deploy/health y documentación | OPS-01..04; servidores/proveedor real sin inspección. |

La suite general reportada por el agente principal pasó 625 pruebas; typecheck/guards también pasaron. Eso no cubre estos estados: fuente actual carece de regresiones relevantes para renombrado de categoría y compras concurrentes durante edición, concurrencia de settings, precisión factor/recálculo repetido, cierre durante guardado de video, creación sin foto y preservación del borrador rechazado, API editorial create/update equivalente, operación admin offline, filtros durante cargar más, límite 500 cupones y schedule obligatorio de backups/Cashea.

## Recomendaciones de cierre

1. Corregir primero ADM-01,02,03,04,11,24 y OPS-01,03 para proteger integridad/recuperación; después resolver preservación de borrador ADM-20 y contrato de imágenes ADM-23 junto con los demás fallos de operación.
2. Definir contratos únicos para categoría/media/precios y reutilizarlos en UI, Server Actions, CSV y APIs. Todo recurso persistido debe ser renderizable y mantener sus metadatos.
3. Añadir versiones/conflictos al editar entidades; separar ajustes de stock, y conservar borradores ante fallos.
4. Revisar permisos de la UI con usuarios delegados reales: ANALYTICS sin CATALOG y FINANCIAL_SETTINGS sin CATALOG; no mostrar métricas falsas ni acciones que inevitablemente rechazan.
5. Completar flujos teclado/lector y matriz offline/401/403/422/429/500 en todo panel. Evitar `alert` como único canal de errores de formulario.
6. Regresiones imprescindibles: recálculo idempotente, categoría renombrada conserva productos, stock de compra no se sobrescribe por editar descripción, settings de dominios concurrentes conservan ambos cambios, cerrar durante save no borra medio vinculado, cambiar filtro durante loadMore limpia ocupación, y smoke de crontab/restauración.

No se autorizó ni ejecutó corrección de código en este encargo: todos los hallazgos quedan listos para priorización y reproducción en staging.
