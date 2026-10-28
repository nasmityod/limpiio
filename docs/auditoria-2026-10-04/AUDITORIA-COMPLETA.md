# Auditoría integral y correcciones — iniciada el 4, cierre el 7 de octubre de 2026

La segunda pasada revisó código, flujos administrativos y comportamiento con concurrencia, fallos de servicios y crecimiento de datos. Se corrigieron los 65 hallazgos confirmados de la primera auditoría y se registraron problemas adicionales encontrados durante esta revisión y la revisión cruzada de los parches. Los cambios están en el árbol de trabajo; la actualización aún necesita aplicarse y validarse en el VPS del dueño.

**Estado de cierre: correcciones de código y validación local terminadas el 7 de octubre.** Hay 102 incidentes trazados: 65 originales y 37 adicionales, con 27 altos, 65 medios y 10 bajos en la clasificación histórica. Los riesgos de proveedores, dependencias sin parche y capacidad del VPS se detallan aparte. El código está corregido en este workspace; no se ha desplegado.

## Alcance y método

Proyecto Next.js/React, PostgreSQL/Prisma, autenticación Credentials/Google, catálogo y búsqueda, favoritos/carrito, checkout, cupones/reservas, estados/pagos, reseñas/medios, correos, 19 páginas administrativas y 66 archivos de API. Inventario final: 521 archivos de código/scripts, excluyendo dependencias, tests y documentación. [Resumen de validación, inventario y hash de fuentes](./evidencia/validacion-final.json). El inventario delimita superficies; no significa que cada combinación funcional haya sido ejecutada en navegador.

Se combinaron revisión fuente, pruebas de rutas/acciones reales con proveedores simulados, PostgreSQL aislado real, navegación local autenticada y revisión independiente entre áreas. Se comprobaron carreras mediante respuestas tardías, solicitudes simultáneas y fallos entre pasos. Se conservó [el informe original](../auditoria-2026-10-03/AUDITORIA-COMPLETA.md) como evidencia histórica.

El destino indicado es un VPS propio, sin objetivos numéricos de tráfico todavía. Las mediciones locales no se presentan como capacidad certificada del VPS. No se accedió a producción ni se realizaron pagos, correo, purgas Cloudflare o borrados R2 reales.

## Severidad y trazabilidad de los 65 hallazgos originales

La clasificación original contiene 15 altos, 44 medios y 6 bajos. Crítico confirmado en producción: ninguno demostrado, porque producción no fue accesible. Dos riesgos críticos de dependencias se mitigaron actualizando versiones; el riesgo crítico condicionado de Cashea continúa protegido por bloqueo de activación y correlación obligatoria. Las condiciones y límites no se mezclan con bugs demostrados.

| ID | Severidad original | Problema original | Estado y registro de corrección |
| --- | --- | --- | --- |
| ADM-01 | Alto | Renombrar categoría separa sus productos y vacía la categoría pública. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-02 | Alto | Guardar una edición puede reponer stock consumido por otra venta. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-03 | Alto | Guardados simultáneos restauran ajustes de contacto o cuentas de pago anteriores. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-11 | Alto | Recalcular con factor 1.234 aumenta otra vez el precio sin cambiar el factor. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| OPS-01 | Alto | El schedule omite backups; reinstalarlo reemplaza otros cron del root. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| OPS-03 | Alto | El deploy aborta ante fallo de systemctl start antes de ejecutar rollback. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| SEC-01 | Alto | Pre-registro con contraseña del atacante conserva acceso tras Google de la víctima. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| SEC-02 | Alto | Un cliente puede asociar y borrar fotos de reseñas ajenas. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| SEC-03 | Alto | CATALOG puede borrar banners y QR financiero usando DELETE de videos. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PD-01 | Alto | Se puede entregar un pedido impagado; entra además en ingresos validados. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-02 | Alto | Un envío con snapshot viejo revive una cancelación y desacopla inventario/cupón. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-04 | Alto | Dos reversiones concurrentes liberan dos usos por un único canje. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-07 | Alto | Binance elude el tope de pedidos impagados y puede retener inventario. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-13 | Alto | Revertir descuento modifica el total de pedidos ya cobrados sin nuevo cobro. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| DEP-01 | Alto | Next afectado por DoS Server Actions y guard mínimo desactualizado. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| ADM-04 | Medio | Cerrar el modal durante guardado puede borrar un video recién publicado. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-05 | Medio | Crear/editar un producto con placeholder falla por contrato de imagen. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-06 | Medio | El selector no permite iniciar un transportista personalizado. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| ADM-07 | Medio | Banners/Home muestran cambios rechazados; Home ofrece acciones de otros permisos. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-08 | Medio | El error de validación de categorías llega como objeto y rompe React. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-09 | Medio | CSV crea productos con categoría sin crear el registro de navegación. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-10 | Medio | CSV cambia precio y conserva costos, margen/base y oferta incoherentes. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-12 | Medio | Banners/promos aceptan al crear datos que rechazan al editar. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-13 | Medio | Cupones cambian horario con servidor y navegador en zonas distintas. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-15 | Medio | La UI deja inaccesibles cupones antiguos al superar 500 registros. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-16 | Medio | Diálogos/tablas administrativas incompletos para teclado y lector de pantalla. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-17 | Medio | Una búsqueda antigua sobrescribe resultados nuevos en estanterías Home. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-19 | Medio | Analítica subcuenta pendientes e infla o limita ganancias sin indicar el alcance. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-20 | Medio | Un guardado fallido borra campos del borrador de producto. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-21 | Medio | Cambiar filtro mientras carga más pedidos deja el botón ocupado indefinidamente. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-22 | Medio | Errores de carga parecen listas vacías o dejan formularios guardando. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-23 | Medio | Se guardan imágenes externas que el optimizador rechaza en producción. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-24 | Medio | Reemplazar imagen de A puede borrar el objeto que también usa B. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| OPS-04 | Medio | Portada HTTP200 puede ocultar DBhealth503 y aceptar un deploy averiado. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| SEC-06 | Medio | OPERATIONS como único permiso redirige /admin hacia sí mismo. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| SEC-07 | Medio | Defaults o teléfono vacío/espacios impiden abrir configuración para repararla. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PD-03 | Medio | Cancelar un slot inferior bloquea usos legítimos disponibles del cupón. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-05 | Medio | Repetir checkout sin referencia crea pedidos/reservas duplicados. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-06 | Medio | Referencia bancaria igual devuelve un pedido de otro carrito/método. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-08 | Medio | Editar/borrar cupón compite con un canje y rompe límites/historial. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-09 | Medio | Borrar pedido marca prueba DELETED antes de confirmar borrado R2. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-10 | Medio | Reinicio después del claim de purga deja DELETING sin recuperación. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-11 | Medio | Fecha BCV igual oculta tasa faltante/corrupta y cron reporta éxito. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| PD-12 | Medio | BCV puede sustituir una publicación reciente por otra anterior. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| WEB-01 | Medio | Comprar ahora puede refrescar antes del PATCH y perder la línea nueva. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| WEB-02 | Medio | Respuesta tardía del carrito A se aplica tras cambiar a la cuenta B. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| WEB-03 | Medio | Ordenar catálogo oculta agotados sin cambiar disponibilidad. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| WEB-04 | Medio | Mapper cacheado pierde freeShipping; etiquetas varían por navegación. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| WEB-05 | Medio | Búsqueda fuera de rango anuncia cero productos aunque sí existen. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| WEB-06 | Medio | Permissions-Policy bloquea Detectar mi ubicación en SEO Local. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| WEB-07 | Medio | La UI marca como fresca una tasa fallback o sin fecha comprobada. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| DEP-02 | Medio | Bearer % causa error500 en vez de denegación401. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| PU-01 | Medio | Límite/fusión de favoritos diverge; UI guarda altas rechazadas silenciosamente. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PU-02 | Medio | Fallo de fusión devuelve [] y elimina favoritos locales del invitado. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PU-03 | Medio | Correo rechazado se registra como enviado en reposición y abandono. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PU-04 | Medio | Nuevo checkout reactiva recordatorios después de confirmar baja. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PU-05 | Medio | Segunda oleada invalida recuperar/baja del primer correo. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PU-06 | Medio | Carrito y recuperación conservan retirados con stock y enlace404. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PU-07 | Medio | Recordatorio72h ignora actividad reciente y puede llegar al comprar. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| ADM-14 | Bajo | Eliminar cupón usado anuncia borrado permanente, pero solo desactiva. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| ADM-18 | Bajo | Stock=3 es bajo en el filtro, pero no en contador/badge. | Implementado; [evidencia y límites](./correcciones-admin.md). |
| SEC-10 | Bajo | Exportación CSV de clientes/pedidos no registra actor ni filtros. | Implementado; [evidencia y límites](./correcciones-seguridad-publico.md). |
| PD-15 | Bajo | Ayuda Binance pide un segundo paso que la aprobación ya ejecuta. | Implementado; [evidencia y límites](./correcciones-pedidos.md). |
| WEB-08 | Bajo | Dirección hardcodeada discrepa de la configuración pública del negocio. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |
| WEB-09 | Bajo | Usuarios muestra el título móvil de Tienda y pagos. | Implementado; [evidencia y límites](./correcciones-tienda-vps.md). |

ADM-04 y ADM-24 se tratan con prioridad alta al corregir, por pérdida/borrado de medios publicados. Sus ampliaciones de concurrencia y referencias compartidas se integran al mismo incidente, evitando duplicar el conteo. SEC-04/05/08/09 y PD-14 ya estaban consolidados en PD-01, ADM-03/07/19/06.

## Hallazgos adicionales

Los registros por área contienen causa, archivos, solución y pruebas. Esta tabla separa incidentes adicionales de ampliaciones de un incidente original; las pruebas repetidas y los avisos transitivos de una misma dependencia no aumentan el número de bugs.

| ID | Severidad | Hallazgo adicional corregido | Registro |
| --- | --- | --- | --- |
| ESC-01 | Alto | Ofertas carga todo el catálogo para paginar en memoria. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ESC-02 | Medio | Historial de cuenta carga todos los pedidos y partidas. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ESC-03 | Alto | El build precalcula todo el catálogo, incluidos inactivos. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ESC-04 | Alto | Sitemap no acotado ni cacheado supera el límite al crecer. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ESC-05 | Alto | Pools redundantes y esperas sin presupuesto explícito. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ESC-06 | Alto | Rate limit local sin límite de memoria y reintentos Redis sin pausa. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ESC-07 | Medio | Comodines/valores parcialmente numéricos alteran consultas. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ESC-08 | Alto | Fallo de tasa SSR afecta el layout global. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| WEB-10 | Medio | Consulta de pedido invitado apunta a ruta de propietario. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| WEB-11 | Medio | Historial entrega campos internos al cliente por RSC. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| WEB-12 | Medio | Refresh invitado elimina altas hechas durante la consulta. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| WEB-13 | Medio | Merge y reintento de login pierden cambios concurrentes. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| WEB-14 | Medio | Cuenta llena acepta alta en UI pero rechaza PATCH indefinidamente. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| DEV-01 | Bajo | Caché immutable en desarrollo conserva chunks antiguos y rompe login. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| OPS-05 | Alto | Token de purga visible en argumentos y respuesta externa en logs. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| OPS-06 | Medio | Retención confunde prefijos de instancias y acumula llaves completas. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| OPS-07 | Alto | Backup grande usa PUT único sin transferencia multipart recuperable. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| OPS-08 | Medio | Cron/health calcula puerto antes de leer entorno y llama otra instancia. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| DEP-03 | Medio | Parser CSS con complejidad cuadrática; aviso nuevo del 5 de octubre. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| DEP-04 | Alto | Actualización de Next falla en build al mantener middleware Edge deprecado. | [Tienda/VPS](./correcciones-tienda-vps.md) |
| ADM-N01 | Alto | Eliminar categoría ocupada deja productos sin navegación. | [Administración](./correcciones-admin.md) |
| ADM-N02 | Medio | CSV omite columnas y sobrescribe datos existentes con defaults. | [Administración](./correcciones-admin.md) |
| ADM-N03 | Medio | Lectura fallida deja defaults editables y guardado pisa borrador nuevo. | [Administración](./correcciones-admin.md) |
| ADM-N04 | Medio | Home/atajos ofrecen controles sin el permiso requerido. | [Administración](./correcciones-admin.md) |
| ADM-N05 | Medio | Margen cero rechazado y rangos/configuración numérica inconsistente. | [Administración](./correcciones-admin.md) |
| ADM-N06 | Bajo | Aviso de estado masivo contradice lifecycle corregido. | [Administración](./correcciones-admin.md) |
| ADM-N07 | Medio | PUT parcial borra tracking omitido. | [Administración](./correcciones-admin.md) |
| ADM-N08 | Medio | PATCH de guía y correcciones de transportista/URL no notifican. | [Administración](./correcciones-admin.md) |
| ADM-N09 | Bajo | Dashboard cuenta nombres de producto en vez de registros de categoría. | [Administración](./correcciones-admin.md) |
| PU-08 | Medio | Solicitud de reseña se marca enviada aunque proveedor la rechace. | [Seguridad/público](./correcciones-seguridad-publico.md) |
| SEC-N01 | Medio | Purga por IDs borra token renovado o carrito reactivado entre lectura y escritura. | [Seguridad/público](./correcciones-seguridad-publico.md) |
| SEC-N02 | Alto | Token antiguo/reset y cambios de correo compiten; estado y correo no se persisten juntos. | [Seguridad/público](./correcciones-seguridad-publico.md) |
| PU-N01 | Alto | Primeros jobs atascados bloquean nuevos lotes de reposición, reseña y abandono. | [Seguridad/público](./correcciones-seguridad-publico.md) |
| PD-N01 | Medio | Reenvío pierde descuentos/snapshots y anuncia envío sin aceptación. | [Pedidos](./correcciones-pedidos.md) |
| PD-N02 | Medio | Correo de checkout reetiqueta importes USD históricos como Bs sin tasa. | [Pedidos](./correcciones-pedidos.md) |
| PD-N03 | Medio | Reenvío de invitado enlaza a páginas que exigen sesión/token ausente. | [Pedidos](./correcciones-pedidos.md) |
| DEV-02 | Bajo | Reset/seed ignoran nuevas tablas, pago, totales y secuencia de pedidos. | [Pedidos](./correcciones-pedidos.md) |

Esta pasada añade 37 incidentes: 12 altos, 21 medios y 4 bajos. Con los 65 originales, hay 102 incidentes trazados; la clasificación original de ADM-04/24 se mantiene para comparar revisiones, pero su prioridad de corrección se elevó a alta. DEP-04 se encontró validando la actualización hecha durante la propia auditoría. Las mejoras de ownership, leases, outbox financiero y coherencia de tracking amplían los incidentes correspondientes y no se cuentan por segunda vez. Los riesgos condicionados de proveedores y avisos transitivos de dependencias se presentan aparte.

## Validación ejecutada

| Comprobación final | Resultado | Evidencia |
| --- | --- | --- |
| Suite general, 92 archivos | **830 aprobadas, 0 fallos**, 8 opt-in omitidas en este comando | [JSON](./evidencia/vitest-final.json) |
| Pedidos sobre PostgreSQL real aislado | **6/6 aprobadas**, después del helper final de confirmación | [JSON](./evidencia/pedidos-postgres-final.json) |
| Seguridad sobre PostgreSQL real aislado | **30/30 aprobadas**, incluye clientes 101, producto 11 y pedido 26 | [JSON](./evidencia/seguridad-postgres-final.json) |
| TypeScript final, con configuración original restaurada | **Aprobado** | [Salida](./evidencia/typecheck-final.txt) |
| ESLint global | **0 errores, 36 advertencias** | [Salida](./evidencia/lint-final.txt) |
| Guardas de versiones/origen/RBAC/páginas admin | **Las cuatro aprobadas** | [Salida](./evidencia/guardas-final.txt) |
| Prisma | **31 migraciones aplicadas**, incluidas las 4 nuevas; cliente generado | [Estado](./evidencia/migraciones-final.txt), [generación](./evidencia/prisma-final.txt) |
| Build de producción Next 16.3.8 / Turbopack | **Aprobado**, 69 páginas generadas, `proxy` reconocido | [Salida](./evidencia/build-final.txt) |
| UTF-8 y diff | **636 archivos sin UTF-8 inválido; diff sin errores de espacios** | [Resultado](./evidencia/integridad-fuentes-final.json) |
| Dependencias de ejecución | **0 avisos** | [npm audit](./evidencia/npm-audit-runtime-final.json) |
| Dependencias incluyendo desarrollo | **7 altos**, misma raíz `braces`; sin medios/críticos | [npm audit](./evidencia/npm-audit-completo-final.json) |

Las 8 omitidas son las 6 de pedidos ejecutadas aparte y 2 de escala de catálogo ejecutadas el 4 de octubre con opt-in. No son tests fallidos. Las cifras dirigidas de cada área se solapan con la suite general y no se suman para inflar cobertura. Las advertencias de lint son principalmente variables/argumentos no utilizados y dos avisos de React Compiler sobre `watch` de React Hook Form, donde el compilador omite memoización. No se desactivaron reglas para esconder errores.

El build se hizo con PostgreSQL local y configuración ficticia de proveedores; no instala migraciones ni modifica el build del VPS. No equivale a ejecutar `next start` en producción. Ese arranque fue rechazado por la revisión automática de la herramienta en la primera pasada, sin motivo detallado; no se intentó eludir el rechazo. Se verificaron 13 vistas administrativas en navegación local autenticada y páginas públicas; [snapshots](./evidencia/admin-dom-parcial.json). Es un smoke visual, no ejecución de cada botón ni certificación de accesibilidad en todos los dispositivos.

La prueba de catálogo usó 5.000 productos sintéticos, 4.500 activos y 3.857 disponibles, con 50 lecturas simultáneas y pool de 10 conexiones. Hubo 150 sentencias SQL reales; páginas/filtros/totales y orden estable coincidieron. p50: 187,091 ms; p95: 349,160 ms; p99: 398,414 ms. Datos propios de la prueba eliminados (0 restantes). [Resultados completos y limitaciones](./evidencia/escala-catalogo-local.json). Se midieron consultas locales con escenarios calentados, sin HTTP/render/media ni escrituras concurrentes.

Las pruebas reales de pedidos comprobaron reserva única con cuatro POST equivalentes, competencia de seis compradores por una unidad, reversión única de cupón, reutilización de slots, tombstone del intento borrado y rollback de outbox. Seguridad comprobó topes, claims, leases, bajas y aceptación de proveedor simulada sobre PostgreSQL real. Configuración preservó los dos cambios de diez pares simultáneos.

## Pendientes que necesitan el servidor o proveedor real

- Cashea automático: permanece desactivado hasta disponer del contrato autoritativo y validación sandbox. Guardas, tokens/idempotencia y transiciones están corregidos; el adaptador no se presenta como operativo.
- Dependencias de ejecución: npm audit runtime 0 avisos. Herramientas de desarrollo: 7 altos derivados de braces, sin versión corregida publicada en el aviso revisado. Riesgo abierto, aislado de entrada pública y documentado; no se ocultó ni se aplicó un downgrade incompatible. [Aviso](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- VPS: validar restauración real del backup privado, actualización/migraciones, correo, R2, readiness, certificados, disco y carga HTTP. No se inventa un resultado sin el servidor.
- Datos históricos: revisar pedidos legítimos sin paidAt antes de activar legacyPaidConfirmed; revisar imágenes/direcciones antiguas y medios sin propietario antes de migrar o purgar.

## Ruta de crecimiento

[Plan de capacidad y operación](./CAPACIDAD-VPS.md) define etapas, métricas, límites actuales y criterios de ampliación. Las correcciones limitan lecturas, conexiones, memoria y tareas; mantienen integridad al competir por stock/cupones y permiten recuperar trabajos tras reinicios. Ninguna auditoría del código puede certificar ausencia de fallos futuros o capacidad ilimitada.
