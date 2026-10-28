# Auditoría complementaria: favoritos, carrito, recuperación y avisos públicos

Fecha de revisión: 4 de octubre de 2026. Complemento de `pedidos-datos.md`, preparado durante el último barrido de la auditoría general. No repite el cambio de identidad del carrito ni los problemas de OAuth del informe de seguridad.

## Alcance y límites

Revisión de código de `WishlistContext`, acciones de favoritos, página de wishlist, servicio y endpoints del carrito, snapshot de carrito abandonado, cron de recuperación, enlaces de recuperación y baja, suscripciones de reposición y envío de correo, recuperación de contraseña y consulta pública `/pedido`. Búsqueda de formularios de contacto y newsletter: no se encontró un formulario independiente; el footer deriva contacto hacia WhatsApp y los avisos de reposición cubren la suscripción asociada a producto.

Este complemento se fundamenta en cadenas completas verificadas en el código. No se ejecutaron nuevas consultas a una base de datos ni nuevas peticiones con mutaciones, no se enviaron correos y no se repitió la suite ya ejecutada por el coordinador. Las reproducciones indicadas son secuencias para verificar en un entorno aislado. No afirmar que ocurrieron a clientes reales.

**Resultado: 7 hallazgos adicionales de severidad media.** No se confirmó un crítico o alto adicional en este barrido. Los fallos condicionados a un error de proveedor o base de datos describen el comportamiento implementado ante ese error; no afirman que el proveedor esté fallando actualmente.

## PU-01 — Medio — El límite de favoritos y la persistencia divergen entre cliente y servidor

**Evidencia:** [mergeWishlistAction](D:/limpio/app/actions/wishlistActions.ts:89) limita únicamente los IDs recibidos a 100 y después ejecuta `createMany` sobre todos, sin contar los favoritos ya guardados. [loadWishlistProducts](D:/limpio/app/actions/wishlistActions.ts:45) carga todos los registros activos, sin `take`. [addWishlistItemAction](D:/limpio/app/actions/wishlistActions.ts:117) rechaza silenciosamente cualquier alta si la cuenta ya contiene 100. [WishlistContext](D:/limpio/context/WishlistContext.tsx:150), en cambio, agrega el producto nuevo y descarta el más antiguo en memoria, sin pedir que el servidor borre ese antiguo ni recibir un resultado del alta.

**Reproducción A:** cuenta con 100 favoritos A; en otro navegador o tras salir de sesión, preparar 100 favoritos B distintos; iniciar sesión. La fusión agrega B a A y devuelve hasta 200. Repetir con otro lote puede seguir aumentando la cuenta. El límite de 100 no se aplica a la unión.

**Reproducción B:** cuenta con exactamente 100 favoritos; marcar un producto nuevo. La UI muestra el nuevo y oculta el más antiguo, mientras la acción de servidor retorna antes de escribir. Al volver a cargar, reaparece el antiguo y desaparece el nuevo. Si la cuenta excedió 100 mediante fusión, las altas individuales posteriores también quedan rechazadas.

**Impacto:** favoritos aparentemente guardados desaparecen y el tope documentado puede eludirse por una operación normal de login. La cuenta, las distintas sesiones y la UI discrepan sobre la misma lista.

**Corrección recomendada:** decidir una sola política para el tope de la unión y aplicarla atómicamente en servidor, devolviendo la lista final o un error explícito. Si la política es descartar el más antiguo, efectuar esa eliminación junto con el alta. El cliente debe confirmar o revertir la modificación optimista según ese resultado. Verificar ambos casos con 100 elementos existentes y nuevos IDs distintos.

## PU-02 — Medio — Un error al fusionar favoritos borra la copia local del invitado

**Evidencia:** [mergeWishlistAction](D:/limpio/app/actions/wishlistActions.ts:107) registra cualquier excepción y devuelve `[]`, indistinguible de una fusión exitosa con una lista vacía. [getWishlistAction](D:/limpio/app/actions/wishlistActions.ts:73) aplica el mismo contrato. [WishlistContext](D:/limpio/context/WishlistContext.tsx:123) adopta el array y ejecuta `localStorage.removeItem('wishlist')` al terminar; además fija `mergedForUserRef` antes de comprobar que la operación salió bien.

**Reproducción:** un invitado conserva varios favoritos en localStorage e inicia sesión; provocar que `product.findMany` o `wishlistItem.createMany` lance durante la fusión. La acción responde `[]`, la UI se vacía y elimina la copia local. Al recuperar la BD, esos favoritos no están en la cuenta ni en el navegador, y la sesión no reintenta automáticamente.

**Impacto:** pérdida permanente de favoritos del invitado por una indisponibilidad transitoria. La captura del cliente tampoco interviene, porque la acción transformó el fallo en una respuesta exitosa.

**Corrección recomendada:** devolver un resultado discriminado (`ok`, datos, error) y conservar el almacenamiento local hasta confirmar la persistencia. Marcar la fusión como terminada únicamente después del éxito y permitir reintentar. Una prueba de fallo del repositorio debe comprobar que el almacenamiento se mantiene.

## PU-03 — Medio — Avisos de reposición y carritos se registran como enviados aunque el envío falle

**Evidencia:** [triggerRestockNotifications](D:/limpio/app/actions/restockActions.ts:119) reclama el suscriptor con `notifiedAt = now` antes de enviar. Solo revierte el claim en un `catch`. Sin embargo, [sendRestockNotificationEmail](D:/limpio/lib/resend.tsx:355) retorna normalmente si no hay cliente Resend y [sendBrandedEmail](D:/limpio/lib/resend.tsx:92) retorna sin envío si falta remitente, registra errores del proveedor y absorbe excepciones. La llamada retorna normalmente en todos esos casos y [el contador de reposición](D:/limpio/app/actions/restockActions.ts:135) aumenta.

El mismo contrato afecta al cron de carrito: [markCartEmailedAndRotateToken](D:/limpio/lib/abandoned-cart.ts:197) avanza a `EMAILED_24H`/`EMAILED_72H` antes del envío y [el cron](D:/limpio/app/api/cron/abandoned-cart/route.ts:119) aumenta `sent24h`/`sent72h` cuando `sendAbandonedCartEmail` termina normalmente, aunque este también absorbe el error mediante `sendBrandedEmail`.

**Reproducción:** preparar una suscripción pendiente a un producto agotado, reponer stock y simular que Resend devuelve `{ error: ... }`. El suscriptor termina con `notifiedAt` no nulo y el log declara un aviso enviado, aunque el proveedor rechazó la solicitud. Repetir en la oleada de 72 horas del cron: el carrito queda terminal `EMAILED_72H` y aumenta `sent72h`, sin que el receptor tenga el correo o el nuevo enlace.

**Impacto:** el aviso prometido puede perderse permanentemente; el resultado del cron y los logs sobreestiman envíos; no se habilita el reintento previsto por el propio comentario del código de reposición. No confundir aceptación del proveedor con entrega final en el buzón: actualmente ni siquiera se exige aceptación.

**Corrección recomendada:** que el adaptador de correo devuelva explícitamente aceptación o fallo. Un flujo de negocio puede seguir siendo best-effort sin disfrazar el fallo como éxito. Mantener las notificaciones fallidas pendientes de reintento mediante una cola/outbox y actualizar el estado final solo con aceptación del proveedor. Verificar respuesta de error, excepción y configuración de correo ausente.

## PU-04 — Medio — La baja de recordatorios se revoca en cuanto el cliente vuelve a usar el checkout

**Evidencia:** [confirmación de baja](D:/limpio/app/cart/unsubscribe/confirm/UnsubscribeConfirmClient.tsx:42) promete que el usuario no recibirá más recordatorios de carrito abandonado. [markCartOptedOut](D:/limpio/lib/abandoned-cart.ts:101) marca únicamente el registro asociado al token. [upsertAbandonedCart](D:/limpio/lib/abandoned-cart.ts:40) busca solo `PENDING`/`EMAILED_24H`; si el anterior es `OPTED_OUT`, crea otro `PENDING`. [saveCartSnapshotAction](D:/limpio/app/actions/abandonedCartActions.ts:86) llama este servicio desde el checkout sin comprobar una preferencia de baja por correo o usuario.

**Reproducción:** recibir un recordatorio, confirmar su baja y ver la confirmación; volver a completar el paso de datos del checkout con el mismo correo y abandonar de nuevo. Se crea otro carrito `PENDING` y vuelve a ser elegible para el correo de 24 horas.

**Impacto:** el comportamiento contradice directamente la promesa al usuario y reactiva los avisos sin una nueva suscripción. Una baja de un snapshot no representa la preferencia del destinatario.

**Corrección recomendada:** guardar la supresión por correo normalizado o usuario y consultarla tanto al guardar snapshots como al enviar. Reactivar solo mediante una decisión explícita del usuario. El estado del carrito puede conservarse por operación sin perder esa preferencia global. Verificar baja → nuevo checkout → ejecución de cron sin correo.

## PU-05 — Medio — La segunda oleada invalida los enlaces de recuperación y baja del primer correo

**Evidencia:** [markCartEmailedAndRotateToken](D:/limpio/lib/abandoned-cart.ts:190) crea un hash nuevo y reemplaza el único `recoveryTokenHash` al enviar cada oleada. [sendAbandonedCartEmail](D:/limpio/lib/resend.tsx:413) utiliza ese mismo token para recuperar el carrito y para darse de baja. [findAbandonedCartByRecoveryToken](D:/limpio/lib/abandoned-cart.ts:124) solo reconoce el hash actual. [GET unsubscribe](D:/limpio/app/api/cart/unsubscribe/route.ts:31) rechaza el token anterior si no encuentra el carrito.

**Reproducción:** guardar el correo de la primera oleada y dejar que se ejecute la segunda; abrir después «recuperar carrito» o «darme de baja» desde el primer correo. Ambos enlaces dejan de localizar el registro y redirigen con resultado inválido. Si además falla la entrega del segundo correo, el usuario pierde sus únicos enlaces conocidos.

**Impacto:** enlaces de un correo entregado caducan por una operación automática posterior, sin plazo mostrado; el usuario puede no conseguir efectuar la baja desde el mensaje que recibió. La rotación de seguridad de un enlace de recuperación no debería invalidar silenciosamente el mecanismo de supresión de comunicaciones.

**Corrección recomendada:** separar el token de baja por destinatario de los tokens de recuperación; conservar los tokens de recuperación ya emitidos hasta una expiración explícita, o documentar y aplicar su caducidad sin afectar la baja. Verificar ambos enlaces de la primera oleada después de emitir la segunda.

## PU-06 — Medio — Los productos despublicados siguen en el carrito persistido y en correos de recuperación

**Evidencia:** [getUserCart](D:/limpio/lib/cart.ts:51) incluye todos los productos de las líneas y devuelve el DTO sin filtrar publicación. [upsertCartItem](D:/limpio/lib/cart.ts:86) consulta únicamente `stock`, y [mergeCart](D:/limpio/lib/cart.ts:164) obtiene IDs y stock sin `isActive`. [refreshAbandonedCartItems](D:/limpio/lib/abandoned-cart.ts:240) consulta el producto por ID y descarta únicamente inexistentes o agotados, de modo que un producto despublicado con stock continúa en el recordatorio. En cambio, [página pública del producto](D:/limpio/app/product/%5Bslug%5D/page.tsx:183) exige `isActive: true` y devuelve 404 para el mismo artículo.

**Reproducción:** añadir a un carrito de cuenta un producto publicado con stock, preparar su snapshot, y despublicarlo desde admin conservando stock positivo. Volver a cargar el carrito y ejecutar el refresco del recordatorio: ambos todavía incluyen ese producto con nombre, precio, slug y cantidad. El enlace del producto en el correo lleva a 404. La recuperación también puede volver a fusionar esa línea en el carrito.

**Impacto:** se promueve y mantiene disponible para la UI un artículo que el catálogo público retiró, con navegación rota y posibles rechazos al llegar al checkout. Este hallazgo no afirma que se consiga comprar un artículo inactivo saltándose las validaciones finales del pedido.

**Corrección recomendada:** aplicar una regla compartida de publicabilidad a lectura, alta, fusión y refresco de snapshots. Si un artículo retirado se conserva como referencia histórica, presentarlo expresamente como no disponible y excluirlo de los CTA de recuperación. Verificar retiro del catálogo después de guardar carrito y snapshot.

## PU-07 — Medio — El recordatorio de 72 horas ignora una nueva actividad del usuario

**Evidencia:** [upsertAbandonedCart](D:/limpio/lib/abandoned-cart.ts:48) actualiza `lastActivityAt` al reanudar el checkout sobre un registro `EMAILED_24H`, pero conserva su ciclo y `emailSentAt`. [getCartsFor72hEmail](D:/limpio/lib/abandoned-cart.ts:166) usa exclusivamente el tiempo desde `emailSentAt` y no impone antigüedad de `lastActivityAt`.

**Reproducción:** registrar un carrito; enviar primera oleada 24 horas después; 48 horas después de esa primera oleada, el usuario vuelve al checkout y actualiza el snapshot. Ejecutar el cron un minuto después. El registro sigue siendo elegible para la segunda oleada aunque la última actividad acaba de ocurrir, y puede enviar el mensaje con descuento mientras el usuario compra activamente.

**Impacto:** un recordatorio de abandono se dispara sobre actividad actual; el cupón del segundo mensaje se ofrece según un temporizador viejo y no según un nuevo abandono. El comentario que lo describe como aproximadamente 72 horas desde última actividad no se cumple si el cliente retorna.

**Corrección recomendada:** además de conservar la regla contra duplicados de oleadas, exigir inactividad real mediante `lastActivityAt` para la segunda. No reiniciar el estado para enviar inmediatamente otro correo de 24 horas. Verificar actividad reciente en un registro cuya primera oleada ya tiene más de 48 horas.

## Controles revisados sin un nuevo hallazgo en este complemento

- **Reset de contraseña:** token SHA-256 en BD, expiración verificada tanto en lectura como en consumo, `deleteMany` condicionado dentro de transacción y actualización de `passwordChangedAt`; el token se transmite en el fragmento y el POST, no en la URL recibida por el servidor. Se revisó [e2e/specs/reset-password.spec.ts](D:/limpio/e2e/specs/reset-password.spec.ts:11), que cubre formulario, confirmación genérica y token válido/expirado; no ejecutado de nuevo en este barrido. No se declara probado el envío real del correo ni todos los casos concurrentes.
- **Consulta pública `/pedido`:** comprobación de número y documento, error genérico ante no coincidencia, limitación de intentos y DTO reducido. Se revisó la cadena `orderLookupActions` → `toPublicOrderLookupDto` → `PedidoLookupClient`/`OrderDetailClient`; no se identificó un nuevo bug funcional demostrable que añadir aquí.
- **Baja:** el GET conduce a confirmación y la mutación requiere POST con comprobación de origen. Esto evita que el simple seguimiento del enlace por un escáner de correo ejecute una baja.
- **Carrito:** las cantidades escritas se recortan al stock; este complemento recoge la omisión de publicación, sin duplicar los hallazgos del informe principal sobre identidad, concurrencia de stock o pedidos.
- **Cobertura de pruebas:** no se encontraron pruebas unitarias dedicadas a los siete casos anteriores en `tests`; la suite general ya aprobada por el coordinador no demuestra esos comportamientos. Se recomienda cubrir las secuencias concretas al corregirlos.
