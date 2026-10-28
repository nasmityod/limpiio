# Auditoría de seguridad, identidad y autorización administrativa

Fecha del análisis: 3 de octubre de 2026, zona America/Caracas. Código del workspace D:\limpio. Auditoría de solo lectura del código y de servicios reales; los archivos nuevos de esta carpeta son evidencias, no cambios de aplicación.

## Alcance y método

Se revisaron la autenticación NextAuth, registro, RBAC, autorización por páginas/acciones/APIs, configuración general/financiera, pedidos/pagos, cargas y borrados R2, reseñas, exportaciones CSV, contenido editable, navegación del panel y protecciones de origen. Se ejecutaron los tres controles del repositorio de permisos, permisos de páginas y origen: todos pasaron. Su cobertura es sintáctica y no detecta los fallos de flujo descritos aquí.

Se escribieron reproducciones deterministas de rutas y callbacks originales. BD, R2, correo y sesión fueron reemplazados por dobles de prueba; ninguna reproducción envió correo, borró R2 real ni cambió datos de producción. Resultado: **11 casos pasaron en 2 archivos**.

Comando reproducible:

```powershell
npx vitest run --config docs/auditoria-2026-10-03/seguridad-admin.vitest.config.ts docs/auditoria-2026-10-03/seguridad-
```

Evidencia: [seguridad-admin.evidence.test.ts](./seguridad-admin.evidence.test.ts), [seguridad-auth.evidence.test.ts](./seguridad-auth.evidence.test.ts). Los mocks sustituyen las fronteras externas; no sustituyen la lógica vulnerable de validación, selección de permisos o rutas. Estos resultados demuestran el comportamiento del código, no que alguien ya lo haya explotado en producción.

## Hallazgos

### SEC-01 — Alto: pre-registro malicioso conserva acceso después del login Google de la víctima

**Confirmado con callback Google y login Credentials originales, aislados.**

- `app/actions/authActions.ts:89-96` crea una cuenta con correo proporcionado y contraseña sin verificar control del correo; `:100` envía bienvenida, no un token de activación.
- `app/api/auth/[...nextauth]/route.ts:113-115` hace `upsert` del usuario Google por correo y, si ya existe, actualiza únicamente el nombre. El hash de contraseña existente se conserva.
- `:67` permite posteriormente el acceso Credentials con ese hash conservado.

**Precondiciones:** login Google habilitado; la víctima aún no tiene cuenta local. El atacante conoce su correo y se registra primero. No necesita acceso al correo de la víctima.

**Reproducción:** el atacante registra victim@example.test con contraseña propia; el dueño real inicia sesión Google con `email_verified=true`; el callback entrega el mismo ID; el atacante sigue autenticándose con su contraseña inicial. La prueba confirma el mismo ID y hash antes/después de Google, y un login Credentials exitoso del atacante después de la entrada de la víctima.

**Impacto:** acceso persistente a los datos y pedidos futuros que la víctima empiece a usar en esa cuenta. Si posteriormente el propietario concede permisos al correo de ese empleado, la contraseña del pre-registrador sigue siendo válida para la misma identidad administrativa. Esta última consecuencia requiere que se concedan permisos después y no se probó contra cuentas reales.

**Corrección:** registrar estado de verificación de identidad/proveedor y evitar vincular silenciosamente un Google verificado con Credentials no verificadas. Exigir verificación del correo local antes de activar la cuenta; durante vinculación reclamar la cuenta mediante flujo explícito y revocar credenciales y sesiones del pre-registro. No basta con comprobar `email_verified` del proveedor Google.

### SEC-02 — Alto: un cliente puede provocar el borrado físico de fotos de reseñas ajenas

**Confirmado con POST seguido de DELETE originales.**

- `lib/reviews.ts:27-38` valida que la foto sea del CDN y del prefijo `reviews/`; no verifica quién la subió ni a qué reseña pertenece.
- `app/api/products/[id]/reviews/route.ts:118-126` persiste el array de URLs recibido.
- `app/api/reviews/[id]/route.ts:190-191` borra las fotos al eliminar la reseña propia. La edición también lo hace en `:138-139`.
- `lib/reviews.ts:49-54` deriva la key y ejecuta `deleteFromR2`.
- `lib/reviews.ts:101` expone públicamente las URLs de fotos aprobadas.

**Precondiciones:** cliente autenticado y una foto pública de otra reseña; no hace falta comprar ni tener permiso REVIEWS, porque una reseña PENDING también se puede crear y borrar.

**Reproducción:** copiar una URL `https://CDN/reviews/victim.webp` de una reseña pública; crear reseña propia con esa URL en photos; borrar la reseña propia. El servidor solicita borrar `reviews/victim.webp` y responde 200. La prueba confirma que nunca se exigió REVIEWS.

**Impacto:** desaparición permanente del objeto original y rotura de las reseñas de otros clientes una vez que caduque la caché CDN. También existe el caso accidental: reutilizar una foto entre dos reseñas y eliminar una rompe la otra.

**Corrección:** uploads con propietario, ID y estado de vinculación persistidos. Recibir IDs de uploads, verificar propiedad al asociarlos y borrar solo objetos propios sin otras referencias. Prefijo/host de URL no equivalen a autorización del objeto.

### SEC-03 — Alto: CATALOG puede borrar banners y QR financiero mediante la ruta de videos

**Confirmado por dos pruebas del DELETE original.**

- `app/api/upload-video/route.ts:258` exige únicamente CATALOG.
- `:37-40` solo valida forma de URL; `:50-56` convierte cualquier URL del CDN a key y la borra.
- `lib/r2.ts:218-222` admite globalmente `products/`, `banners/`, `assets/` y `reviews/`.

**Precondiciones:** operador CATALOG y URL del objeto objetivo. Banners son públicos; el QR se muestra cuando el método de pago correspondiente está disponible.

**Reproducción:** enviar DELETE `/api/upload-video` con `{ "url": "https://CDN/banners/hero.webp" }` o con `assets/binance-qr.webp`. La ruta responde 200 y ejecuta borrado de cada key después de comprobar únicamente CATALOG; nunca exige SITE_CONTENT ni FINANCIAL_SETTINGS. La URL ni siquiera tiene que ser un video o estar registrada en VideoJob.

**Impacto:** el permiso de catálogo alcanza contenido y activos financieros de otras secciones. El QR y el hero pueden quedar inutilizables; el CDN podría conservarlos temporalmente en caché, lo que no elimina el fallo de autorización sobre el objeto original.

**Superficie adicional confirmada por lectura:** `app/actions/productActions.ts:44-63` y `:137-141` admiten URLs ajenas al recurso de producto; `:149-153`, `:170-201` y `:477` limpian URLs retiradas. Agregar el banner/QR a un producto y retirarlo ofrece otra cadena hacia el mismo borrado. No se ejecutó esta segunda variante porque el DELETE directo ya demuestra el fallo.

**Corrección:** autorizar el objeto según su tipo y propietario/vinculación. Para video, aceptar ID de VideoJob/productMedia, restringir keys a products y tipos MP4/póster, impedir eliminar objetos usados por otros recursos. Aplicar la restricción también a la limpieza de galería. Una allowlist global de carpetas no reemplaza RBAC por recurso.

### SEC-04 — Alto: ORDERS permite despachar o entregar pedidos web sin validar su pago

**Confirmado por tres pruebas del PUT original: En Proceso, Enviado y Entregado con paidAt=null.**

- `app/api/orders/[id]/status/route.ts:42` exige ORDERS.
- `:59-66` no consulta `paidAt`.
- `:98-107` bloquea avances solo si `stockDeducted=false`; el checkout web reserva/descuenta inventario al crear el pedido, antes de confirmar el pago.
- `:246-258` avanza cualquier estado admitido sin exigir PAYMENTS ni pago confirmado ni transición desde Enviado para Entregado.
- `app/api/orders/bulk-status-update/route.ts:101-115` bloquea En Proceso únicamente por stock; `:172-180` actualiza el resto.

**Precondiciones:** pedido web Pendiente no pagado, stockDeducted=true; operador ORDERS. Para pedidos WhatsApp cuyo stock todavía no se descontó existe protección y esta reproducción no aplica en ese estado.

**Reproducción:** PUT a `/api/orders/ID/status` con `{"status":"Enviado"}` o `En Proceso`/`Entregado`. La ruta responde 200, conserva `paidAt=null` y comprobó solo ORDERS. No se envió correo real en las pruebas.

**Impacto:** el permiso de logística elude la aprobación de pago y puede llevar al envío de mercancía sin pago. La inconsistencias persisten: `app/actions/orderActions.ts:68-75` responde «El pago ya estaba validado» al encontrar En Proceso sin comprobar paidAt; `lib/reviews.ts` permite compra verificada cuando status=Entregado como fallback legacy.

**Corrección:** máquina de estados única, chequeo atómico de paidAt/transición válida en cada ruta individual y masiva. Separar aprobación financiera (PAYMENTS) de logística (ORDERS); stock reservado no debe equivaler a pago confirmado. Delimitar explícitamente el fallback de pedidos legacy. Coordinar este hallazgo con la auditoría de pedidos para evitar duplicarlo.

### SEC-05 — Alto: guardados concurrentes restauran cuentas de pago antiguas y pierden cambios

**Confirmado por prueba concurrente: ambas rutas devuelven 200 y el guardado general restaura Bank-A después de Bank-B.**

- `app/api/settings/general/route.ts:27-41` y `app/api/settings/financial/route.ts:27-41` leen todo settings, mezclan un dominio y sobrescriben el documento entero.
- `app/actions/settingsActions.ts:135-157` y `:208-234` repiten el patrón; son las acciones usadas por el panel.
- `lib/data-store.ts:232-237` reemplaza la cadena JSON completa sin versión/CAS/lock.

**Precondiciones:** dos administradores/pestañas guardan cerca en el tiempo, o dos cambios de dominios distintos se solapan.

**Reproducción:** ambos leen versión A; financiero guarda nueva cuenta B; general guarda nombre desde su snapshot A e incluye las cuentas A. Ambos mensajes indican éxito y la nueva cuenta bancaria desaparece. La prueba fuerza el solapamiento en lectura con una frontera de almacenamiento en memoria; reproduce el intercalado permitido por las escrituras originales.

**Impacto:** pérdida silenciosa de ajustes, restauración de cuenta bancaria/QR/porcentaje de descuento retirados. Un operador STORE_SETTINGS puede revertir accidentalmente campos FINANCIAL_SETTINGS que nunca recibió del panel: el servidor los mezcló desde un snapshot antiguo.

**Corrección:** dividir los documentos por dominios, o transacción con lock/serializable y retry leyendo dentro del lock, o control optimista con versión y rechazo409 de snapshot obsoleto. Aplicarlo tanto a APIs como a server actions y evitar usar DEFAULT_SETTINGS como base de escritura después de una lectura fallida.

### SEC-06 — Medio: el usuario con OPERATIONS como único permiso entra en bucle de redirección

**Confirmado con la página original y la selección de permisos original.**

- `lib/admin-permissions.ts:216` asigna `/admin` como home para OPERATIONS.
- `app/admin/page.tsx:15-18` redirige a home del primer permiso cuando no tiene DASHBOARD.

**Precondiciones/reproducción:** conceder únicamente OPERATIONS, autenticarse y abrir `/admin`. `getFirstAuthorizedPermission` devuelve OPERATIONS y la página redirige a la misma `/admin`; se repite hasta ERR_TOO_MANY_REDIRECTS. La prueba confirma el destino de redirección desde la propia página.

**Impacto:** la cuenta técnica tiene un permiso válido pero no puede usar su entrada al panel; tampoco existe una sección OPERATIONS en la navegación actual.

**Corrección:** home real de operaciones con su propio permiso o una página de menú accesible sin DASHBOARD. Evitar redirigir al pathname actual; añadir prueba por cada permiso individual.

### SEC-07 — Medio: los defaults válidos de tienda hacen fallar la página de configuración

**Confirmado: `pickGeneralSettingsDto(DEFAULT_SETTINGS)` lanza ZodError. Una segunda prueba muestra que un teléfono de espacios supera el PUT, se guarda como vacío y rompe el DTO de lectura posterior.**

- `lib/data-store.ts:37-49` admite teléfono/correo vacíos. El default oficial tiene `phone:''` en `:157`.
- `:214`, `:223` y `:228` devuelven los defaults cuando faltan settings, son inválidos o falla su lectura.
- `lib/settings-api-schemas.ts:33-35` exige teléfono no vacío y email válido; `:99-110` usa `.parse` sin fallback para construir el DTO de lectura.
- `app/admin/settings/page.tsx:35` lo ejecuta para STORE_SETTINGS; `app/api/settings/route.ts:51-54` lo hace para la API de lectura administrativa.

**Precondiciones/reproducción:** instalación nueva sin store_settings, JSON corrupto, caída transitoria en su lectura, o estado persistido válido con teléfono vacío. Abrir Configuración con STORE_SETTINGS; la construcción del DTO lanza antes de mostrar el formulario.

**Otra reproducción sin instalación nueva ni incidentes externos:** enviar `phone:"   "` con el resto de datos válidos. El esquema general comprueba min(1) antes de recortar; storeSettingsSchema recorta y admite el vacío. PUT responde200, guarda phone vacío y la siguiente apertura de Configuración lanza. La server action usa el mismo min(1), guarda primero y construye el DTO de respuesta después (`settingsActions.ts:164`), por lo que puede dejar el cambio persistido aunque el cliente vea un error.

**Impacto:** el administrador no puede usar el propio formulario para completar/reparar esos datos. Afecta la recuperación ante incidentes y nuevas instancias.

**Corrección:** separar DTO de lectura del esquema exigido al guardar. El DTO debe representar valores incompletos válidos y permitir editarlos. Lectura fallida debe mostrarse claramente y evitar sobrescritura ciega de defaults.

### SEC-08 — Medio: Gestor Home muestra operaciones de permisos no concedidos y oculta fallos al guardar

**Confirmado por trazado de página y rutas; reproducción de UI completa queda al coordinador.**

- `app/admin/home-manager/layout.tsx:8` requiere SITE_CONTENT; la página no recibe permisos para limitar las pestañas.
- `app/admin/home-manager/page.tsx:196-199` sincroniza categorías, cuyo handler exige CATALOG (`app/api/categories/sync/route.ts:22`); al recibir403 vacía la tabla local.
- `:205-209` guarda categoría y `:220-232` guarda promoción sin comprobar `r.ok` ni mostrar el error. PUT/POST de promociones exige PROMOTIONS.
- La lectura `:166` pide promociones inactivas, pero sin PROMOTIONS la API filtra activas y devuelve200; el editor reconstruye faltantes como nuevos defaults.

**Precondiciones/reproducción:** usuario SITE_CONTENT único entra en Gestor Home, edita categorías o promociones y guarda. Los guards rechazan403; el formulario conserva el cambio visual hasta recargar y no lo explica. Sincronizar hace desaparecer categorías del estado local.

**Impacto:** cambios aparentemente hechos nunca persistieron; operadores pueden decidir sobre contenido incompleto por permisos distintos. Es un fallo de integración de permisos y manejo de respuestas; los guards de backend funcionan.

**Corrección:** pasar permisos actuales y mostrar solo acciones autorizadas o permisos necesarios; manejar r.ok/error y conservar snapshot hasta confirmación real; no reemplazar tablas con arrays vacíos al fallar una petición.

### SEC-09 — Medio: Analítica sin CATALOG presenta ganancia/margen equivocados

**Confirmado por trazado y aritmética.**

- `app/admin/stats/layout.tsx:8` admite ANALYTICS.
- `app/admin/stats/page.tsx:118-129` consulta costos en endpoint que requiere CATALOG (`app/api/admin/product-costs/route.ts:31`); en403 solo deja un console.error.
- `:151-161` suma todos los ingresos y considera costo0 si no recibió el costo; ganancia=ingresos-costos y margen acaba100% aunque los costos sí existan en BD.
- `:445-458` muestra el resultado y atribuye el problema a «unidades sin costo registrado», cuando el error puede ser exclusivamente de autorización.

**Precondiciones/reproducción:** ANALYTICS único, productos vendidos con costo en BD. Abrir Estadísticas. La consulta de costos falla403; ganancia bruta aparece igual a ingresos y margen100%; el aviso recomienda cargar costos que ya están registrados. También aplica a error temporal del endpoint.

**Corrección:** responder ganancias agregadas desde la API ANALYTICS sin exponer costo individual reservado a CATALOG; o indicar que no hay acceso/no fue posible calcular y ocultar resultado. Tratar «dato ausente» y «error/permisos» como estados distintos. Evitar cálculos que incluyan ingresos de unidades excluidas del costo.

### SEC-10 — Bajo: la exportación de PII no deja registro del operador que exportó

**Confirmado por lectura.**

- `app/api/orders/export.csv/route.ts:13-15` declara que registra quién y con qué filtros.
- `:60` realmente llama `logInfo('orders_export_executed', { count, operation:'export' })` sin ID de actor, requestId ni filtros.
- `lib/safe-logger.ts` no inyecta sesión/identidad automáticamente.

**Impacto:** ante un CSV extraído por cuenta interna o comprometida no hay atribución en el evento de exportación, aunque el endpoint tiene autorización correcta.

**Corrección:** auditoría estructurada con actorId pseudónimo/estable, requestId, tipo de operación, cantidad y filtros no sensibles normalizados; retención definida. Evitar guardar términos de búsqueda libres si pueden contener PII.

## Controles que sí se observaron

- Permisos administrativos actuales se consultan en BD; el JWT no es la autoridad de permisos (`lib/admin-access-server.ts`). Retirar permisos opera en la siguiente solicitud sensible.
- Los handlers revisados tienen guards de origen, con comparación contra orígenes configurados; NextAuth protege su propio flujo CSRF. No se demostró un bypass de CSRF.
- CSV usa `escapeFormulae:true`; no se encontró la inyección clásica de fórmulas en exportación.
- Comprobantes nuevos se leen con PAYMENTS y URL privada firmada por180s con no-store. No se encontró acceso público directo a nuevos comprobantes.
- SQL revisado usa Prisma parametrizado. No se demostró SQL injection.
- Cargas de imagen revisan magic bytes y procesan formatos admitidos; no se demostró ejecución arbitraria de archivos.
- Los enlaces editables bloquean esquemas javascript/data; el JSON-LD reutilizable escapa contenido. No se demostró XSS explotable por contenido en la revisión asignada.

## Recomendaciones adicionales, sin contabilizar como vulnerabilidades nuevas

1. MFA o step-up para propietario, cambios de permisos/cuentas de pago, restablecimiento de cuentas y exportación de clientes. No existe MFA en Credentials/NextAuth del proyecto revisado.
2. Para sesiones administrativas sensibles, comprobar versión de sesión/contraseña contra BD inmediatamente. Actualmente la huella de contraseña se revalida cada5min (`auth route:27,153`), ventana conocida que también está indicada en la UI. La compatibilidad de tokens antiguos sin pwv adopta la huella actual; definir fecha fin o invalidación de esos tokens, porque el cambio de contraseña no demuestra identidad de una sesión legacy. No se confirmó presencia de cookies legacy reales.
3. Registro de uploads con propiedad y vinculación para todas las galerías: evita borrado cruzado, recursos compartidos rotos y huérfanos; garbage collection después de confirmar referencias.
4. Tests de cada permiso individual y cruces prohibidos: los tres guard checks y una cuenta Superadmin no cubren la matriz real de capacidades ni recursos de otros módulos.
5. Auditoría persistida de operaciones sensibles, con actor y resultado, además de permisos. Registrar creación/borrado de productos, validación/rechazo/cancelación de pagos, configuración financiera y exportaciones.
6. Mantener la distinción entre incidentes de almacenamiento y defaults vacíos; nunca convertir una lectura fallida en guardado exitoso que sustituye cuentas/ajustes antiguos por vacíos.

## Límites

No se auditaron desde este subinforme infraestructura real, permisos efectivos de buckets/BD/Cloudflare, TLS/proxy, DNS, restauración de backups ni proveedores de pago reales. Las dependencias y sus avisos son responsabilidad del informe coordinador. No se detectó un hallazgo crítico demostrado en esta porción; no se convierte ausencia de prueba en certificación de seguridad. Ningún fallo se corrigió como parte de esta auditoría.
