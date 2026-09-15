# Auditoría de seguridad — correcciones SEC-2026-09

Tercera pasada profunda sobre la base (septiembre 2026). Cada hallazgo lleva su
número; en el código los cambios están marcados con `SEC-2026-09 (#n)` para
poder localizarlos con `grep -rn "SEC-2026-09"`.

Verificación tras los cambios: `tsc --noEmit` limpio, `eslint` sin errores,
`vitest` 60 archivos / 625 tests en verde, y los tres scripts `security:*` OK.
Tests de regresión nuevos: `tests/security-fixes-2026-09.test.ts`,
`tests/security-fixes-rate-and-auth.test.ts`, más casos añadidos en
`auto-cancel-orders`, `upload-route-limits`, `order-delete-stock-route`,
`deploy-crontab` y `e2e-safety-guard`.

---

## ⚠️ Acciones manuales obligatorias (el código no puede hacerlas)

1. **Purgar los dumps que ya están en el bucket público (#1).**
   ```bash
   node scripts/purge-public-backups.mjs            # lista
   node scripts/purge-public-backups.mjs --execute  # borra
   ```
   Después, purgar en Cloudflare la caché de `https://cdn.<dominio>/backups/*` y,
   como defensa extra, añadir una regla WAF que bloquee `/backups/*` en el
   dominio del CDN. Los backups nuevos ya van al bucket privado
   (`R2_PRIVATE_BUCKET_NAME`, credenciales `R2_PRIVATE_*`).
2. **Evaluar exposición previa (#1).** Si el bucket público estuvo accesible con
   dumps dentro, asume que la BD pudo descargarse: rota `NEXTAUTH_SECRET` y
   `CRON_SECRET`, invalida sesiones (el cambio de secret lo hace), fuerza
   cambio de contraseña a los usuarios con acceso al panel y revisa las cuentas
   bancarias publicadas en `store_settings`.
3. **Reinstalar el crontab** (`scripts/install-crontab.sh`): las líneas ahora
   pasan por `scripts/run-cron-endpoint.sh` (el Bearer ya no viaja en argv).
4. **Aplicar el sitio de nginx** (`scripts/apply-nginx.sh`): se añadió el
   bloque `www → apex`.
5. **Revisar `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`** en producción: debe ser el mismo
   valor que `R2_PUBLIC_BASE_URL` (el saneado de imágenes lo usa).

---

## Corregido en código

| # | Hallazgo | Corrección |
|---|----------|------------|
| 1 | Dumps de PostgreSQL en el bucket público con nombre predecible | `scripts/lib/backup-r2.mjs` → bucket privado + credenciales privadas; falla si el privado coincide con el público. `pg_dump` recibe la URI por `PGDATABASE` (no en `ps`). Script de purga `scripts/purge-public-backups.mjs`. |
| 2 | Guard CSRF invertido (`if (!rejectInvalidMutationOrigin())`) en reseñas (autor) y upload-video | Patrón correcto en los 4 sitios; `scripts/check-api-origin-guards.mjs` ahora falla en CI si detecta la negación. |
| 3 | Registro sin verificar correo vinculaba pedidos guest ajenos | `registerUserAction` ya no vincula nada; `registerFromOrderAction` vincula SOLO el pedido cuyo token se consumió. |
| 4 | XSS desde admins limitados: JSON-LD crudo en `/nosotros`, `settings.instagram` y URLs de SEO local sin validar (`z.url()` acepta `javascript:`) | `<JsonLd>` en `/nosotros`; `safeHref()` en render (Footer, nosotros, tienda); validación https en `generalSettingsApiSchema`, `settingsActions` y `seoLocalSchema`; iframe solo con embed real de Google Maps. `readSeoLocal` descarta URLs inválidas sin perder dirección/horarios. |
| 5 | Notas internas, correo del operador y key del comprobante viajaban al cliente | `toCustomerOrderDto()` en `GET /api/orders/[id]` (dueño), `/account/orders/[id]` y `/checkout/success`. |
| 6 | Margen global y factor BCV sin autenticación (costo derivable) | `getPricingParams`/`getMarginPresets` exigen `requireBackofficeAction()`. |
| 7 | Reserva de inventario sin pago (modo full) | Máx. 3 pedidos `Pendiente` sin pagar por cuenta (`MAX_OPEN_UNPAID_ORDERS_PER_USER`). |
| 8 | Relay de correo / campos sin tope | `checkoutSchema` con `max()` en todos los textos; tope por email destinatario en pedidos guest (3/h) y en snapshots de carrito sin sesión (5/día). |
| 9 | CSV injection | `escapeFormulae: true` en los tres `Papa.unparse`. |
| 10 | `paymentVerifiedBy` siempre `null` | Se resuelve el correo del operador desde `access.userId`. |
| 11 | `imageUrl` sin validar + `next/image` tumbaba páginas | `sanitizeOrderItemImageUrl()` al guardar y al leer líneas de pedido; `Category.imageUrl` validado en POST/PUT y saneado en `CategoryRow`. |
| 12 | `/api/cart/recover` fusionaba carritos ajenos | Exige que el email del carrito coincida con la sesión. |
| 13 | Cupón de recuperación inutilizable para guests | Se crea sin `perUserLimit` (sigue siendo de un uso por `maxUses: 1`). |
| 14 | `/checkout/success?orderId=` usaba `role` del JWT | `requirePermission('ORDERS')` contra BD; el archivo salió del allowlist legacy. |
| 15 | Bucket por email del login se saltaba con body JSON | `readCredentialsEmail()` parsea según `content-type` (JSON y urlencoded). |
| 16 | Tasa de cambio fail-open a 36,5 y deadlock del cron BCV | `loadExchangeRateUsdBsFromTx` lanza `ExchangeRateUnavailableError` → checkout 503 / cupón 503; el cron omite el «salto sospechoso» cuando no hay tasa persistida. |
| 17 | Auto-cancel a las 48 h de pedidos con comprobante/referencia | Excluidos del cron; los cierra un humano con «Rechazar pago». |
| 18 | Productos despublicados accesibles por URL, en «relacionados» y en snapshots | Filtro `isActive: true` en `getProduct`, `getRelatedProducts` y `getProductSnapshots`. |
| 19 | `/api/upload` exigía CATALOG para todo | Mapa `purpose → permiso` (tracking→ORDERS, banner→SITE_CONTENT, binance-qr→FINANCIAL_SETTINGS). |
| 20 | Borrado arbitrario de objetos del bucket público | `deleteFromR2` solo acepta `products/ banners/ assets/ reviews/`. |
| 21 | Fotos de reseña huérfanas para siempre | Se borran de R2 al eliminar la reseña o retirar la foto. |
| 22 | Comprobante bancario retenido tras borrar el pedido | `DELETE /api/orders/[id]` marca `PaymentUpload` DELETED y borra el objeto privado. |
| 23 | Tokens de un solo uso a GA4/Meta | `page_location` sin query en gtag; Meta no manda PageView en URLs con `?token=`. |
| 24 | Rate limit por IP evadible con IPv6 | `normalizeIpForBucket()`: IPv6 → `/64`, IPv4 mapeadas → IPv4. |
| — | `userId` de otros clientes en la API pública de reseñas | Solo se expone al autor (sesión) y al panel. |
| — | Upstash `PEXPIRE` sin comprobar | Si falla, se cae al fallback en memoria y se registra. |
| — | Secretos en argv (`curl -H`, `pg_dump --dbname`) | `scripts/run-cron-endpoint.sh` (header por fichero 600) + `PGDATABASE`. |
| — | `www.` sin redirección | Bloque nginx `www → apex`. |
| — | Direcciones guardadas sin tope | Longitudes máximas por campo. |
| — | Guard E2E por substring `test` | Token delimitado (`_test`, `test_`, `-e2e`…). |
| — | Superadmin sin rastro de auditoría | `logInfo` en crear usuario, resetear contraseña y borrar usuario; email normalizado antes del lookup. |
| — | Sentry sin saneado | `beforeSend` pasa mensajes por `sanitizeText`, sin cookies/headers/body; `sendDefaultPii:false`. |
| — | Google OAuth sin `email_verified` | Callback `signIn` lo exige. |
| — | Oráculo de tiempo en login | bcrypt «dummy» cuando el correo no existe. |
| — | Cambio de email silencioso | Aviso al correo anterior (`EmailChangeNoticeEmail`). |
| — | Cashea: verificación con `idNumber` de la URL | `confirmCasheaOrder` rechaza si el monto informado no coincide con el reservado. |

---

## Decisiones de producto que quedan abiertas (no se cambiaron)

- **Verificación de correo en el registro (#3/#25).** La cuenta sigue activándose
  al instante. Eso deja dos efectos: el registro es un oráculo de existencia de
  correos (registrar + intentar login) y los pedidos guest previos de un cliente
  ya no se vinculan al crear la cuenta (solo por token de pedido). Cerrarlo del
  todo exige un flujo «confirma tu correo antes de entrar» — vale la pena, pero
  es una feature, no un parche.
- **Cupones `VUELVE-` farmeables.** Cada carrito abandonado falso sigue
  generando un código de 5 %/$10 a las 72 h (ahora 5 snapshots/día por email).
  Si preocupa, condicionar el cupón a carritos con `userId`.
- **Ingresos por estado y no por `paidAt`** (`VALIDATED_REVENUE_STATUSES`). La
  ruta genérica de estado puede mover `Pendiente → En Proceso` sin validar pago;
  el dashboard cuenta ese pedido como cobrado.
- **Caché ISR con slugs arbitrarios.** `/categoria/<lo-que-sea>` y
  `/product/<lo-que-sea>` crean entradas de caché en disco por cada URL única.
  Cloudflare rate-limiting por ruta es la mitigación barata.
- **Modo whatsapp y guest.** El correo de confirmación sigue saliendo al email
  que escriba el guest (ahora 3/h por destinatario). Es inherente al checkout
  sin cuenta.
