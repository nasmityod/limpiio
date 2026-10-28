# Segunda auditoría y correcciones — 4 de octubre de 2026

Alcance: código fuente completo, tienda pública, cuenta, checkout, panel administrativo, base de datos, tareas y despliegue en VPS. Se conserva la auditoría del 3 de octubre como evidencia del comportamiento anterior. Los hallazgos de aquella revisión se contrastan nuevamente y las correcciones se registran en los documentos por área.

**Cerrado el 7 de octubre de 2026.** [Informe consolidado](./AUDITORIA-COMPLETA.md): 102 incidentes trazados y corregidos en fuente, 830 pruebas generales y 36 con PostgreSQL aprobadas; build, tipos y cuatro guardas aprobados. Los riesgos de proveedores, herramientas sin parche y validación en VPS se mantienen explícitos. Las evidencias dirigidas se conservan como historial y la validación final es la referencia de cierre.

## Trabajo por área

| Área | Documento | Alcance |
| --- | --- | --- |
| Tienda e infraestructura | correcciones-tienda-vps.md | WEB, DEP, OPS y cargas no acotadas descubiertas en esta revisión |
| Administración | correcciones-admin.md | ADM, permisos, contratos y consistencia transaccional |
| Pedidos y pagos | correcciones-pedidos.md | PD, PC, idempotencia, stock, estados y limpieza |
| Seguridad y público | correcciones-seguridad-publico.md | SEC, PU, identidad, archivos, carrito y notificaciones |

## Nuevos hallazgos de crecimiento

| ID | Severidad | Problema confirmado | Corrección implementada y verificada |
| --- | --- | --- | --- |
| ESC-01 | Alto | Ofertas carga todo el catálogo elegible y pagina en memoria. | Conteo y página en SQL, con stock y orden estable. |
| ESC-02 | Medio | Historial carga todos los pedidos y partidas de un cliente. | Páginas de 20 y un índice compuesto. |
| ESC-03 | Alto | Build precalcula todas las fichas, incluidos productos inactivos. | Precálculo limitado; generación bajo demanda de los demás. |
| ESC-04 | Alto | Sitemap consulta todas las fichas en cada petición y supera el límite del protocolo al crecer. | Índice y fragmentos limitados, con caché e invalidación. |
| ESC-05 | Alto | El pool se crea antes de reutilizar Prisma; recargas pueden dejar pools sin uso, sin límites de espera explícitos. | Instancia compartida y límites configurables. |
| ESC-06 | Alto | Buckets de rate limit locales crecen con identidades nuevas; fallo Redis agrega espera a cada solicitud. | Memoria acotada y pausa temporal de reintentos; política distribuida estricta configurable. |
| ESC-07 | Medio | Comodines de búsqueda se interpretan como patrones y números parcialmente válidos se aceptan. | Literales escapados y parámetros estrictos/acotados. |
| ESC-08 | Alto | Una lectura fallida de la tasa en SSR puede afectar el layout global. | Estado de respaldo explícito y tasa obsoleta visible. |

No se ha accedido a pagos reales ni se ha modificado la base de datos de producción. Las pruebas de integración usan una base local aislada. La escalabilidad se valida por límites, integridad y mediciones; no existe garantía de capacidad ilimitada ni ausencia de todo bug futuro.
