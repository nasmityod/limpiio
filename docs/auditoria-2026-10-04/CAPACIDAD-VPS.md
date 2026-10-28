# Capacidad, lanzamiento y recuperación en VPS

Este plan acompaña la auditoría del 4 de octubre de 2026. El dueño indicó VPS propio y crecimiento gradual; aún no hay especificación de CPU/RAM/disco ni objetivos de tráfico. Se proponen criterios medibles; no se atribuye capacidad al servidor sin probarlo.

## Límites implementados

| Recurso | Presupuesto actual | Cómo crecer |
| --- | --- | --- |
| PostgreSQL por proceso Node | Pool10; conexión5s; sentencia30s; lock10s; conexiones idle30s y vida300s. | Sumar pools de web/jobs/scripts más reserva administrativa. Debe ser menor que max_connections. Medir cola antes de aumentar workers. |
| Catálogo/ofertas |24 tarjetas por página, COUNT separado, stock/activos consistentes y orden estable. | Revisar planes y latencia de filtros con datos representativos. Páginas muy profundas pueden necesitar cursor en vez de OFFSET. |
| Cuenta/panel |20 pedidos por página en cuenta; inventario, pedidos, cupones, usuarios y reseñas con límites/paginación. | Exportaciones masivas y reportes contables completos deben pasar a jobs cuando su duración/memoria lo justifique. |
| Build/ISR |100 fichas activas precalculadas por defecto, configurable0..2000; resto bajo demanda. | Medir primer acceso y calentamiento. No aumentar precálculo a todo el catálogo. |
| Sitemap | Fragmentos de10000; caché300s; máximo50000 fragmentos por índice. | Crear jerarquía adicional antes de exceder el límite; medir OFFSET profundo. |
| Rate limit | Redis requerido en producción para operaciones sensibles; fallback local cap20000 cuando se acepta explícitamente. | Compartir Redis entre procesos/réplicas. Fallar cerrado si no está disponible en las operaciones críticas. |
| Carrito/reservas |25 productos distintos;3 pedidos impagados y100 unidades reservadas por cuenta, configurables en el último caso. | Ajustar al negocio con pruebas de stock, expiración y concurrencia. No elimina el abuso mediante múltiples cuentas. |
| Correos/trabajos | Outbox en la transacción del negocio, claims/leases y reintentos; lotes limitados y presupuesto de duración. | Medir antigüedad del pendiente más viejo. Añadir ejecutores compartiendo claims; no disparar envíos sin deduplicación. |
| Backups | Privado, streaming multipart; local7d/R2 30d; nombres aislados por instancia. | Medir dump/upload/restore; establecer RPO/RTO y agregar archivado WAL/PITR si un dump diario no cumple la pérdida máxima tolerable. |

## Ensayo de capacidad en staging

Usar un VPS de staging con la misma configuración de producción y proveedores sandbox/simulados. Separar pruebas de lectura de las que reservan stock. Los objetivos siguientes son una propuesta de aceptación técnica, no capacidad demostrada ni compromiso comercial.

1. Sembrar10.000 productos y100.000 usuarios/pedidos sintéticos; conservar distribución de categorías, marcas, ofertas y clientes frecuentes. Repetir con100.000 productos si esa es la siguiente etapa de crecimiento. Evitar datos personales reales.
2. Ejecutar10,25,50 y100 sesiones concurrentes durante15min por etapa, con lectura de catálogo/búsqueda/ficha, carrito y cuenta. Incluir caché fría y caliente; aumentar sólo mientras la etapa anterior cumpla objetivos.
3. Registrar p50/p95/p99 HTTP, tasa de5xx,429 esperados, CPU, memoria RSS, event loop, conexiones en uso/espera, locks, consultas lentas y uso/IO de disco. Objetivos propuestos:5xx<0,1%; p95 lectura<1s con caché caliente; ausencia de duplicados/reservas negativas y crecimiento de memoria que se estabilice. El dueño puede ajustar latencia según UX y presupuesto.
4. Competir por la última unidad, repetir la misma clave de checkout y cancelar/revertir en paralelo. Exigir un único resultado financiero, contador/stock correcto y notificación única en outbox.
5. Reiniciar web y PostgreSQL; interrumpir un job después del claim y después de aceptación del proveedor. Comprobar recuperación de lease sin duplicar correo, stock o canjes.
6. Simular Redis caído, correo/R2 rechazado, timeout, disco lleno y fallo de swap/arranque. Confirmar error visible, preservación del borrador/selección, tareas recuperables y rollback del servicio.

La medición local incluida usa5.000 productos y50 lecturas SQL simultáneas (p95 349,160ms). No incluye HTTP, rendering, red del VPS, imágenes, tráfico de escritura o cold cache; es una referencia de consulta, no una certificación del plan anterior.

## Publicar la actualización

Antes del cambio, guardar un backup privado comprobado y ensayar su restauración en otra base. Aplicar las cuatro migraciones20261004 y regenerar Prisma con el mismo entorno de systemd. El script de deploy conserva el build anterior y valida readiness de aplicación/DB; instalar el cron por bloque propio, incluyendo backups, email-delivery y limpieza de huérfanos. Revisar Redis, secretos estables del outbox, permisos del bucket privado y URLs/puerto de la instancia.

Revisar pedidos históricos sin paidAt antes de marcar legacyPaidConfirmed. La actualización no infiere que un pedido está pagado por su etiqueta de estado. Revisar medios históricos sin dueño y URLs editoriales que no cumplen el CDN permitido; no borrarlos a ciegas. Cashea automático queda desactivado hasta completar contrato y pruebas sandbox.

## Operación y siguientes etapas

Establecer alertas para readiness503,5xx sostenidos, agotamiento del pool, retraso de cron, edad del backup, fallo de restore ensayado, cola pendiente/REVIEW y espacio de disco. Diferenciar cola aceptada por proveedor de entrega al buzón. Registrar identificadores de evento sin tokens, cuerpos de correo ni credenciales en logs.

Definir pérdida máxima de datos (RPO) y tiempo de recuperación (RTO). Un backup diario puede perder casi24h de cambios; la retención no reduce ese intervalo. Para una pérdida admisible menor, configurar una copia base física y archivado continuo WAL, y ensayar PITR; `pg_dump` no sustituye la copia base requerida para reproducir WAL. Conservar copia fuera del VPS y documentar responsable/procedimiento de restore. [PITR PostgreSQL](https://www.postgresql.org/docs/current/continuous-archiving.html).

Una instancia puede crecer verticalmente mientras cumpla el ensayo. Antes de varias réplicas, compartir caché/invalidación de Next, versionado de build y secretos de Server Actions; coordinar Redis y los pools de DB. Las tareas ya usan claims de PostgreSQL, pero aumentar web workers por sí solo no demuestra distribución correcta de caché. [Autoalojamiento Next.js](https://nextjs.org/docs/app/guides/self-hosting).

El recálculo masivo de precios es transaccional y aborta íntegro al superar timeout120s; un catálogo que lo exceda necesita job con seguimiento y cálculo por versión antes de habilitar ese volumen. Rentabilidad actual se presenta como estimación del ranking, con costos actuales; una contabilidad completa necesita costos históricos por partida. Son límites explícitos de producto/datos, no resultados fingidos de una prueba de escala ilimitada.
