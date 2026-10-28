# Auditoría de pedidos, pagos, inventario, cupones y datos

Fecha del informe: 3 de octubre de 2026, America/Caracas. Revisión del checkout web y WhatsApp, operaciones de pedidos del panel, Binance manual, Cashea, cupones, precios monetarios, tasa BCV, envío, comprobantes, cron y migraciones. No se modificó código de aplicación ni datos de producción. Las reproducciones con escrituras se hicieron exclusivamente contra PostgreSQL local aislado `127.0.0.1:55439/limpio_audit_test` y servidor E2E `http://localhost:34567`; se usó rollback o se eliminaron las fixtures temporales propias al terminar. Resend estaba deshabilitado por `E2E_MODE=1`.

Se distinguen errores del código actual de riesgos de la futura activación automática de Cashea. No se comprobó que Cashea automático esté habilitado en producción: `.env.example` lo deja apagado. Los hallazgos de activación no se deben presentar como pagos fraudulentos observados.

## Resumen de hallazgos actuales

| ID | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| PD-01 | Alto | Los estados permiten entregar pedidos sin pago validado y contaminar ingresos | Repro HTTP local y revisión |
| PD-02 | Alto | Los cambios de estado ordinarios pisan cancelaciones concurrentes | Flujo y consultas concretas |
| PD-03 | Medio | Cancelar un uso inferior de un cupón bloquea usos todavía disponibles | Repro helper real + PostgreSQL |
| PD-04 | Alto | Cancelar simultáneamente el mismo pedido puede liberar dos usos globales de cupón | Repro helper real + PostgreSQL concurrente |
| PD-05 | Medio | Repetir checkout sin referencia crea dos pedidos y descuenta stock dos veces | Repro HTTP local |
| PD-06 | Medio | La referencia bancaria como idempotencia colisiona entre métodos/carritos | Consulta y flujo concreto |
| PD-07 | Alto | Binance omite el límite de pedidos impagados y puede bloquear inventario indefinidamente | Guards + cron |
| PD-08 | Medio | Editar/eliminar cupones concurrentemente con canjes puede romper límites/historial | Consultas y FK Cascade |
| PD-09 | Medio | Borrar pedidos declara comprobantes borrados antes de borrar realmente en R2 | Ruta y cron |
| PD-10 | Medio | Un reinicio deja comprobantes en DELETING sin recuperación | Máquina de estados y cron |
| PD-11 | Medio | El cron BCV responde éxito con tasa inexistente si la fecha no cambió | Orden de comprobaciones |
| PD-12 | Medio | El cron BCV acepta publicaciones anteriores y fechas sin validación | Parser + persistencia |
| PD-13 | Alto | Se puede elevar el total de un pedido ya cobrado/entregado sin nuevo cobro | Ruta y cálculo de ingresos |
| PD-14 | Bajo | No funciona seleccionar transportista personalizado en el panel | Handler del selector |
| PD-15 | Bajo | La ayuda de Binance pide un segundo paso que ya desaparece | Copy + ruta de aprobación |

Los hallazgos que comparten una causa se agrupan; el conteo no incluye por separado cada ruta que repite el mismo defecto. La política de estados es un problema de integridad funcional y financiera; los controles de autorización deben evaluarse junto con el informe de seguridad.

## PD-01 — Alto — Avance a entrega y a ingresos sin validar pago

**Ubicación:** [ruta status, línea 239](D:/limpio/app/api/orders/%5Bid%5D/status/route.ts:239), [ruta bulk, línea 153](D:/limpio/app/api/orders/bulk-status-update/route.ts:153), [revenuePeriodWhere, línea 146](D:/limpio/lib/analytics-orders.ts:146), [menú del panel](D:/limpio/app/components/admin/StatusUpdateMenu.tsx:77).

La ruta individual valida que el destino pertenezca al conjunto de estados y bloquea Binance pendiente o `stockDeducted=false`, pero no exige una transición válida, `paidAt` ni pago confirmado. Con stock descontado permite directamente `Pendiente → En Proceso`, `Pendiente → Enviado` y `Pendiente → Entregado`. El menú del panel también ofrece esos destinos; no es únicamente una llamada API fabricada. Bulk permite `En Proceso` sin fijar ni comprobar `paidAt`. Las estadísticas consideran `En Proceso/Enviado/Entregado` ingresos validados y, si `paidAt` falta, usan `createdAt` como legado: un pedido moderno impagado entra en ingresos como si fuera legado.

**Reproducción ejecutada:** fixture `Pendiente`, `stockDeducted=true`, `paidAt=null`, tracking vacío; login de administrador E2E; `PUT /api/orders/<id>/status {"status":"Entregado"}`. Resultado `HTTP 200`, `status=Entregado`, `paidAt=null`, `trackingNumber=null`. La fixture se eliminó después. No se enviaron correos reales.

**Impacto:** despacho o entrega antes de validar pago; ingresos inflados; desaparición de las acciones de validar pago una vez avanzado el estado; pedidos sin fecha real de cobro. Enviar sin guía no se cuenta por sí solo como bug, porque el diálogo dice explícitamente que los campos son opcionales; el problema confirmado es el salto del pago y de la secuencia de estados.

**Corrección:** una máquina de estados compartida por ruta individual, bulk, acciones de pago y Cashea. La aprobación de pago debe ser el único paso a `En Proceso` desde pendiente; envío exige pago validado y entrega exige origen válido. Definir un flujo específico de retiro en tienda. Usar un indicador explícito de legado para la analítica, no `paidAt=null` en cualquier pedido.

**Test faltante:** cada origen/destino y método; impedir que un pedido moderno impagado cuente como venta al avanzar estado.

## PD-02 — Alto — Cambios de estado con snapshots obsoletos

**Ubicación:** [status 57](D:/limpio/app/api/orders/%5Bid%5D/status/route.ts:57), [status 239](D:/limpio/app/api/orders/%5Bid%5D/status/route.ts:239), [bulk 153](D:/limpio/app/api/orders/bulk-status-update/route.ts:153), [efectos de cancelación 715](D:/limpio/lib/checkout-order.ts:715).

La cancelación tiene una escritura condicionada al estado, pero el camino ordinario usa `order.update({where:{id},data:{status}})` y bulk `updateMany({where:{id:{in:eligibleIds}}})`, sin condición de estado/inventario leído. Las comprobaciones de stock y elegibilidad ocurren antes de esas escrituras.

**Cadena concreta:** A lee un pedido `En Proceso/stockDeducted=true` para enviarlo; B lo cancela, reclama el stock y lo devuelve (`stockDeducted=false`); A continúa y escribe `Enviado` por ID. Queda pedido enviado con sus unidades disponibles para otra compra. El bloqueo previo de `stockDeducted=false` no sirve porque A lo evaluó cuando aún era true. Bulk tiene la misma carrera y puede revivir una cancelación.

Otra variante: cancelación lee pendiente; una petición de envío cambia el estado antes del claim de stock; el claim y la transición de cancelación pierden, pero `applyOrderCancellationEffectsInTransaction` revierte el cupón igualmente. La cancelación puede devolver el estado avanzado sin haberlo cancelado, habiendo liberado un cupón de una venta todavía vigente.

**Impacto:** sobreventa, stock inconsistente, cupón/historial desacoplados, mensajes y estado final que dependen del orden de llegada.

**Corrección:** todos los cambios por compare-and-swap (`id + status + stockDeducted/version`); si pierde la transición, responder 409 y abortar efectos. Ejecutar la transición ganadora y sus efectos en una transacción. Releer/validar bulk dentro de su transacción. Las pruebas existentes de cancelación simulan reclamaciones de inventario secuenciales, pero no esta carrera con el envío.

## PD-03 — Medio — Los slots de cupón no reutilizan huecos

**Ubicación:** [lib/coupons.ts 279](D:/limpio/lib/coupons.ts:279), [índice único parcial](D:/limpio/prisma/migrations/20260614170000_coupon_redemption_partial_unique_index/migration.sql:6).

El slot nuevo es `activeCount + 1`. Esta fórmula presupone que los slots activos son consecutivos; al cancelar un pedido inferior dejan de serlo.

**Reproducción ejecutada con helpers reales y rollback:** cupón `perUserLimit=2`; mismo usuario tiene slots 1 y 2; revertir el slot 1 mediante `revertCouponRedemptionInTransaction`; queda slot 2 activo y slot 1 revertido. `redeemCouponInTransaction` calcula `activeCount=1 → perUserSlot=2`; el índice parcial detecta el slot 2 ocupado y el helper devuelve `Alcanzaste el límite de usos de este cupón.`. El usuario sólo tenía un canje activo, por debajo de su límite.

**Impacto:** se promete liberar un uso al cancelar, la prevalidación lo acepta, y el checkout final rechaza una compra legítima. Reintentar no lo arregla.

**Corrección:** buscar el primer slot libre del intervalo 1..límite bajo el mecanismo de concurrencia existente, o sustituir slots por un contador por cupón/usuario con reclamación atómica. Añadir prueba de huecos no terminales y reducción de límites.

## PD-04 — Alto — La reversión del cupón no es idempotente bajo concurrencia

**Ubicación:** [lib/coupons.ts 330](D:/limpio/lib/coupons.ts:330), [efectos de cancelación](D:/limpio/lib/checkout-order.ts:706), [ruta status 152](D:/limpio/app/api/orders/%5Bid%5D/status/route.ts:152), [ruta bulk 126](D:/limpio/app/api/orders/bulk-status-update/route.ts:126).

El helper lee `revertedAt`, decrementa el cupón y luego hace `couponRedemption.update` por ID. No reclama la reversión con `where:{id,revertedAt:null}`. En pedidos WhatsApp pendientes con `stockDeducted=false` no se toma previamente el lock de la orden mediante el claim de stock; dos cancelaciones pueden leer el mismo canje activo y ambas decrementarlo. También es relevante donde el estado original no restaura inventario.

**Reproducción ejecutada:** cupón con 2 canjes activos y `usedCount=2`; dos transacciones reales leyeron simultáneamente el mismo canje antes de revertirlo mediante el helper real. Resultado final: `usedCount=0`, pero `activeRedemptions=1`. Se eliminaron sólo las fixtures de este probe. Se forzó el entrelazado con una barrera alrededor de las lecturas, no se sustituyó la lógica del helper ni la BD.

**Impacto:** el límite global deja de representar los canjes activos; un cupón agotado puede volver a aceptarse de más. No requiere stock duplicado para corromper la contabilidad del cupón.

**Corrección:** reclamar primero el canje con `updateMany({where:{id,revertedAt:null},data:{revertedAt:now}})` y decrementar sólo si `count=1`, todo en la misma transacción. Añadir prueba concurrente real de cancelaciones de pedidos WhatsApp.

## PD-05 — Medio — Checkout sin referencia carece de idempotencia

**Ubicación:** [findRecentDuplicateOrderInTransaction 173](D:/limpio/lib/checkout-order.ts:173), [POST orders 311](D:/limpio/app/api/orders/route.ts:311), [referencia anulada en WhatsApp](D:/limpio/lib/checkout-order.ts:225).

Sin referencia el detector retorna null. Efectivo y Cashea manual no exigen referencia; el canal WhatsApp elimina todas las referencias al persistir. No existe una clave de operación enviada por el cliente y persistida para todos los métodos. El guard del botón evita parte del doble clic, pero no un retry de red después de un commit cuya respuesta se perdió.

**Reproducción HTTP ejecutada:** usuario y producto temporales propios, stock 10, precio 10 USD, tasa local temporal 100 Bs/USD, Cashea manual con flag automático apagado. Dos `POST /api/orders` idénticos, sin referencia, devolvieron `201` con IDs distintos. La BD quedó con 2 pedidos y stock 8. Se eliminaron pedidos/producto/usuario y sólo la fila temporal de tasa creada por el probe.

**Impacto:** pedido doble, reserva doble y posible canje doble; en WhatsApp duplica el trabajo de soporte aun sin descontar stock inicialmente.

**Corrección:** `Idempotency-Key`/ID de operación de checkout estable desde el inicio del intento, asociado al comprador o guest token y hash del payload. Reintento equivalente devuelve el resultado ya comprometido; payload diferente para una misma clave responde 409. Guardar la clave con unicidad en BD. La referencia de pago puede complementar el control, pero no reemplaza la identidad del intento.

## PD-06 — Medio — La idempotencia por referencia devuelve un pedido de otro carrito/método

**Ubicación:** [consulta de duplicados](D:/limpio/lib/checkout-order.ts:190), [retorno anticipado del duplicado](D:/limpio/app/api/orders/route.ts:317).

El filtro usa comprador + referencia + ventana de 24 horas. No incluye banco, método, importe, productos o dirección; además retorna antes de ejecutar las validaciones del pedido nuevo. La propia documentación reconoce referencias bancarias de 4–6 dígitos repetibles, pero únicamente protege la repetición de meses distintos.

**Reproducción por flujo:** usuario tiene un pedido Pago Móvil con referencia `1234`; en el mismo día intenta otro carrito por transferencia de otro banco con referencia `1234`. El segundo POST devuelve el primer pedido con 200, sin crear el carrito nuevo. Incluso productos inválidos del nuevo payload no llegan a la validación de catálogo al encontrarse el duplicado.

**Impacto:** una compra legítima se pierde silenciosamente; el frontend trata el 2xx como éxito y puede vaciar el carrito/mostrar el pedido anterior.

**Corrección:** la clave de operación de PD-05; referencias como identidad adicional deben incluir proveedor/cuenta receptora y compararse con carrito/total. Una referencia ya asociada a un pedido distinto debe devolver conflicto explícito, nunca aparentar haber comprado el nuevo carrito.

## PD-07 — Alto — El límite de reservas impagadas excluye Binance

**Ubicación:** [orders POST 200](D:/limpio/app/api/orders/route.ts:200), [estado inicial Binance](D:/limpio/lib/checkout-order.ts:312), [auto-cancel 45](D:/limpio/app/api/cron/auto-cancel-orders/route.ts:45).

El límite de 3 pedidos abiertos de checkout full sólo cuenta `status=Pendiente AND paidAt=null`. Los de Binance son `Pendiente verificación Binance`, por tanto no cuentan. Una cuenta puede seguir creando pedidos Binance con referencias distintas y comprobantes distintos; el rate limit sólo reduce la frecuencia, no la cantidad reservada. Checkout full descuenta stock inmediatamente. El cron excluye pedidos con comprobante/referencia para evitar cancelar pagos reales, por lo que una captura arbitraria y una referencia ficticia los deja pendientes indefinidamente hasta revisión manual.

**Impacto:** una cuenta autenticada puede inutilizar el inventario en full sin un pago validado, particularmente concentrando cantidades grandes en cada pedido. El guard anunciado en los comentarios no cubre este método.

**Corrección:** tope común para todos los estados impagados y métodos que reservan stock, dentro de la transacción serializable; tope de unidades/valor reservado por comprador; caducidad o revisión operativa de reservas con comprobantes no verificados. Mantener el cuidado con pagos reales: no autocancelarlos ciegamente. Un máximo de 3 pedidos tampoco limita por sí mismo el número de unidades por pedido.

## PD-08 — Medio — Editar o borrar cupones no es atómico frente a un canje

**Ubicación:** [PUT coupon 47](D:/limpio/app/api/coupons/%5Bid%5D/route.ts:47), [PUT coupon 62](D:/limpio/app/api/coupons/%5Bid%5D/route.ts:62), [DELETE coupon 157](D:/limpio/app/api/coupons/%5Bid%5D/route.ts:157), [schema CouponRedemption](D:/limpio/prisma/schema.prisma:489).

`PUT` lee `usedCount`, verifica `maxUses`, y hace `update` separado. Entre esas operaciones un checkout puede incrementar los usos. Ejemplo: lee 1, admin propone límite 1, checkout eleva a 2, admin fija `maxUses=1`: queda `usedCount>maxUses`, justo el estado que el comentario dice impedir.

`DELETE` decide si el cupón nunca se usó con una lectura previa. Entre la lectura y `coupon.delete` puede comprometerse su primer canje. La FK de redenciones usa `onDelete:Cascade`: borrar entonces destruye el canje recién registrado y deja el snapshot de pedido sin auditoría del cupón.

**Impacto:** límites inconsistentes y pérdida de auditoría en una carrera real entre administración y checkout.

**Corrección:** transacción con lock/aislamiento y condición atómica de límites; una FK Restrict para historial financiero o desactivación siempre para cupones publicados. Test de primer canje concurrente con borrar y de edición de maxUses concurrente con canje. No se ejecutó este entrelazado; evidencia por consultas y FK.

## PD-09 — Medio — Se marca un comprobante DELETED antes de eliminarlo de R2

**Ubicación:** [DELETE order 168](D:/limpio/app/api/orders/%5Bid%5D/route.ts:168), [borrado R2 184](D:/limpio/app/api/orders/%5Bid%5D/route.ts:184), [candidatos purge 44](D:/limpio/app/api/cron/purge-payment-uploads/route.ts:44), [purga metadatos](D:/limpio/app/api/cron/purge-temporary-data/route.ts:189).

La transacción de borrado de pedido marca el `PaymentUpload` como `DELETED` y borra la orden; sólo después intenta eliminar el objeto privado. Un fallo R2 se registra pero la respuesta sigue siendo éxito. El cron de objetos sólo recorre `PENDING/UPLOADING`; no reintenta estos `DELETED`. Después, la purga de datos temporales puede borrar su registro y perder la última referencia al objeto.

**Cadena reproducible:** borrar pedido con prueba privada durante un fallo de R2; la orden desaparece, upload queda DELETED aunque la captura sigue presente; restaurar R2 y ejecutar los cron no elimina esa captura.

**Impacto:** comprobante privado retenido sin pedido ni mecanismo normal de eliminación; coste de almacenamiento y falta de trazabilidad de borrado.

**Corrección:** marcar `DELETING`/crear tarea outbox antes de eliminar la orden, conservar objectKey e intentos; declarar `DELETED` únicamente después del éxito en R2; proceso durable de reintento y conciliación. No se inyectó fallo contra R2 real.

## PD-10 — Medio — Reinicio durante purga deja DELETING para siempre

**Ubicación:** [claim purge 62](D:/limpio/app/api/cron/purge-payment-uploads/route.ts:62), [consulta purge 40](D:/limpio/app/api/cron/purge-payment-uploads/route.ts:40).

Después del claim `PENDING/UPLOADING → DELETING`, un reinicio/terminación o un error de BD antes de la marca final deja DELETING persistido. Ninguna selección futura lo procesa; el rollback al estado anterior sólo ocurre en el catch del error R2, no si muere el proceso. `purge-temporary-data` sólo borra metadatos DELETED.

**Impacto:** comprobantes olvidados y trabajo de purga permanentemente atascado en esos registros; el cron puede seguir marcando success con la cola incompleta.

**Corrección:** lease con `deletingStartedAt`, recuperación de DELETING antiguos y borrado idempotente en R2; métricas de cantidad/edad de tareas colgadas. PD-09 y PD-10 pertenecen a la misma necesidad de trabajos durables, pero tienen disparadores distintos.

## PD-11 — Medio — Fecha BCV idéntica oculta una tasa faltante/corrupta

**Ubicación:** [update-bcv-rate 63](D:/limpio/app/api/cron/update-bcv-rate/route.ts:63), [validación de tasa 71](D:/limpio/app/api/cron/update-bcv-rate/route.ts:71), [checkout estricto](D:/limpio/lib/exchange-rate.ts:96).

El cron compara primero la fecha de la API y, si es igual a la guardada, retorna `ok:true,sinCambios:true` y registra última ejecución exitosa. Sólo después comprobaría si hay tasa válida. Si un restore, borrado parcial o dato corrupto conserva la fecha pero pierde la tasa, el cron nunca la repara mientras la fuente devuelva esa misma publicación; el checkout responde 503. Los success sucesivos pueden ocultar el problema al health check de cron.

**Corrección:** cargar/comprobar tasa antes del retorno sin cambios; sólo omitir escritura si fecha y tasa persistidas son válidas y concordantes; separar salud de ejecución de salud/antigüedad de la tasa. El probe HTTP local sin AppConfig de tasa corroboró el 503 correcto del checkout, no se llamó a APIs BCV reales.

## PD-12 — Medio — BCV no impide regresión de publicación

**Ubicación:** [parser DolarApi](D:/limpio/lib/bcv-rate.ts:24), [parser respaldo](D:/limpio/lib/bcv-rate.ts:45), [actualización 60–87](D:/limpio/app/api/cron/update-bcv-rate/route.ts:60).

Se acepta cualquier string no vacío como fecha y sólo se compara igualdad, no orden ni antigüedad. Cuando la fuente principal falla y la secundaria entrega una publicación anterior, una variación inferior al 15% se guarda como tasa nueva y reemplaza la fecha más reciente. Una fuente estancada también puede seguir renovando `bcv_last_success_at` sin alertar de antigüedad real.

**Impacto:** precios en Bs calculados con una publicación anterior; falsa salud operativa cuando la fuente no actualiza. No se afirmó que las fuentes reales estén actualmente atrasadas.

**Corrección:** normalizar fechas según el contrato de cada fuente, comprobar fecha de vigencia y no retroceder respecto a una publicación válida existente; distinguir fecha de publicación y fecha de consulta. Alertar con calendario comercial apropiado para fines de semana/feriados.

## PD-13 — Alto — Revertir descuento cambia el importe de pedidos ya cobrados

**Ubicación:** [revert-divisa-discount 30](D:/limpio/app/api/orders/%5Bid%5D/revert-divisa-discount/route.ts:30), [update monetario 70](D:/limpio/app/api/orders/%5Bid%5D/revert-divisa-discount/route.ts:70), [UI de reversión](D:/limpio/components/admin/PaymentVerificationPanel.tsx:314).

La ruta no lee ni valida `status` o `paidAt`: se puede revertir el descuento de un pedido En Proceso/Enviado/Entregado ya cobrado. Eleva `Order.total` pero conserva `paidAt` y los informes tratan el total nuevo como ingreso cobrado. Ejemplo: subtotal 100, descuento divisa 10, cupón 0, pago validado por 90; la acción deja total 100 y la misma fecha de cobro, sin cobro adicional.

**Impacto:** ingresos y pedido histórico cambian de 90 a 100 por una acción sin movimiento de dinero. La UI informa que vuelve a precio full, pero no representa saldo pendiente ni cobro adicional.

**Corrección:** permitir reversión sólo mientras está impagado, con condición atómica; para pagos ya confirmados, una operación explícita de ajuste/saldo y registro de cobros separado del importe comercial del pedido. Auditoría persistente del operador, motivo y antes/después. Test de acción contra pedido pagado/entregado y carrera con validar pago.

## PD-14 — Bajo — Transportista personalizado no seleccionable

**Ubicación:** [ShipOrderDialog 161](D:/limpio/app/components/admin/ShipOrderDialog.tsx:161).

Seleccionar `Personalizado…` dispara `if (e.target.value === '__custom__') return`, por lo que nunca cambia el estado al sentinel que mostraría el input de nombre. Un valor personalizado existente puede editarse, pero no se puede iniciar uno nuevo desde el selector vacío.

**Corrección:** estado separado para modo personalizado y texto libre, o aceptar el sentinel y mantener el input visible incluso cuando el texto se vacía.

## PD-15 — Bajo — Instrucción obsoleta en aprobación Binance

**Ubicación:** [PaymentVerificationPanel 265](D:/limpio/components/admin/PaymentVerificationPanel.tsx:265), [approve-binance 22](D:/limpio/app/api/orders/%5Bid%5D/approve-binance/route.ts:22).

El panel dice aprobar Binance y luego usar Validar pago. La ruta actual ya hace `→ En Proceso + paidAt` en un paso; la acción de validar desaparece con el estado nuevo. El operador recibe una instrucción que ya no puede completar.

**Corrección:** describir el paso único actual, con verificación bancaria manual y preparación del pedido tras aprobación.

## Riesgos concretos para activar Cashea automático

Se deben resolver antes de subir `CASHEA_ENABLED=true`; su impacto depende de la activación y del futuro adaptador autoritativo. Las funciones actuales mantienen la verificación cerrada y eso evita confirmar pagos por el retorno del navegador.

### PC-01 — Alto, bloqueo de activación — Verificación autoritativa todavía es un stub

**Ubicación:** [verifyCasheaOrder 333](D:/limpio/lib/cashea.ts:333), [placeholder de deliveryMethod](D:/limpio/lib/cashea.ts:61), [config moneda](D:/limpio/lib/cashea-config.ts:44).

`verifyCasheaOrder` siempre lanza `CasheaVerificationNotImplemented`; tener todas las credenciales requeridas sólo valida configuración, no este mecanismo. Activar el flag permite crear sesiones y reservar inventario pero los retornos y reintentos nunca confirman. Los nombres de `deliveryMethod` y semántica de moneda también se declaran pendientes en el propio código. No se validó un contrato remoto ni se contactó a Cashea.

**Recomendación:** flag de disponibilidad dependiente de un adaptador verificado y prueba de aceptación sandbox; impedir activación con contrato incompleto. Incorporar reconciliación al despliegue: el hallazgo de que `deploy/crontab.vps` no agenda Cashea corresponde al informe del agente de panel/operaciones (evitar doble conteo).

### PC-02 — Alto — Las rutas generales pueden confirmar/cancelar Cashea por fuera de su ciclo

**Ubicación:** [validateOrderPayment](D:/limpio/app/actions/orderActions.ts:48), [rejectOrderPayment](D:/limpio/app/actions/orderActions.ts:284), [status](D:/limpio/app/api/orders/%5Bid%5D/status/route.ts:57), [bulk](D:/limpio/app/api/orders/bulk-status-update/route.ts:54), [DELETE order](D:/limpio/app/api/orders/%5Bid%5D/route.ts:148), [POST orders 319](D:/limpio/app/api/orders/route.ts:319).

Estas rutas no diferencian `casheaStatus`/`paymentMethodId=cashea`. Cashea automático crea pedidos Pendiente con `stockDeducted=true`, por lo que `validateOrderPayment` puede marcarlos pagados sin verificar Cashea, y la cancelación general libera stock sin cancelar la orden remota. También se puede seguir usando `POST /api/orders` con Cashea, saltándose `/api/cashea/session`, la prohibición de cupones y los campos de correlación del flujo automático.

**Impacto al activar:** pedido local pagado mientras Cashea no lo confirma; o pedido local cancelado con una financiación remota vigente. Una verificación posterior puede volver a poner En Proceso un pedido cancelado por vía general, porque su guard se basa únicamente en `casheaStatus`.

**Recomendación:** el método Cashea automático debe pasar por una sola máquina de estados; rutas genéricas devuelven 409/redirigen a la operación específica. Distinguir claramente Cashea manual con flag apagado.

### PC-03 — Crítico latente si se implementa confirmación sin corregir la correlación — El ID remoto del navegador no está ligado al importe/comprador local

**Ubicación:** [return 82](D:/limpio/app/checkout/cashea/return/route.ts:82), [return persistencia 110](D:/limpio/app/checkout/cashea/return/route.ts:110), [sesión inicial 263](D:/limpio/lib/cashea-session.ts:263), [comparación de importe 148](D:/limpio/lib/cashea-reconcile.ts:148).

El propietario de una sesión local puede enviar el `idNumber` de una orden remota en su URL de retorno. La sesión no persiste el importe inicial esperado, `casheaInitialAmount` nace null; el mismatch sólo se comprueba cuando `expected != null`, por lo que hoy esa defensa queda desactivada para sesiones nuevas. Además el resultado del adaptador sólo tipa confirmed/initialAmount, sin demostrar comercio, comprador ni la referencia local/invoiceId; el payload permite invoiceId, pero la sesión no lo envía.

**Cadena futura concreta:** adaptar verify para devolver confirmed de un ID remoto realmente pagado; aportar ese ID a la sesión local de otro carrito. Al no existir vínculo servidor-proveedor ni expected obligatorio, el código puede aprobar el carrito local con prueba de otra operación. El índice unique de casheaOrderId impide reutilización dentro de esta BD, pero no valida que la primera asociación sea correcta.

**Límite de evidencia:** hoy `verifyCasheaOrder` siempre lanza, por tanto NO se reprodujo ni existe una confirmación fraudulenta automática operativa en el código actual. Se clasifica separadamente como condición de seguridad imprescindible del futuro lanzamiento.

**Recomendación:** crear/correlacionar la orden remota desde servidor; referencia local inmutable en el proveedor; verificación obligatoria de comercio, propietario/identificación, moneda e importes esperados según el contrato real. Fallar cerrado cuando faltan esos campos. No inventar el contrato de Cashea.

### PC-04 — Alto al activar — Se cancela remoto aunque se haya perdido el claim local

**Ubicación:** [cancel 132](D:/limpio/app/api/cashea/cancel/route.ts:132), [DELETE remoto 139](D:/limpio/app/api/cashea/cancel/route.ts:139).

La ruta ejecuta `updateMany` a CANCEL_PENDING pero ignora `count`. El comentario afirma que se relee el estado antes de cancelar remoto; no hay tal relectura antes de `cancelCasheaOrder`. Si una confirmación concurrente gana entre la lectura inicial y el claim, count será 0 por CONFIRMED, pero la ruta aún manda DELETE remoto usando el snapshot anterior. Sólo después la transacción descubre CONFIRMED y retorna conflicto.

**Impacto:** una financiación confirmada puede cancelarse remotamente y conservarse como confirmada localmente. El stub actual evita que ocurra una confirmación autoritativa real durante estas pruebas.

**Corrección:** comprobar claim.count y el estado cuando se pierde antes de cualquier efecto externo; outbox/operación remota con correlación y reconciliación.

### PC-05 — Alto al activar — El retorno sobrescribe estados finales de Cashea

**Ubicación:** [return updateMany 103](D:/limpio/app/checkout/cashea/return/route.ts:103), [cancel data 197](D:/limpio/app/api/cashea/cancel/route.ts:197), [reconcile confirm 186](D:/limpio/lib/cashea-reconcile.ts:186).

El consumo del token sólo exige ID/hash, no estado permitido. La cancelación no borra `casheaReturnTokenHash`; un retorno tardío puede cambiar CANCELLED a RETURNED dejando `Order.status=Cancelado` y stock devuelto. `processCasheaConfirmation` después comprueba el estado Cashea y, si se implementa verify y confirma, escribe En Proceso/paidAt sin comprobar stock ni estado del pedido. La expiración también puede borrarse con un retorno que conserva token, sin una política explícita de recuperación.

**Corrección:** consumir sólo desde CREATED/REDIRECTED y estados de retorno específicamente admitidos; invalidar token en finales; nunca mover un cancelado a pagado por este camino. Verificar compatibilidad entre ambas máquinas de estado y stock antes de confirmar.

### PC-06 — Medio al activar — Doble-submit de Cashea rota el token de la primera respuesta

**Ubicación:** [ventana 10 segundos](D:/limpio/lib/cashea-session.ts:51), [rotación de token 247](D:/limpio/lib/cashea-session.ts:247).

Se reutiliza el pedido por usuario+carrito pero se rota el returnToken. Dos peticiones exitosas simultáneas pueden entregar al cliente dos payloads con tokens distintos: si utiliza el de la primera respuesta, el retorno queda inválido después de la segunda rotación. Pasados 10 segundos, el mismo intento crea una reserva nueva en lugar de recuperar la sesión anterior; no hay límite de sesiones impagadas de Cashea. La búsqueda sólo considera carrito, no identificación/envío: al cambiar estos campos y reintentar en la ventana se genera payload nuevo mientras el pedido conserva los datos previos.

**Corrección:** identidad durable de operación; token estable durante la sesión o seguimiento de intentos explícitos; decidir cuándo una sesión es reanudable y cuándo se cancela antes de reemplazar; límite de reservas por comprador.

## Recomendaciones adicionales, sin clasificarlas como bugs confirmados

- Persistir `shippingMethod` y el snapshot estructurado de oficina/transportista. Actualmente se transporta gran parte en texto y retiro se infiere por prefijo. El frontend habitual sí añade MRW/ZOOM/TEALCA a la dirección, por lo que no se afirmó que todos esos pedidos pierdan el courier. La sesión de Cashea omite el reemplazo servidor de dirección de retiro que sí hace `/api/orders`; esto debe cerrarse al unificar el checkout.
- Adoptar una outbox de notificaciones. El cron review-request marca `reviewRequestSentAt` antes de enviar y no libera la marca si Resend devuelve false o muere el proceso; cumple at-most-once, pero puede perder solicitudes de reseña para siempre. Separar claim/intentos/enviado y usar idempotencia del proveedor para reintentar con control de duplicados.
- No borrar físicamente pedidos financieros completados si se necesita auditoría durable. La ruta DELETE es accesible para ORDERS, borra ítems/canjes en Cascade y devuelve cupón incluso si la venta ya fue entregada. Formalizar archivado/anonimización y ajuste financiero, con auditoría append-only. Su autorización/política merece revisión con seguridad.
- Añadir constraints de invariantes que sobrevivan a scripts futuros: stock no negativo, cantidad positiva, importes no negativos, límites y contadores coherentes. Los descuentos tienen algunos CHECK, pero no existe una máquina de estados en BD. Validar estas migraciones con datos legacy y excluir políticas que admitan excepciones legítimas.
- Alertar por unidades/valor reservados y edad de todos los pedidos impagados; número de jobs DELETING, fallos de borrado y atrasos de tasa. Un endpoint que corrió no demuestra que todas sus tareas terminaron.
- Cubrir los métodos full, WhatsApp, Cashea manual y automático de forma separada; la suite actual protege stock y permisos útiles, pero los mocks no demuestran concurrencia real ni todas las transiciones financieras.
- Revisar precisión de `priceBaseFactor` y recálculo concurrente. Se pasó la evidencia al informe de panel/catálogo para evitar duplicación: factor permitido 1.234 versus base guardada 1.23 provoca precio manual 100 → 100.35 → 100.70 → 101.05 con tres recálculos sin cambiar el factor.

## Cobertura, controles observados y límites

Se revisaron `checkout-order`, schemas, cálculo de líneas en céntimos, descuentos acumulados, consultas y snapshots; POST/GET de pedidos; status individual/bulk, borrado, actualización de tracking, aprobación Binance, reversión de descuento, validación/rechazo de pago; CRUD/validación de cupones; Cashea sesión/retorno/cancelación/reconciliación/config/cliente; tasa BCV y persistencia; cron de cancelación, comprobantes, temporal y reseñas; envío gratis/estimados; esquema y migraciones de estados, relaciones financieras, uploads, slots y descuentos; los tests relacionados y los componentes de administración citados.

Controles existentes que se verificaron por lectura: precios autoritativos desde BD, agregación de cantidad por producto antes de validar stock, decremento condicional `stock >= cantidad`, checkout serializable con reintentos, comprobante ligado una sola vez mediante guard de estado/fecha, snapshots de tasa/precio/beneficio de envío, bloqueos de productos despublicados en checkout, rollback de stock/cupón si falla la transacción, guest access hashes y tokens de retorno, guards de permisos/origen y secretos de cron. Estos controles reducen riesgos, pero no cubren los entrelazados descritos.

La raíz ejecutó la suite completa: **60 archivos, 625 tests aprobados**, TypeScript aprobado; no se repitió la suite. Se añadieron como evidencia cuatro probes puntuales de auditoría: transición HTTP a Entregado sin pago; replay HTTP sin referencia; slot de cupón con hueco; reversión concurrente real. No se cambiaron los tests del repositorio.

No se accedió a producción, panel real, credenciales reales, cuenta bancaria, Binance/Cashea remoto o bucket R2 real. No se validó un cobro real, callback remoto, entrega de correo real, configuración efectiva de cron del VPS ni datos legacy de producción. Los riesgos por caída/reinicio/carrera no observados en producción se describen con la cadena exacta del código, sin afirmar que ya hayan ocurrido. Los links corresponden a los archivos revisados; las líneas son de ese estado del workspace.


