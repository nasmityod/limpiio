# Tienda pública, navegación y dependencias

Revisión iniciada el 3 y cerrada el 4 de octubre de 2026 (America/Caracas), sobre el checkout de `d0989a4`. Este anexo aporta 11 hallazgos al registro consolidado: 1 alto, 8 medios y 2 bajos. Los riesgos críticos de dependencias se enumeran aparte porque su exposición depende del entorno o de un formato de entrada cuya accesibilidad productiva no se demostró.

## WEB-01 — Medio — «Comprar ahora» puede perder la línea recién añadida

**Evidencia:** `context/CartContext.tsx:280-298,362-384`; `app/product/[slug]/ProductActions.tsx:49-52`; `app/components/checkout/CheckoutFlow.tsx:102`; el checkout WhatsApp también refresca en `WhatsAppCheckout.tsx:216`.

Añadir modifica el carrito local inmediatamente, pero el PATCH autenticado espera 400 ms. Comprar ahora navega enseguida; el checkout llama a refreshCart y sustituye el carrito por la respuesta GET de la BD. Si el GET gana al PATCH, desaparece la línea o vuelve la cantidad anterior. El PATCH posterior no vuelve a actualizar la UI.

**Reproducción ejecutada:** CartProvider original, sesión autenticada y frontera HTTP simulada. Añadir deja una línea; refrescar antes del timer deja cero; a los 400 ms se envía PATCH, mientras la UI permanece vacía. Una navegación local concreta funcionó por el tiempo de compilación/red: eso no invalida el entrelazado reproducido, pero no se afirma que todos los clics fallen.

**Impacto/corrección:** abandono de checkout y cantidad inconsistente. Vaciar o esperar la cola pendiente antes de refrescar/navegar; versionar respuestas y reconciliar mutaciones optimistas. Test de navegación rápida con PATCH lento y GET rápido. [Prueba](./storefront-evidence.test.tsx).

## WEB-02 — Medio — Una respuesta del carrito de A puede aplicarse cuando ya inició sesión B

**Evidencia:** `context/CartContext.tsx:220-276`. El efecto de sesión retorna mientras isCartLoading es true; el merge no se cancela ni comprueba el usuario al aplicar su respuesta. hasMergedRef identifica un booleano, no una cuenta.

**Reproducción ejecutada:** iniciar merge de A, cerrar sesión e iniciar B mientras esa petición está pendiente, resolver respuesta de A. El provider termina mostrando «Carrito A» con la sesión B. Se probó con el provider real y sesión/HTTP simulados. Un logout normal después de terminar el merge sí limpia el carrito; el fallo exige la carrera descrita.

**Impacto/corrección:** exposición de selección de compras y mezcla de carrito en equipos compartidos. Vincular cada merge/refresco y cola a userId y generación de sesión; abortar y descartar respuestas de una identidad anterior. La prueba no demuestra acceso a pedidos o credenciales de A. [Prueba](./storefront-evidence.test.tsx).

## WEB-03 — Medio — Ordenar el catálogo cambia qué productos existen

**Evidencia:** `lib/catalog-cache.ts:75,85-96` incluye todos los activos; `lib/products/query-products.ts:153-156` excluye agotados por defecto; `app/productos/page.tsx:149-157` cambia entre esas consultas al activar un sort/filtro.

**Reproducción en navegador local:** /productos muestra 2 productos, incluido Cargador USB con stock 0. Seleccionar «Menor precio» produce /productos?sort=price-asc y 1 producto; desaparece el agotado sin seleccionar disponibilidad. Revisado además el contrato SQL.

**Impacto/corrección:** contadores y navegación inconsistentes; un simple orden parece ocultar productos. Una política única de disponibilidad para consulta cacheada y filtrada. Test de igualdad del conjunto de IDs antes/después de ordenar sin filtros.

## WEB-04 — Medio — El catálogo pierde la etiqueta de envío gratis

**Evidencia:** `lib/product-select.ts:20` selecciona freeShipping, pero el tipo y mapper en `lib/catalog-cache.ts:34-65` lo omiten. Las tarjetas lo usan para la etiqueta; la consulta filtrada sí lo conserva (`lib/products/query-products.ts:64`).

**Reproducción ejecutada:** getCachedCatalogProducts original recibe una fila con freeShipping=true; se verifica que Prisma lo seleccionó y que la tarjeta devuelta no tiene esa propiedad. Se simulan únicamente cache/BD. También afecta categorías/ofertas que reutilizan el mapper.

**Impacto/corrección:** el beneficio aparece distinto según el camino de navegación; la línea de carrito inicial puede perder esa señal hasta refrescar. No se demostró que el servidor cobre envío incorrecto: el checkout usa datos autoritativos. Añadir propiedad al contrato común y evitar casts que oculten campos ausentes. [Prueba](./catalog-evidence.test.ts).

## WEB-05 — Medio — Una página de búsqueda fuera de rango dice que no hay productos

**Evidencia:** `lib/products/query-products.ts:226,244` obtiene total de COUNT(*) OVER en las filas paginadas; si OFFSET no devuelve filas, total se convierte en 0. `app/buscar/page.tsx:69-70,89,225` limita page por abajo, pero no recupera el total real ni la última página.

**Reproducción HTTP y navegador:** Bluetooth tiene un producto en página 1. /buscar?q=Bluetooth&page=2 muestra «0 productos encontrados» y «Sin resultados», sin paginador para volver, aunque las facetas siguen mostrando Electrónicos/TestBrand.

**Impacto/corrección:** enlaces guardados, reducción del catálogo o filtros con page antiguo producen falsos negativos. Count independiente o consulta que devuelve total incluso sin filas; redirigir/corregir una página inválida. No se atribuye el mismo fallo final a /productos: allí existe reconsulta/corrección de límites.

## WEB-06 — Medio — «Detectar mi ubicación» está bloqueado por el propio servidor

**Evidencia:** `next.config.mjs:13` envía Permissions-Policy geolocation=() a las páginas; `app/admin/settings/seo-local/SeoLocalEditor.tsx:48-65` ofrece navigator.geolocation.getCurrentPosition.

**Reproducción/estado:** botón presente en recorrido DOM y header verificado; la política impide la API incluso si el usuario concede ubicación. No se solicitó la ubicación real del usuario.

**Corrección:** permitir geolocation=(self) únicamente donde se requiere la función, con consentimiento normal del navegador, o retirar la acción y ofrecer coordenadas manuales/mapa. Comprobar con HTTPS y permisos concedidos/denegados.

## WEB-07 — Medio — La UI presenta una tasa de respaldo como tasa fresca

**Evidencia:** `app/actions/configActions.ts:26-35`, `lib/exchange-rate.ts:34-56` devuelven 36.5 cuando falta/es inválida la tasa o falla lectura; `app/api/config/exchange-rate/route.ts:24-27` responde 200 con solo rate; `context/ExchangeRateContext.tsx:84-87` marca cualquier número positivo stale=false.

**Reproducción local:** la fixture sin la fila de tasa devolvió {rate:36.5}; catálogo/PDP/checkout mostraron conversión sin advertencia de referencia, mientras el checkout estricto rechazó crear un pedido con tasa ausente. La ausencia de fila era una condición de prueba, no una afirmación sobre producción. Una publicación antigua tampoco se identifica porque la API omite fecha/origen/estado.

**Impacto/corrección:** monto orientativo engañoso y discrepancia al pagar durante incidentes/restauraciones. Retornar source, publishedAt y valid/stale; marcar respaldo explícitamente y bloquear compromisos de dinero si falta tasa válida. Mantener el rechazo seguro actual del servidor.

## WEB-08 — Bajo — Cambiar la dirección del negocio no actualiza todos los textos

**Evidencia:** `components/auth/AuthSplitLayout.tsx:107`, `app/nosotros/page.tsx:189,194`, `app/shipping-policy/page.tsx:72`, `app/opengraph-image.tsx:76`, `app/not-found.tsx:131` conservan Carrera 21/esquina calle 21, mientras Footer/SEO Local leen configuración.

**Reproducción local:** configuración E2E muestra «Dirección de prueba E2E» en footer; login mantiene Carrera 21. El riesgo aparece al mudar tienda o reutilizar marca.

**Corrección:** snapshot común del negocio para login, textos de entrega, información pública, metadatos y mapas; test que cambie dirección y compruebe todas las superficies. Las políticas requieren también revisión editorial del dueño cuando cambie la operación.

## WEB-09 — Bajo — El título móvil de Usuarios indica «Tienda y pagos»

**Evidencia:** `lib/admin-nav.ts:133-139` toma la primera coincidencia startsWith; /admin/settings aparece antes de /admin/settings/users.

**Reproducción local a 390×844:** página Usuarios con título móvil «Tienda y pagos». No se observó overflow horizontal en esa página. [Captura](./evidencia/admin-usuarios-movil.png).

**Corrección:** coincidencia de ruta exacta y luego prefijo más específico, usando delimitador de segmento.

## DEP-01 — Alto — Next instalado sigue afectado por avisos actuales; el guard da un OK obsoleto

**Evidencia local:** next 16.2.10; App Router y numerosas Server Actions. `scripts/check-security-versions.mjs:28-37,93` admite >=16.2.6 y anuncia «mínimo seguro» aunque la versión actual tiene avisos posteriores.

El aviso oficial sobre agotamiento de CPU en Server Actions afecta <16.2.11; las características requeridas están presentes. No se ejecutó un payload DoS. Actualizar dentro de una rama soportada y parcheada; los avisos revisados llegan hasta el parche 16.3.6. Corregir el guard y mantener análisis de lockfile periódico, además del mínimo fijo. [Aviso oficial Next](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj).

No ejecutar npm audit fix --force a ciegas: el resultado guardado propone incluso bajar Prisma de major para algunas transitivas. Resolver por árbol de dependencia y repetir build, integración/auth/imágenes y migraciones pertinentes.

## DEP-02 — Medio — Un Bearer malformado convierte una denegación normal en error 500

**Evidencia:** next-auth 4.24.14; `middleware.ts` llama getToken sin capturar el error de decodeURIComponent del Bearer.

**Reproducción ejecutada:** getToken original con Authorization: Bearer % lanza URIError. GET local /api/orders con ese header devuelve 500; sin sesión/header devuelve 401. No se observó caída completa del proceso. El proveedor clasifica alto el aviso general; el impacto demostrado aquí es un error por solicitud, por eso el registro local lo clasifica medio. [Aviso oficial Auth.js](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj).

**Corrección:** actualizar al parche 4.24.15 o posterior compatible y probar entradas malformadas; normalizar fallo de autenticación a 401 sin filtrar detalles.

## Dependencias: aplicabilidad y riesgos críticos condicionados

npm audit examinó el lockfile actual; las alertas son paquetes afectados, no un conteo de exploits independientes:

| Escaneo | Crítico | Alto | Moderado | Bajo | Total paquetes |
|---|---:|---:|---:|---:|---:|
| Completo | 2 | 26 | 8 | 1 | 37 |
| --omit=dev | 2 | 20 | 6 | 1 | 29 |

[JSON completo](./evidencia/npm-audit-completo.json) · [JSON omit-dev](./evidencia/npm-audit-runtime.json). Omitir dev no identifica automáticamente exposición web: Prisma CLI, plantillas de correo o herramientas de compilación también están declaradas en dependencies.

| Riesgo | Clasificación de auditoría | Condición / conclusión |
|---|---|---|
| Next RCE sobre Windows | **Crítico condicionado DEP-C01** | next16.2.10 y servidor con filesystem Windows sin Cache Components. El equipo auditado es Windows; la guía de producción usa VPS/Linux y no se inspeccionó el servidor real. No se ejecutó exploit. Actualizar antes de exponer un servidor Windows. [Aviso oficial](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36). |
| Next optimización AVIF/libheif | **Crítico condicionado DEP-C02** | Versión afectada; requiere optimizar AVIF malicioso accesible. formats=['image/webp'] define salida, no acredita que ninguna entrada AVIF pueda llegar. R2 allowlist y normalización de uploads reducen superficie, pero no se validó contenido/bucket real. No se ejecutó exploit. [Aviso oficial](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4). |
| next/og ImageResponse | **No demostrado aplicable en la implementación revisada** | La ruta local `app/opengraph-image.tsx` usa runtime=edge. El aviso excluye Edge; no atribuir su RCE de Node a esa ruta. [Aviso oficial](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j). |
| Auth email homoglyph | **No aplicable al flujo configurado** | Credentials + Google opcional, sin EmailProvider/magic link. La alerta crítica de paquete no demuestra robo por esa vía. [Aviso oficial](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh). |
| Auth cookies entre proveedores OAuth | **Exposición no demostrada** | Solo Google como proveedor OAuth opcional; no se demostró mezcla entre dos proveedores configurados. Incluido en actualización Auth.js. |
| Sharp/libvips/libheif | **Pendiente de validar superficie; actualizar** | Sharp directo y copia de Next tienen avisos. Revisar versión efectiva por rama; no duplicar DEP-C02 como si fuera otra explotación confirmada. |
| PostCSS/Tailwind/globs/Browserslist | **Riesgo principalmente de herramienta/entrada no probada** | No existe un editor de CSS arbitrario público demostrado. Actualizar con compatibilidad, sin atribuir lectura de archivos o DoS remoto a una alerta transitiva por sí sola. |
| Prisma/Hono/MySQL2/config | **Riesgo de herramienta; vector remoto no probado** | La aplicación usa PostgreSQL; no se demostró un MySQL server malicioso ni consola Prisma dev expuesta. |
| Axios/Undici/Socket.IO/otros | **Triage de árbol pendiente tras upgrade** | No se demostró exposición de todos los adaptadores/interceptores/servidores de esos paquetes. JSON conserva cada aviso para revisión; paquetes no equivalen a funciones utilizadas. |

Los dos riesgos críticos condicionados quedan fuera del total de fallos actuales del registro. No se certifica que producción esté libre de ellos: falta comprobar entorno/entradas reales.

## Evidencia y límites públicos

El navegador local cubrió login y sesión administrativa, navegación de secciones, formulario de producto rechazado, catálogo, sort, producto, Comprar ahora/checkout, búsqueda y header móvil. La revisión estática cubre también ramas cacheadas, SEO/metadatos, políticas, carrito y tasas. No se midieron Core Web Vitals ni percentiles bajo carga; no se hizo validación WCAG completa, sandbox real de pagos, Gmail/Resend real ni pruebas multi-dispositivo físicas.

El error de host de imagen de la fixture inicial se corrigió exclusivamente cambiando imágenes de esa BD aislada a placeholder. Esa mala configuración de la fixture no se contó como una avería de producción. ADM-23 documenta separadamente el contrato real que permite persistir dominios que el optimizador rechaza.

