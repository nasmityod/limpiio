# Auditoría completa de tienda y panel administrativo

**Repositorio:** D:\limpio · **Estado revisado:** `d0989a4` · **Trabajo:** 3–4 de octubre de 2026, America/Caracas.

La aplicación compila y sus tests existentes pasan, pero la revisión encontró fallos que esos controles no cubren: stock recuperado al editar productos, pedidos entregados sin pago, ajustes financieros sobrescritos y errores de concurrencia en cupones. Estos son los primeros problemas que corregiría antes de considerar cerrada la integridad de la tienda.

El resultado es **65 hallazgos únicos del código actual: 15 altos, 44 medios y 6 bajos**, después de consolidar duplicados y ajustar severidades. Aparte se documentan **9 riesgos condicionados**: 7 de activación de Cashea y 2 de dependencias. Tres de esos nueve tienen impacto potencial crítico; ninguno representa una explotación crítica demostrada en producción.

El conteo recoge defectos de contratos, comportamiento y recuperación, incluso cuando requieren una carrera, una caída, Google habilitado, zonas horarias distintas o crecimiento del catálogo. No significa que 65 incidentes hayan ocurrido a clientes. La condición, evidencia y límites están indicados en cada anexo.

## Resultado y clasificación

| Nivel | Hallazgos en código actual | Criterio |
|---|---:|---|
| Crítico demostrado en producción | **0** | No se tuvo acceso a producción; este cero no certifica ausencia. |
| Alto | **15** | Acceso persistente indebido, borrado cruzado autorizado incorrectamente, integridad de dinero/inventario o recuperación operativa comprometida. |
| Medio | **44** | Función bloqueada, información o persistencia incorrecta, pérdida de borradores/favoritos, concurrencia, comunicación o recuperación incompleta. |
| Bajo | **6** | Presentación, instrucciones, consistencia localizada o trazabilidad limitada sin bypass demostrado. |
| Riesgos condicionados, aparte | **9** | 3 críticos potenciales, 5 altos y 1 medio; condiciones específicas en la tabla de riesgos. |

Las severidades de este registro son las canónicas. Dos anexos usan niveles distintos para video temporal y media compartida: aquí ADM-04 y ADM-24 son **medios** por su impacto puntual; PD-14 se integra en ADM-06 como **medio** porque la función no puede iniciarse. ADM-20 y ADM-23 también son medios: pérdida de un borrador e imágenes rechazadas en producción, respectivamente.

## Lo que atendería primero

1. **Pago y estados de pedido — PD-01, PD-02, PD-13.** La ruta real permitió pasar un pendiente a Entregado con paidAt vacío. Una transición antigua puede revivir un cancelado y un descuento puede revertirse después del cobro. Exigir transición/pago válidos y evitar que una actualización perdedora produzca efectos.
2. **Inventario y precios — ADM-02, ADM-11.** Editar descripción con stock antiguo escribió 3 cuando otra venta había dejado 2. Con factor 1.234, el recálculo manual produjo 100.35 → 100.70 → 101.05 sin cambiar configuración. Controlar versión y hacer recálculo idempotente.
3. **Destino de pagos — ADM-03.** Dos guardados exitosos de dominios distintos pueden restaurar la cuenta bancaria antigua. Separar documentos o versionar/bloquear el merge servidor.
4. **Activos y permisos — SEC-02, SEC-03.** Un cliente puede provocar el borrado de una foto de reseña ajena; CATALOG puede borrar banner/QR mediante la ruta de videos. Autorizar el objeto real y su propietario, no solo el prefijo de URL.
5. **Cupones y reservas — PD-04, PD-07.** Dos reversiones de un mismo canje dejaron usedCount=0 con un canje activo; Binance omite el límite común de pedidos impagados. Reclamar cada efecto una vez y limitar inventario reservado por comprador/método.
6. **Identidad Google — SEC-01, si está habilitada.** Vincular automáticamente una identidad Google por correo conserva la contraseña del pre-registrador. Requerir verificación/vinculación segura.
7. **Dependencias y continuidad — DEP-01, OPS-01, OPS-03.** Actualizar las versiones afectadas, comprobar backup real y corregir el rollback de arranque. El guard de seguridad del repositorio todavía acepta versiones afectadas.

Las reproducciones de DB/HTTP usaron datos ficticios en un clúster PostgreSQL aislado. Los borrados R2 y ataques destructivos se probaron con dobles o por cadena de código, sin ejecutarlos contra objetos reales.

## Registro completo, sin duplicados

**Evidencia:** R = ejecución local en navegador/HTTP/BD; A = función/ruta original con fronteras externas simuladas; PG = PostgreSQL aislado; C = cadena de código revisada; DOM = interfaz observada; V = aviso primario del proveedor y aplicabilidad revisada, sin ejecutar exploit. Una evidencia C es un defecto identificado, pero su secuencia de fallo todavía necesita una prueba de aceptación al corregirlo.

Cada enlace «Detalle» conduce al anexo que contiene archivos y líneas, secuencia de reproducción, impacto, corrección y límites. Los IDs permiten buscar el hallazgo en ese documento.

| ID | Severidad | Bug / inconsistencia | Evidencia | Corrección recomendada y detalle |
|---|---|---|---|---|
| ADM-01 | **Alto** | Renombrar categoría separa sus productos y vacía la categoría pública. | A | Migrar categoryId o renombrar productos en la misma transacción. [Detalle](./admin-funcional.md) |
| ADM-02 | **Alto** | Guardar una edición puede reponer stock consumido por otra venta. | A | Control de versión; stock por movimientos/deltas. [Detalle](./admin-funcional.md) |
| ADM-03 | **Alto** | Guardados simultáneos restauran ajustes de contacto o cuentas de pago anteriores. | A | Separar documentos o bloquear/versionar lectura y escritura. [Detalle](./admin-funcional.md) |
| ADM-11 | **Alto** | Recalcular con factor 1.234 aumenta otra vez el precio sin cambiar el factor. | A+PG | Precisión canónica y recálculo idempotente. [Detalle](./admin-funcional.md) |
| OPS-01 | **Alto** | El schedule omite backups; reinstalarlo reemplaza otros cron del root. | C | Backup explícito, instalación por bloque y prueba de restauración. [Detalle](./admin-funcional.md) |
| OPS-03 | **Alto** | El deploy aborta ante fallo de systemctl start antes de ejecutar rollback. | C | Rollback común para fallo de arranque o health. [Detalle](./admin-funcional.md) |
| SEC-01 | **Alto** | Pre-registro con contraseña del atacante conserva acceso tras Google de la víctima. | A | Verificar correo y vincular proveedores con prueba de propiedad. [Detalle](./seguridad-admin.md) |
| SEC-02 | **Alto** | Un cliente puede asociar y borrar fotos de reseñas ajenas. | A | Propiedad de uploads y autorización al vincular/borrar. [Detalle](./seguridad-admin.md) |
| SEC-03 | **Alto** | CATALOG puede borrar banners y QR financiero usando DELETE de videos. | A | Autorizar objeto por módulo y restringir recurso/keys. [Detalle](./seguridad-admin.md) |
| PD-01 | **Alto** | Se puede entregar un pedido impagado; entra además en ingresos validados. | R+A | Máquina de estados con pago autorizado y transición atómica. [Detalle](./pedidos-datos.md) |
| PD-02 | **Alto** | Un envío con snapshot viejo revive una cancelación y desacopla inventario/cupón. | C | Compare-and-swap y efectos solo de transición ganadora. [Detalle](./pedidos-datos.md) |
| PD-04 | **Alto** | Dos reversiones concurrentes liberan dos usos por un único canje. | R/PG | Reclamar reversedAt:null antes de decrementar una vez. [Detalle](./pedidos-datos.md) |
| PD-07 | **Alto** | Binance elude el tope de pedidos impagados y puede retener inventario. | C | Tope común de reservas y caducidad/revisión por método. [Detalle](./pedidos-datos.md) |
| PD-13 | **Alto** | Revertir descuento modifica el total de pedidos ya cobrados sin nuevo cobro. | C | Congelar importes pagados; ajustes/cobros separados. [Detalle](./pedidos-datos.md) |
| DEP-01 | **Alto** | Next afectado por DoS Server Actions y guard mínimo desactualizado. | V+C | Actualizar Next/lockfile y política de versiones. [Detalle](./tienda-publica-dependencias.md) |
| ADM-04 | **Medio** | Cerrar el modal durante guardado puede borrar un video recién publicado. | C | Bloquear cierres y reclamar uploads antes de purgar. [Detalle](./admin-funcional.md) |
| ADM-05 | **Medio** | Crear/editar un producto con placeholder falla por contrato de imagen. | R+A | Unificar validación de URLs internas y fallback. [Detalle](./admin-funcional.md) |
| ADM-06 | **Medio** | El selector no permite iniciar un transportista personalizado. | A | Estado de modo personalizado separado del nombre. [Detalle](./admin-funcional.md) |
| ADM-07 | **Medio** | Banners/Home muestran cambios rechazados; Home ofrece acciones de otros permisos. | A+C | Comprobar HTTP y presentar solo capacidades autorizadas. [Detalle](./admin-funcional.md) |
| ADM-08 | **Medio** | El error de validación de categorías llega como objeto y rompe React. | A | Mensaje string y errores por campo; normalizar feedback. [Detalle](./admin-funcional.md) |
| ADM-09 | **Medio** | CSV crea productos con categoría sin crear el registro de navegación. | C | Asegurar categoría dentro de importación transaccional. [Detalle](./admin-funcional.md) |
| ADM-10 | **Medio** | CSV cambia precio y conserva costos, margen/base y oferta incoherentes. | C | Política explícita de precio manual y metadatos consistentes. [Detalle](./admin-funcional.md) |
| ADM-12 | **Medio** | Banners/promos aceptan al crear datos que rechazan al editar. | A | Schemas canónicos compartidos create/update. [Detalle](./admin-funcional.md) |
| ADM-13 | **Medio** | Cupones cambian horario con servidor y navegador en zonas distintas. | A | Transmitir ISO con offset y mostrar zona. [Detalle](./admin-funcional.md) |
| ADM-15 | **Medio** | La UI deja inaccesibles cupones antiguos al superar 500 registros. | C | Paginación/búsqueda y filtro de archivados. [Detalle](./admin-funcional.md) |
| ADM-16 | **Medio** | Diálogos/tablas administrativas incompletos para teclado y lector de pantalla. | C | Foco, labels, semántica y controles sin anidamiento. [Detalle](./admin-funcional.md) |
| ADM-17 | **Medio** | Una búsqueda antigua sobrescribe resultados nuevos en estanterías Home. | C | Abortar y descartar respuestas obsoletas. [Detalle](./admin-funcional.md) |
| ADM-19 | **Medio** | Analítica subcuenta pendientes e infla o limita ganancias sin indicar el alcance. | A+C | Agregación servidor; distinguir costos ausentes/403 y sumar estados. [Detalle](./admin-funcional.md) |
| ADM-20 | **Medio** | Un guardado fallido borra campos del borrador de producto. | R+C | Esperar acción y resetear únicamente tras éxito. [Detalle](./admin-funcional.md) |
| ADM-21 | **Medio** | Cambiar filtro mientras carga más pedidos deja el botón ocupado indefinidamente. | A | Cancelar petición y reiniciar estado de paginación. [Detalle](./admin-funcional.md) |
| ADM-22 | **Medio** | Errores de carga parecen listas vacías o dejan formularios guardando. | C | Estados de error/reintento y finally consistente. [Detalle](./admin-funcional.md) |
| ADM-23 | **Medio** | Se guardan imágenes externas que el optimizador rechaza en producción. | A+R | Allowlist común con Next/Image y saneado de registros. [Detalle](./admin-funcional.md) |
| ADM-24 | **Medio** | Reemplazar imagen de A puede borrar el objeto que también usa B. | C | Desvincular primero; purgar solo objetos sin referencias. [Detalle](./admin-funcional.md) |
| OPS-04 | **Medio** | Portada HTTP200 puede ocultar DBhealth503 y aceptar un deploy averiado. | C | Exigir readiness de aplicación y BD. [Detalle](./admin-funcional.md) |
| SEC-06 | **Medio** | OPERATIONS como único permiso redirige /admin hacia sí mismo. | A | Home autorizado real y evitar destino actual. [Detalle](./seguridad-admin.md) |
| SEC-07 | **Medio** | Defaults o teléfono vacío/espacios impiden abrir configuración para repararla. | A | DTO de lectura tolerante; normalizar antes de validar. [Detalle](./seguridad-admin.md) |
| PD-03 | **Medio** | Cancelar un slot inferior bloquea usos legítimos disponibles del cupón. | R/PG | Asignar primer slot libre con control de concurrencia. [Detalle](./pedidos-datos.md) |
| PD-05 | **Medio** | Repetir checkout sin referencia crea pedidos/reservas duplicados. | R | Idempotency-Key durable por intento y hash de payload. [Detalle](./pedidos-datos.md) |
| PD-06 | **Medio** | Referencia bancaria igual devuelve un pedido de otro carrito/método. | C | Distinguir intento de compra y conflicto de referencia. [Detalle](./pedidos-datos.md) |
| PD-08 | **Medio** | Editar/borrar cupón compite con un canje y rompe límites/historial. | C | Lock/transacción y conservación de canjes. [Detalle](./pedidos-datos.md) |
| PD-09 | **Medio** | Borrar pedido marca prueba DELETED antes de confirmar borrado R2. | C | Outbox de eliminación con reintentos y estado confirmado. [Detalle](./pedidos-datos.md) |
| PD-10 | **Medio** | Reinicio después del claim de purga deja DELETING sin recuperación. | C | Lease y rescate de trabajos DELETING antiguos. [Detalle](./pedidos-datos.md) |
| PD-11 | **Medio** | Fecha BCV igual oculta tasa faltante/corrupta y cron reporta éxito. | C | Validar tasa antes de retornar sinCambios. [Detalle](./pedidos-datos.md) |
| PD-12 | **Medio** | BCV puede sustituir una publicación reciente por otra anterior. | C | Fechas normalizadas y regla de no regresión. [Detalle](./pedidos-datos.md) |
| WEB-01 | **Medio** | Comprar ahora puede refrescar antes del PATCH y perder la línea nueva. | A | Sincronizar cola pendiente antes de refrescar checkout. [Detalle](./tienda-publica-dependencias.md) |
| WEB-02 | **Medio** | Respuesta tardía del carrito A se aplica tras cambiar a la cuenta B. | A | Descartar respuesta/cola de identidad anterior. [Detalle](./tienda-publica-dependencias.md) |
| WEB-03 | **Medio** | Ordenar catálogo oculta agotados sin cambiar disponibilidad. | R+C | Política única de disponibilidad entre consultas. [Detalle](./tienda-publica-dependencias.md) |
| WEB-04 | **Medio** | Mapper cacheado pierde freeShipping; etiquetas varían por navegación. | A | Contrato completo sin casts que oculten campos. [Detalle](./tienda-publica-dependencias.md) |
| WEB-05 | **Medio** | Búsqueda fuera de rango anuncia cero productos aunque sí existen. | R+C | Count independiente y corrección de página. [Detalle](./tienda-publica-dependencias.md) |
| WEB-06 | **Medio** | Permissions-Policy bloquea Detectar mi ubicación en SEO Local. | C+DOM | Política específica compatible con la acción. [Detalle](./tienda-publica-dependencias.md) |
| WEB-07 | **Medio** | La UI marca como fresca una tasa fallback o sin fecha comprobada. | R+C | Estado/origen/fecha de tasa en API y presentación. [Detalle](./tienda-publica-dependencias.md) |
| DEP-02 | **Medio** | Bearer % causa error500 en vez de denegación401. | R | Actualizar Auth.js y manejar autenticación inválida. [Detalle](./tienda-publica-dependencias.md) |
| PU-01 | **Medio** | Límite/fusión de favoritos diverge; UI guarda altas rechazadas silenciosamente. | C | Tope de unión y actualización atómica confirmada. [Detalle](./publico-adicional.md) |
| PU-02 | **Medio** | Fallo de fusión devuelve [] y elimina favoritos locales del invitado. | C | Conservar copia hasta éxito verificable y permitir retry. [Detalle](./publico-adicional.md) |
| PU-03 | **Medio** | Correo rechazado se registra como enviado en reposición y abandono. | C | Resultado explícito del proveedor y outbox/reintentos. [Detalle](./publico-adicional.md) |
| PU-04 | **Medio** | Nuevo checkout reactiva recordatorios después de confirmar baja. | C | Supresión durable por destinatario y consentimiento de alta. [Detalle](./publico-adicional.md) |
| PU-05 | **Medio** | Segunda oleada invalida recuperar/baja del primer correo. | C | Token de baja separado y vigencia explícita de recuperación. [Detalle](./publico-adicional.md) |
| PU-06 | **Medio** | Carrito y recuperación conservan retirados con stock y enlace404. | C | Publicabilidad común y estado no disponible. [Detalle](./publico-adicional.md) |
| PU-07 | **Medio** | Recordatorio72h ignora actividad reciente y puede llegar al comprar. | C | Elegibilidad por inactividad real lastActivityAt. [Detalle](./publico-adicional.md) |
| ADM-14 | **Bajo** | Eliminar cupón usado anuncia borrado permanente, pero solo desactiva. | C | Copy y resultado según softDeleted. [Detalle](./admin-funcional.md) |
| ADM-18 | **Bajo** | Stock=3 es bajo en el filtro, pero no en contador/badge. | A+C | Una regla para el valor frontera. [Detalle](./admin-funcional.md) |
| SEC-10 | **Bajo** | Exportación CSV de clientes/pedidos no registra actor ni filtros. | C | Auditoría estructurada de exportaciones. [Detalle](./seguridad-admin.md) |
| PD-15 | **Bajo** | Ayuda Binance pide un segundo paso que la aprobación ya ejecuta. | C | Actualizar instrucción al flujo de un paso. [Detalle](./pedidos-datos.md) |
| WEB-08 | **Bajo** | Dirección hardcodeada discrepa de la configuración pública del negocio. | R+C | Datos comunes para textos y metadatos. [Detalle](./tienda-publica-dependencias.md) |
| WEB-09 | **Bajo** | Usuarios muestra el título móvil de Tienda y pagos. | R | Coincidencia de ruta más específica. [Detalle](./tienda-publica-dependencias.md) |

### Duplicados consolidados

| Registro único | Análisis que se integró |
|---|---|
| ADM-03 | SEC-05: misma carrera de settings; se conserva evidencia API y server action. |
| PD-01 | SEC-04: avance sin pago y separación de permisos PAYMENTS/ORDERS. |
| ADM-06 | PD-14: mismo selector de transportista. |
| ADM-07 | SEC-08: falsos guardados de contenido y UI que ofrece permisos distintos. |
| ADM-19 | SEC-09: costos inaccesibles por permisos; se conservan también conteo de pendientes, costos desconocidos y top20. |

PD-05/PD-06 y PD-09/PD-10 comparten una familia de corrección, pero conservan dos entradas por disparadores distintos. SEC-02/03 y ADM-04/24 distinguen autorización de objeto, cruce de permisos, cierre durante guardado y referencia compartida; no son el mismo fallo.

## Riesgos condicionados y futuros que deben cerrarse antes de activar funciones

Estos nueve riesgos **no se suman a los 65**. Cashea automático está apagado en .env.example y su verificador actual falla cerrado. No se probó una confirmación fraudulenta automática operativa.

| ID | Impacto potencial | Condición y riesgo | Acción antes de exposición |
|---|---|---|---|
| DEP-C01 | **Crítico** | Next16.2.10 sobre filesystem Windows, sin Cache Components. Equipo de auditoría Windows; producción documentada como VPS/Linux, no inspeccionada. | Parchear antes de exponer servidor Windows. [Aviso oficial](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36). |
| DEP-C02 | **Crítico** | Optimización de AVIF malicioso con versión afectada. No se demostró entrada maliciosa accesible en el CDN real; salida WebP por sí sola no prueba exclusión de AVIF entrante. | Parchear Next/Sharp y verificar allowlist, formatos reales y uploads. [Aviso oficial](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4). |
| PC-03 | **Crítico latente** | Si se implementa confirmación Cashea sin vínculo comercio/comprador/importe, un ID remoto aportado por navegador podría confirmar otro carrito. Hoy el stub impide confirmar. | Correlación inmutable creada/verificada por servidor; fallar cerrado al faltar expected/importes/propiedad. |
| PC-01 | **Alto** | Activar flag permite reservar, pero verifyCasheaOrder siempre lanza y el contrato remoto está pendiente. | Adaptador sandbox validado y guard que impida activar implementación incompleta. |
| PC-02 | **Alto** | Rutas generales pueden confirmar/cancelar Cashea fuera de su ciclo remoto. | Máquina de estados específica y bloqueo de caminos incompatibles. |
| PC-04 | **Alto** | Tras implementar confirmación, perder el claim local no impide intentar cancelación remota. | Verificar count/estado antes del efecto externo y reconciliar. |
| PC-05 | **Alto** | Retorno tardío puede sobrescribir un estado Cashea final; futura confirmación puede revivir cancelación. | Estados permitidos, invalidación de token final y coherencia con stock/pedido. |
| OPS-02 | **Alto** | Schedule definido no llama reconciliación/expiración Cashea. | Programar cron, comprobar ejecución y reservas liberadas. |
| PC-06 | **Medio** | Dos submits rotan token; después de ventana corta aparece nueva reserva y payload puede discrepar. | Idempotencia durable de sesión, token estable y límites de reservas. |

[Detalle Cashea](./pedidos-datos.md) · [Detalle schedule](./admin-funcional.md) · [Triage de dependencias](./tienda-publica-dependencias.md).

## Dependencias: cifras y alcance real

El escaneo completo devolvió **37 paquetes afectados: 2 críticos, 26 altos, 8 moderados y 1 bajo**. Omitiendo dev: **29 paquetes: 2 críticos, 20 altos, 6 moderados y 1 bajo**. Estas cifras no son 37/29 vulnerabilidades independientes demostradas en la tienda, ni se agregan al conteo de bugs.

Se revisaron avisos originales y condiciones. El DoS de Server Actions encaja con las funciones usadas por este proyecto. El Bearer malformado se reprodujo como error500 por solicitud. El RCE de next/og en Node no se atribuye a la ruta Edge que usa la tienda; tampoco se atribuye el problema de EmailProvider a Credentials/Google. El árbol transitivo necesita actualización y validación según las funciones efectivamente utilizadas. [Aviso DoS Next](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj), [aviso Bearer Auth.js](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj).

No se instaló ninguna actualización como parte de esta auditoría. npm audit fix --force propone cambios de major/downgrade para parte del árbol; planificar upgrades compatibles y validar Next/Auth/Sharp/Prisma por separado. Los parches revisados incluyen Next16.3.6 y Auth.js4.24.15; comprobar versiones soportadas al implementar.

## Cobertura de punta a punta

| Superficie | Revisión realizada | Profundidad / límites |
|---|---|---|
| Portada, categorías, catálogo, ofertas y búsqueda | Consultas, cache/tags, disponibilidad, tarjetas, navegación, contratos de imágenes y SEO; catálogo/sort/búsqueda en navegador | No catálogo real ni crawl del dominio publicado; la portada inicial de fixture tenía CDN no configurado, excluido como incidente productivo. |
| PDP, carrito y checkout | Datos autoritativos, stock, tasas, Comprar ahora, full/WhatsApp, snapshots; PDP/checkout en navegador y carreras del provider | No cobro real ni envío de comprobante a un bucket real. |
| Login/registro/Google/reset | Callbacks originales, verificación de identidad, tokens, permisos, protección de origen y reset | Google con dobles, sin cuenta Google real; reset y tracking por fuente/tests existentes. |
| Favoritos y avisos | Persistencia, merge, errores, reposición, abandono, recovery y baja | Siete casos por cadena de código; sin correos reales. |
| Cuenta, pedidos y tracking público | DTO/autorización, pedido/estado, lookup con documento, acceso invitado y snapshots | No datos reales ni ataque de enumeración contra dominio público. |
| Información de tienda/políticas/SEO | Datos configurados, dirección/branding, metadatos, headers, enlace y contenido de envíos observado | Revisión técnica/editorial; no dictamen legal ni validación de indexación en Search Console. |
| **Mostrador /admin** | KPIs, alerts, inventario bajo, permisos/home y código | Entrada local superadmin; roles limitados probados en funciones aisladas. |
| **Analítica /admin/stats** | Query, ingresos, estados, costos, gráficos/ranking y permisos | Sin históricos productivos; aritmética/callbacks aislados. |
| **Inventario /admin/products** | Búsqueda/paginación, altas/edición, precios, stock, medios, import/export CSV, visibilidad y borrado | Navegador + acciones originales con dobles; no borrado real de R2. |
| **Categorías /admin/categories** | CRUD, nombre/slug/redirect, SEO, sync, counters y errores | PUT/schema/React originales aislados; no cambio productivo. |
| **Reseñas /admin/reviews** | Moderación, respuesta, fotos, auto-aprobar, permisos y errors | Ruta original aislada; no publicación ni notificación real. |
| **Pedidos /admin/orders** | Listado, cursor, filtros, selección, estado individual/masivo, pago, tracking, descuentos y CSV | Reproducción de estado por HTTP y concurrencia de cupones con PostgreSQL. |
| **Cupones /admin/coupons** | CRUD, fechas, límites/historial, slots, contadores y concurrencia | Helpers reales + PostgreSQL; límite de500 por código, sin cargar500cupones reales. |
| **Personalizar /admin/personalizar** | Hero, marca, WhatsApp, trust badges/popup, lectura/guardado | Navegación de entrada y revisión de código; fallos de red por flujo. |
| **Gestor Home /admin/home-manager** | Categorías, promociones, beneficios/flash, estanterías y envío gratis | Revisión de cada editor y permisos; no ciclo remoto de upload. |
| **Banners /admin/banners** | Tipos, foco/imagen, orden, activo, CRUD y feedback | Callback real con HTTPfallido; contrato optimizer instalado. |
| **Anuncios /admin/settings/announcement** | Texto/link/colores, preview, activo y carga/guardado | Entrada local y fuente; contraste de todas las combinaciones no medido. |
| **SEO Local /admin/settings/seo-local** | Identidad, dirección, GPS, horarios, schema y metadata | DOM/header verificados; no se solicitó ubicación real. |
| **Tienda/Pagos/Precios /admin/settings** | DTO/schemas, ajustes, tasa/factor, recálculo y accesos | Concurrencia de acciones/rutas originales con storage simulado. |
| **Usuarios /admin/settings/users** | Listado, búsqueda, staff, alta/reset/borrado, permisos y shell móvil | Vista390×844; no matriz visual completa de todos los roles/dispositivos. |
| Infraestructura, crons y datos | Migraciones, relaciones/constraints, deploy/systemd/nginx del repo, backup y schedules | No VPS, DNS/TLS/CDN reales, restauración de backup real ni inspección de configuración efectiva. |
| Rendimiento, compatibilidad y accesibilidad | Revisión de patrones de consultas/cache/carga, semántica/foco y móvil puntual | No Lighthouse/CWV/axe integral, benchmark bajo carga, Safari/iOS físicos ni auditoría WCAG completa. |

Se revisaron todas las secciones de navegación del panel y sus componentes/acciones relacionados. **No se ejecutó cada CRUD de cada pantalla en el navegador**; una parte del recorrido solo comprobó entrada/DOM inicial. La profundidad procede de combinar esas observaciones con lectura y reproducciones dirigidas. No hay pantalla/modelo de variantes ni venta manual administrativa en este estado; no se contabilizaron funciones inexistentes como bugs.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| Suite del proyecto | **60 archivos, 625 tests aprobados** |
| TypeScript | **Aprobado** |
| ESLint | **0 errores, 34 advertencias** |
| Guards seguridad/origen/permisos API/permisos páginas | **4 scripts aprobados**; cobertura sintáctica insuficiente para los flujos hallados |
| Migraciones desde cero | **27 aplicadas** en PostgreSQL aislado |
| Build producción | **Aprobado**, incluyó64 páginas prerenderizadas |
| Evidencia seguridad | **11 casos aprobados**, callbacks/rutas originales con dobles |
| Evidencia carrito/catalog mapper | **3 casos aprobados**, provider/mapper originales |
| Evidencia admin | Script original aislado y JSON con16 registros de evidencia |
| Reproducciones PostgreSQL/HTTP | Pedido Entregado sin pago; replay checkout sin referencia; slot cupón con hueco; doble reversión concurrente |
| HTTP auth malformada | Bearer% →500; solicitud normal sin sesión →401 |
| npm audit | Resultados completo y omit-dev preservados en JSON |

Que los tests pasen demuestra cobertura existente, no ausencia de los fallos hallados. Las nuevas pruebas de evidencia **afirman el comportamiento defectuoso actual** para hacerlo reproducible; no son pruebas de una corrección ni deben incorporarse sin más como criterio de salud de CI.

El servidor navegable fue de desarrollo, con PostgreSQL nuevo de auditoría, E2E_MODE y proveedores externos deshabilitados/simulados. El build se compiló aparte; su ejecución como servidor de producción no pudo verificarse por bloqueo automático.

### Evidencia guardada

- [Panel administrativo, 28 hallazgos de análisis antes de consolidación](./admin-funcional.md).
- [Pedidos, pagos, datos y seis riesgos Cashea](./pedidos-datos.md).
- [Seguridad y permisos](./seguridad-admin.md).
- [Tienda pública y dependencias](./tienda-publica-dependencias.md).
- [Favoritos, recuperación y avisos](./publico-adicional.md).
- [Reproducciones admin](./reproducciones-admin.mjs) y [salida JSON](./reproducciones-admin.json).
- [Pruebas seguridad](./seguridad-admin.evidence.test.ts) y [auth](./seguridad-auth.evidence.test.ts).
- [Pruebas carrito](./storefront-evidence.test.tsx) y [mapper](./catalog-evidence.test.ts).
- [Recorrido DOM admin](./evidencia/admin-recorrido.json), [búsqueda fuera de rango](./evidencia/busqueda-fuera-rango.txt), [captura formulario](./evidencia/producto-sin-foto.png) y [captura móvil](./evidencia/admin-usuarios-movil.png).
- [Auditoría npm completa](./evidencia/npm-audit-completo.json) y [omit-dev](./evidencia/npm-audit-runtime.json).

Comandos de evidencia aislada:

```powershell
node docs/auditoria-2026-10-03/reproducciones-admin.mjs
npx vitest run --config docs/auditoria-2026-10-03/storefront-evidence.config.ts
npx vitest run --config docs/auditoria-2026-10-03/seguridad-admin.vitest.config.ts docs/auditoria-2026-10-03/seguridad-admin.evidence.test.ts docs/auditoria-2026-10-03/seguridad-auth.evidence.test.ts
```

El script admin usa helpers/callbacks extraídos del estado de código auditado; se conserva como evidencia, no como harness durable de integración. Las cuatro reproducciones HTTP/PG se describen en pedidos-datos; no se preservaron credenciales/sesiones ni un automatismo que vuelva a mutar otra base.

## Recomendaciones y plan de cierre

### Prioridad 1: dinero, inventario, identidad y recuperación

Corregir primero los 15 altos y verificar las condiciones críticas de dependencias. Antes de un cambio financiero, sacar un backup verificable y comprobar el procedimiento real de recuperación. Validar cambios de permisos con una cuenta de capacidad mínima, además de superadmin. Mantener Cashea automático sin habilitar hasta pasar sus siete criterios de activación.

Criterios verificables:

- Un pedido moderno impagado no puede quedar En Proceso/Enviado/Entregado ni contar como ingreso. Una transición perdedora no modifica stock/cupón.
- Reintento del mismo checkout devuelve el mismo pedido; otro carrito/referencia ambigua da conflicto explícito.
- Guardado obsoleto no repone unidades ni restaura banco/cuenta antigua.
- Dos recálculos consecutivos con el mismo factor producen el mismo segundo resultado; probar precisión y precio manual/CSV.
- Un upload de otra reseña/módulo no puede asociarse/borrarse por un usuario sin derecho al objeto.
- Cada cancelación libera una vez el canje; usedCount coincide con canjes activos tras concurrencia.
- Una reserva impagada tiene límite y resolución operativa por todos los métodos.
- Un arranque fallido activa rollback; readiness no se reemplaza por la portada; backup se restaura de verdad.

### Prioridad 2: contratos, errores y tareas durables

Unificar schemas create/update y tipos públicos; usar resultados discriminados en acciones y errores visibles/reintentos en UI. Evitar convertir un fallo en lista vacía o defaults que luego se guardan. Separar precio comercial, cobros y ajustes; conservar snapshots históricos pertinentes para analizar rentabilidad. Incorporar trabajos con estado/lease/reintento para correo y borrado de objetos.

Los cambios deben incluir pruebas de sus disparadores: fallo de correo/R2/DB, reinicio tras claim, cambio de filtro en vuelo, timeout que ocurre después del commit, cambio de cuenta durante merge y llegada de respuesta fuera de orden.

### Prioridad 3: operación, UX, accesibilidad y crecimiento

Completar teclado/foco/labels/combobox y medir con axe más revisión manual; verificar contraste de configuraciones de banners/anuncios. Añadir paginación/búsqueda de cupones y empates deterministas por ID en listados ordenados por precio/fecha. Centralizar datos de negocio y revisar los textos de políticas cuando cambien servicios o ubicación.

Medir rendimiento en un staging equivalente a producción con volumen representativo, índices/planes SQL y concurrencia real; recoger p75 de LCP/INP/CLS y tiempos de checkout/API. No asignar una puntuación Lighthouse ni capacidad de tráfico sin medición. Probar Android/iOS y Safari, teclado y red móvil lenta.

### Refuerzos recomendados que no se cuentan como vulnerabilidades nuevas

- MFA/step-up para propietario, cambios financieros/permisos y exportación; revocación inmediata de sesiones sensibles y política de tokens legacy.
- Auditoría persistente con actor, motivo, resultado y versión anterior/nueva para pagos, stock, permisos, configuración y exportaciones; evitar PII innecesaria en logs.
- Constraints de invariantes y tests sobre PostgreSQL real para concurrencia, sin depender solo de mocks.
- Archivado/anonimización de historial financiero en vez de borrado físico indiscriminado.
- Alertas por reservas impagadas, edad de tasa, trabajos DELETING, rechazos de correo, backup atrasado y último éxito de cron; separar «cron ejecutado» de «resultado correcto».
- Tokens de baja distintos de recuperación, preferencia durable y reintentos que respeten la baja.
- Suite por permiso individual y matriz de operaciones; feature flags con criterios de preparación, particularmente Cashea.
- Plan de migración compatible con rollback del build: restaurar código anterior no revierte automáticamente un schema incompatible.

## Límites y estado final del workspace

Esta es una auditoría profunda del repositorio disponible, con revisión transversal, navegador local y reproducciones dirigidas. **No se recibió URL productiva ni acceso a staging/proveedores reales.** No se ejecutó pentest destructivo, DoS, explotación RCE, carga intensiva, pagos reales ni envío/borrado contra servicios productivos. No se inspeccionaron secretos, buckets/VPS efectivos, DNS/TLS ni backups reales.

El cierre incluye documentos y evidencia; no cambios de aplicación. Los servidores y clúster temporales de auditoría se detienen al terminar. Los ajustes de next-env/tsconfig generados por Next durante las verificaciones se restauran al estado inicial; el ZIP preexistente del usuario se conserva.

**Limitación por aprobación automática:** la revisión automática rechazó iniciar el servidor local del build de producción, incluso ligado a127.0.0.1; el único motivo devuelto fue «blocked by policy». Se verificó compilación, pero la navegación se realizó sobre desarrollo. Falta la aceptación final sobre un entorno equivalente al desplegado para certificar comportamiento de producción.

