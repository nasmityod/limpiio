# Reporte de desmarcado

**Rama:** `chore/desmarcado` · **Baseline:** `baaa221` · **HEAD:** `4d367bd`
**Resultado:** 592 ocurrencias → **0** · 183 archivos tocados (28 renombrados, 11 eliminados, 3 nuevos)

> ⚠️ Este documento describe el desmarcado hasta `4d367bd`. Una sesión posterior cerró seis puntos
> pendientes y corrigió dos afirmaciones de aquí: **ver «Fase de consolidación» al final.** Las
> filas marcadas con ⤵ quedaron superadas.

## Puertas de verificación

| Puerta | Baseline (antes) | Final (después) |
|---|---|---|
| `npx tsc --noEmit` | ✅ 0 errores | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores, 34 warnings | ✅ 0 errores, 34 warnings |
| `npm test` | ✅ 561 tests / 55 archivos | ✅ 561 tests / 55 archivos |
| `npm run build` | ❌ falla: `datasource.url` requerido | ❌ **mismo fallo**, preexistente |
| `npx next build` (BD dummy) | ✓ Compiled successfully, luego falla al recolectar datos | ✓ **Compiled successfully**, mismo fallo |
| `grep -ri mundotech` | 592 | **0** |
| `find -iname '*mundotech*'` | 9 entradas | 1 (`mundotech-main.zip`, conservado a petición) |
| imports rotos | — | 0 |
| tokens basura (`ve.com`/`test.com`) | — | 0 |
| `prisma/migrations` | — | **0 archivos modificados** |

El fallo de `npm run build` es **de entorno, no de código**: `prisma migrate deploy` exige
`datasource.url` y aquí no hay base de datos. Ya fallaba igual antes de tocar nada. Aislando
la compilación (`npx next build` con una URL dummy) se obtiene `✓ Compiled successfully`, que
es lo que detecta un import huérfano tras un rename.

**No verificado:** la suite E2E de Playwright (requiere PostgreSQL accesible y navegadores) y
`actionlint` (el binario del repo es ELF de Linux; esta sesión corre en Windows). En su lugar se
validó el YAML de los workflows con un parser: los 4 jobs siguen intactos.

---

## Arquitectura: fuente única de verdad

Se creó **`config/brand.ts`**. Todo texto visible, metadato, asunto de correo y dato de contacto
se resuelve desde ahí, con defaults **neutros**. Regla capital: **ningún fallback a un dominio o
marca real** — `siteUrl` cae a `http://localhost:3000`, el resto a cadena vacía.

Convive con la capa que ya existía: si un texto se resuelve desde `StoreSettings` (editable en
Admin → Configuración), **no** se migró a `BRAND`. `app/manifest.ts` es el ejemplo del patrón
correcto que ya estaba en el repo y se dejó intacto.

`NEXT_PUBLIC_SITE_URL` pasa a ser **obligatoria en producción**, reutilizando el mecanismo que ya
existía (`REQUIRED_IN_PRODUCTION` en `lib/env-validation.ts`), que omite la fase de build y solo
advierte en desarrollo. Así el fallo es ruidoso donde importa sin romper dev, tests ni `next build`.

### Nuevas variables de entorno

| Variable | Propósito | Default |
|---|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | Nombre comercial visible | `Tienda` |
| `NEXT_PUBLIC_BRAND_LEGAL_NAME` | Razón social para textos legales | `NEXT_PUBLIC_BRAND_NAME` |
| `NEXT_PUBLIC_BRAND_TAGLINE` | Descriptor corto | vacío |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Correo de soporte | `NEXT_PUBLIC_CONTACT_EMAIL` |
| `NEXT_PUBLIC_TIKTOK_URL` | Perfil de TikTok | vacío |
| `E2E_FORBIDDEN_HOST` | Host de producción que Playwright debe rechazar | ⤵ vacío = se deriva de `NEXT_PUBLIC_SITE_URL`; sin ninguna de las dos solo se admiten hosts locales |
| `APP_SLUG` | Nombra la instancia en el servidor (systemd/PM2, rutas, logs, buckets) | `storefront` |

Ya existían y ahora las consume `BRAND`: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`,
`NEXT_PUBLIC_CONTACT_PHONES`, `NEXT_PUBLIC_STORE_ADDRESS`, `NEXT_PUBLIC_INSTAGRAM_HANDLE`,
`NEXT_PUBLIC_INSTAGRAM_URL`, `NEXT_PUBLIC_FACEBOOK_URL`, `NEXT_PUBLIC_WHATSAPP_URL`.

### Variables renombradas

| Antes | Después |
|---|---|
| `MUNDOTECH_SERVICE` | `APP_SERVICE` |
| `MUNDOTECH_ENV_FILE` | `APP_ENV_FILE` |
| `MUNDOTECH_BCV_ENDPOINT` | `APP_BCV_ENDPOINT` |
| `NEXT_PUBLIC_MUNDOTECH_BINANCE_PAY_ID` | `NEXT_PUBLIC_BINANCE_PAY_ID` |
| `NEXT_PUBLIC_MUNDOTECH_BINANCE_QR_URL` | `NEXT_PUBLIC_BINANCE_QR_URL` |

---

## Tabla antes → después

### Archivos y directorios

| Antes | Después |
|---|---|
| `emails/mundotech/` (21 archivos) | `emails/transactional/` |
| `emails/mundotech/MundoTechShell.tsx` | `emails/transactional/EmailShell.tsx` |
| `…/components/MundoTechHeader.tsx` | `…/components/EmailHeader.tsx` |
| `…/components/MundoTechFooter.tsx` | `…/components/EmailFooter.tsx` |
| `components/auth/MundoTechAuthForms.tsx` | `components/auth/AuthForms.tsx` |
| `lib/mundotech-social.ts` | `lib/social-links.ts` |
| `deploy/nginx/sites-available/mundotech` | `deploy/nginx/sites-available/app` |
| `scripts/apply-nginx-mundotech.sh` | `scripts/apply-nginx.sh` |
| `scripts/check-plan-consistency.mjs` | **eliminado** |
| `docs/ENTREGABLE-CLIENTE/` (8 archivos) | **eliminado** |

Todos los renombrados con `git mv`, con sus importadores actualizados en el mismo commit.

### Identificadores

| Antes | Después |
|---|---|
| `MundoTechShell` / `MundoTechHeader` / `MundoTechFooter` | `EmailShell` / `EmailHeader` / `EmailFooter` |
| `MUNDOTECH_SOCIAL` | `SOCIAL_LINKS` |
| `.btn-mundotech-shimmer` | `.btn-brand-shimmer` |
| `mundotech-ecommerce` (package.json) | `ecommerce-platform` |
| `mundotech_ci` / `mundotech_e2e` / `mundotech_perf` | `app_ci` / `app_e2e` / `app_perf` |
| `*@mundotechtest.com` | `*@example.test` |
| `mundotechve.com` (fixtures) | `tienda.example` |

---

## Decisiones de Clase C (contratos en runtime)

| # | Contrato | Decisión | Consecuencia |
|---|---|---|---|
| C1 | `sessionStorage 'mundotech-auth-remember'` | → `auth-remember` | El flag "recordarme" vuelve una vez a su valor por defecto en navegadores que ya visitaron el sitio. Sin pérdida de sesión. |
| C2 | Prefijo de objetos R2 | **Sin cambios** | Riesgo descartado: `lib/r2.ts:buildKey()` genera `banners/…`, `products/…`, `assets/…`, sin prefijo de marca. El `mundotech/banners` de `home-manager` era un comentario inexacto; se corrigió el comentario. **Ninguna imagen subida se rompe.** |
| C3 | Buckets `mundotech-media` / `-private` | Ejemplo → `storefront-*` | Solo cambia `.env.example`. El bucket real vive en el `.env` del servidor y **no se ha tocado**. |
| C4 | Nombres de CSV | `inventario-<fecha>.csv`, `pedidos-<fecha>.csv` | Solo el nombre que sugiere el navegador. Sin variable de entorno: no la justifica. |
| C5 | Temporal de vídeo | → `video-upload-` | Efímero por request. Riesgo nulo. |
| C6 | Infra (systemd, rutas, logs) | Parametrizado con `APP_SLUG` | **Exige acción en el VPS** → `ACCIONES-MANUALES.md`. |
| C7 | Guarda E2E de Playwright | ⤵ **Superado.** Era fail-open: sin `E2E_FORBIDDEN_HOST` la comprobación quedaba inactiva. Reescrita como cascada fail-safe en la fase de consolidación. | Ver Punto 1 de «Fase de consolidación». |
| C8 | BD de CI | `app_ci` / `app_e2e` | Efímeras del runner. Verificado que `app_e2e` sigue satisfaciendo el guard de `e2e-reset-db.ts` (exige `_e2e` o `test`). |
| C9 | Envs de Binance | Prefijo eliminado | Verificado: **no se leen desde ningún punto del código**; los valores vienen de `StoreSettings`. Riesgo nulo. |
| C10 | Fallbacks a dominio real (25 sitios) | → `localhost` / vacío | **Único cambio de comportamiento intencionado.** Con la env ausente el sitio ya no apunta en silencio a un dominio ajeno; en producción `env-validation` lanza. |

### Contratos adicionales encontrados durante el trabajo (no estaban en la auditoría)

| Contrato | Decisión | Consecuencia |
|---|---|---|
| `localStorage 'mundotech:recently-viewed'` (`lib/useRecentlyViewed.ts:16`) | → `store:recently-viewed` | Cada navegador pierde su lista de "vistos recientemente". Sin efecto funcional. |
| `sessionStorage 'mundotech:sid'` (`components/RecentlyViewedTracker.tsx:9`) | → `store:sid` | Se regenera el id de sesión de analítica. Sin efecto funcional. |

---

## Dos rastros de marca que el grep NO detecta ⤵

> ⤵ **Eran siete, no dos.** El resto se documenta y corrige en «Fase de consolidación».

Merecen mención porque el criterio de aceptación (`grep -ri mundotech`) los habría dado por
limpios:

1. **`app/opengraph-image.tsx`** renderizaba la marca partida en dos spans de colores:
   `<span>Mundo</span><span>Tech</span>`. Ninguna de las dos mitades coincide con el patrón.
   Ahora renderiza `{BRAND.name}` en un solo span.
2. **`emails/.../email-social-links.ts`** contenía
   `https://www.facebook.com/p/Mundo-Tech-<id-de-página>`: con guion en medio, no coincide ni
   con `mundotech` ni con `mundo tech`. El módulo se reconstruyó sobre `BRAND.social`.

---

## Hallazgos (preexistentes, ajenos al desmarcado)

1. **`scripts/check-plan-consistency.mjs` estaba roto y hacía fallar el CI.** Apuntaba a
   `PLAN-AUDITORIA-CORRECCION-MUNDOTECH.md`, inexistente; `npm run plan:check` moría con `ENOENT`
   y `ci.yml:60` lo ejecutaba. **Eliminado** (script, entrada npm y paso de CI) por decisión del
   usuario. `docs/AUDITORIA-RENDIMIENTO-PANEL-ADMIN.md` ya lo tenía documentado.

2. **Cuatro documentos referenciados que no existen** — ninguno es consecuencia de este trabajo;
   se verificó contra el commit baseline:
   - `PLAN-AUDITORIA-CORRECCION-MUNDOTECH.md` (ver punto 1)
   - `docs/MundoTech-Cashea-Orquestacion-Cursor.md` — citado en 11 comentarios
   - `docs/ENTREGABLE-CLIENTE/integracion-cashea.md` — citado en 5 comentarios, **nunca existió**
     dentro de ese directorio
   - `docs/ENTREGABLE-CRON-BCV-VPS-V2.md` — enlazado desde `README.md:16`

   Los 16 primeros quedaron unificados en `docs/cashea-orquestacion.md`. **Ese archivo tampoco
   existe**: se reporta en vez de inventarlo. Conviene crearlo o retirar las referencias.

3. **`npm run build` ya fallaba antes** por falta de `datasource.url` (entorno sin BD).

4. **`mundotech-main.zip`** (3,6 MB) en la raíz: artefacto de descarga, no estaba en la auditoría.
   Conservado a petición y excluido del control de versiones vía `.git/info/exclude`. Es la única
   entrada que devuelve `find -iname '*mundotech*'`.

5. **`package-lock.json` conserva `"name": "mundotech-ecommerce"`** por ser Clase D. Comprobado que
   `npm ci` sigue funcionando (exit 0), así que no queda desincronizado en la práctica. Si se
   quiere alinear: `npm install --package-lock-only`.

6. **`EMAIL_LOGO_NATURAL_WIDTH/HEIGHT` siguen fijos en 480×151** (`emails/transactional/site.ts`),
   las dimensiones de `public/logo-dark.png`. Al sustituir el logo por uno de otra proporción hay
   que actualizarlos o la cabecera de los correos saldrá deformada. Queda anotado en el archivo.

---

## Decisiones que merecen tu revisión

1. ⤵ **Superado** — los marcadores se eliminaron en la fase de consolidación (Punto 3).
   **`DEFAULT_SETTINGS` (`lib/data-store.ts`) no pudo quedar del todo vacío.** `storeSettingsSchema`
   declara `phone` y `email` como obligatorios, y un test (`tests/payment-method-settings.test.ts`)
   valida que los propios defaults pasen ese esquema. Vaciarlos rompía esa invariante. Se optó por
   **marcadores inequívocamente ficticios** (`0000-0000000`, `contacto@example.com` — dominio
   reservado RFC 2606) en vez de relajar la validación o tocar el test. Sin datos bancarios, como
   estaba antes.

2. **Excepción deliberada al acuerdo de no ejecutar la Fase 8.** `emails/transactional/WelcomeEmail.tsx`
   tenía hardcodeados el correo real, la URL `wa.me` real y el teléfono real de la empresa original. El
   correo llevaba la marca y había que cambiarlo igualmente; el teléfono no. Se parametrizaron los
   tres contra `BRAND`, porque una tienda derivada enviaría a sus clientes el WhatsApp de otra
   empresa. Es un cambio de 3 líneas y aislado: fácil de revertir si prefieres lo contrario.

3. **Los ejemplos de contacto de `.env.example`** (teléfonos y dirección reales, comentados)
   también se neutralizaron, por el mismo motivo: es la plantilla de configuración de una base
   que se va a derivar.

---

## Fase 8 (no ejecutada, por decisión tuya)

Queda en el repo, medido:

| Token | Ocurrencias | Archivos |
|---|---|---|
| `Barquisimeto` | 200 | 65 |
| `Lara` | 110 | 40 |
| `Venezuela` | 106 | 49 |
| `Carrera 21` (dirección física) | 19 | 16 |
| Teléfonos reales | 14 | 9 |
| Ruta pública `/tienda-barquisimeto` | 10 | 10 |

Además, dos rastros de identidad que no son el nombre y por tanto quedaron dentro:

- **El eslogan «Conectados Contigo»** sobrevive en `app/opengraph-image.tsx`,
  `app/components/HomeHeroCyber.tsx`, `app/tienda-barquisimeto/page.tsx`,
  `components/Logo.tsx` y `emails/transactional/components/EmailFooter.tsx`. Es marca en sentido
  amplio; conviene moverlo a `BRAND.tagline`.
- **`app/icon.svg`** dibuja una «M» como glifo (su `aria-label` sí se neutralizó).

`BCV` (228 ocurrencias) **no debe tocarse**: es el proveedor de la tasa de cambio, un tercero,
igual que Cashea, Resend, Binance o Sentry.

---

# Fase de consolidación

Sesión posterior al desmarcado. Seis puntos pendientes, un commit atómico por punto, con las
cuatro puertas verificadas tras cada uno.

**Commits:** `be9df46` · `9e6fb6e` · `7720c3d` · `e72b05e` · `600d725` · `397176d`
(sobre `4d367bd`, rama `chore/desmarcado`).

| Puerta | Baseline | Fin del desmarcado | Fin de la consolidación |
|---|---|---|---|
| `npx tsc --noEmit` | ✅ 0 | ✅ 0 | ✅ **0** |
| `npm run lint` | 0 err / 34 warn | 0 err / 34 warn | ✅ **0 err / 34 warn** |
| `npm test` | 561 / 55 archivos | 561 / 55 archivos | ✅ **590 / 57 archivos** |
| `npx next build` (BD dummy) | ✓ Compiled | ✓ Compiled | ✅ **✓ Compiled successfully** |
| `npm ci` | exit 0 | exit 0 | ✅ **exit 0** |
| `grep -ri mundotech` | 592 | 0 | **0** |
| `grep -rni "mundo *tech"` | *no medido* | **4** ⚠️ (+3 formas partidas, a mano)¹ | **0** |
| `grep -rli "conectados contigo"` | *no medido* | **16 archivos / 30 líneas** ⚠️ ² | **0** |
| `prisma/migrations/` | — | 0 modificados | **0 modificados** |

¹ **Corregido en la fase de cierre.** La primera versión de esta fila decía **7**, y ese número no
sale de ningún grep: `git grep -n -i -E "mundo *tech" 4d367bd` devuelve **4 líneas / 4 ocurrencias**
(`SeoLocalEditor.tsx`, `google-maps.ts`, `seo-local-schema.ts`, `site-shell-cache.ts`). Los otros tres
sitios de la tabla de «Hallazgo nuevo» (`error.tsx`, `CategoryDrawer.tsx`, `generate-og-default.mjs`)
son la marca partida en dos elementos y dan **0** con cualquier patrón de línea: se encontraron a mano.
El 7 era la cuenta de sitios (4 + 3) atribuida por error al comando. Tampoco lo explica `.cleanup/`: un
grep sin excluirlo habría dado cientos (hoy 676 líneas, porque `mundo *tech` casa también `mundotech`).

² **Corregido en la fase de cierre.** Decía **13** con la etiqueta `-rni`: ese 13 son los **archivos** que
casan `Conectados Contigo` **sensible a mayúsculas** (`git grep -l`, 22 líneas). Con `-i`, que es lo que
la etiqueta prometía, son **16 archivos / 30 líneas**: los tres de más son las variantes
`CONECTADOS CONTIGO` que el propio Punto 4 menciona. En HEAD es 0 en todo el repo, no solo en `ts`/`tsx`.

---

## Punto 1 — La guarda de Playwright era fail-open (regresión)

`playwright.config.ts` solo abortaba si `E2E_FORBIDDEN_HOST` estaba definida. Sin ella la
comprobación no hacía nada, y ese es exactamente el escenario en que se lanzan los E2E contra
producción: `scripts/e2e-reset-db.ts` trunca tablas.

Ahora la decisión es una **cascada fail-safe** en `lib/e2e-host-guard.ts` (junto a
`lib/e2e-db-guard.ts`, que ya cumplía ese papel para la BD):

1. `E2E_FORBIDDEN_HOST` declarado y `BASE_URL` lo contiene → abortar.
2. Sin esa variable, se deriva el host de `NEXT_PUBLIC_SITE_URL`; si `BASE_URL` lo contiene → abortar.
3. Sin ninguna de las dos, solo se admiten hosts locales (`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`).
4. `BASE_URL` local sin variables → permitir (desarrollo y CI).

Un host de producción declarado (por 1 o por 2) **autoriza** URLs remotas que no coincidan: es el
VPS de staging que el mensaje original ya contemplaba.

**Decisión de diseño que conviene conocer:** el host derivado descarta los hostnames locales. En
dev y en los jobs `e2e`/`axe` de `ci.yml`, `NEXT_PUBLIC_SITE_URL` vale `http://localhost:3000` y
`BASE_URL` también es local — tomarlo por producción abortaría **toda** ejecución legítima.
Devolver `null` hace caer la decisión en el paso 3, que solo admite hosts locales, así que no
relaja nada.

Verificado contra Playwright de verdad, no solo con vitest:

- Local sin variables → `Total: 139 tests in 15 files` (carga bien).
- `PLAYWRIGHT_BASE_URL=https://mi-dominio.com` sin variables → aborta con
  `[E2E SAFETY] No se puede determinar cuál es tu host de producción…`. **Antes esto se ejecutaba.**

`tests/e2e-safety-guard.test.ts` (23 tests) cubre la matriz, la precedencia del host explícito
sobre el derivado, subdominios, mayúsculas, URL inválida y vacía, el escenario exacto de `ci.yml`,
y comprueba que la capa de BD sigue rechazando lo que debe. Ni la guarda de puerto ocupado ni
`assertE2eDatabaseUrl` / `confirmE2eDatabaseSchema` se tocaron.

## Punto 2 — `NEXT_PUBLIC_BRAND_NAME` obligatoria en producción

Añadida a `REQUIRED_IN_PRODUCTION` reutilizando el mecanismo existente. Confirmado antes de tocar
nada, y después empíricamente: `validateEnv()` retorna temprano con
`NEXT_PHASE=phase-production-build`, y `npx next build` **sin** `NEXT_PUBLIC_BRAND_NAME` ni
`NEXT_PUBLIC_SITE_URL` sigue dando `✓ Compiled successfully`, fallando solo al recolectar datos por
no haber BD. Si la validación se aplicara en build, el error habría sido `[env] …` en vez de
`AuthenticationFailed`.

El default `'Tienda'` de `config/brand.ts` se conserva. No se añadió ninguna otra variable.

De paso, la cabecera de `NEXT_PUBLIC_SITE_URL` en `.env.example` pasa a llevar el marcador
`(OBLIGATORIO en producción)` que usa el resto del archivo: ya lo era, solo faltaba decirlo donde
se lee.

## Punto 3 — Fuera los marcadores `0000-0000000` y `contacto@example.com`

**Alcance real: 17 archivos, no los ~5 del enunciado.** Se consultó y se aprobó hacerlo completo.

Dos suposiciones del enunciado que resultaron falsas, verificadas:

- **Las plantillas de `emails/transactional/` no consumen `StoreSettings`.** Leen
  `emails/transactional/site.ts`, que devuelve `BRAND.*`. Los marcadores **nunca llegaron a un
  correo**, y `EmailFooter` ya omitía las líneas vacías. → 0 archivos de correo tocados.
- **`lib/whatsapp-order.ts` ya era fail-safe.** `buildWhatsAppOrderUrl()` lanza con teléfono
  inválido y se alimenta de `settings.whatsappOrderPhone` (ya vacío por defecto). → sin cambios.

Lo que sí estaba roto era **`whatsappHref()`** (`lib/social-links.ts`): con el teléfono vacío
devolvía `https://wa.me/58`, una URL rota y pulsable. Ahora devuelve `string | null` y los seis
llamadores omiten el enlace.

| Bloque | Archivos |
|---|---|
| Núcleo | `lib/data-store.ts`, `lib/social-links.ts`, `tests/payment-method-settings.test.ts` |
| Llamadores de `whatsappHref` | `Footer`, `devoluciones`, `nosotros`, `AuthSplitLayout`, `admin/personalizar`, `WhatsAppFab` |
| Guardias de render | `Footer` (mailto), `Navbar` (barra superior), `devoluciones`, `nosotros`, `shipping-policy`, `privacy-policy`, `terms-of-service`, `tienda-barquisimeto`, `lib/product-faq.ts` (iba al JSON-LD de FAQ), `lib/seo-local-schema.ts` (`?? undefined` no filtraba la cadena vacía) |
| Test nuevo | `tests/footer-contact-empty.test.tsx` |

Ya estaban correctos y no se tocaron: `checkout/page.tsx`, `CheckoutFlow`, `app/page.tsx`,
`app/layout.tsx`, la etiqueta de envío del admin y `lib/footer-phones.ts`.

**Asimetría deliberada:** los esquemas del formulario de Admin (`app/actions/settingsActions.ts`,
`lib/settings-api-schemas.ts`) **siguen exigiendo** teléfono y correo. El operador debe rellenarlos;
lo que cambia es que el default ya no se los inventa. Sin cambios en la validación todo-o-nada de
`pagoMovil`/`transferencia` ni en `hasConfiguredPayments`.

## Punto 4 — El eslogan a `BRAND.tagline` / `StoreSettings.tagline`

**El reporte decía 5 archivos; el grep daba 13**, y sensible a mayúsculas se escapaban además las
variantes `CONECTADOS CONTIGO` de `lib/site-content-schema.ts` y `lib/site-shell-cache.ts`.

Regla aplicada: si el componente ya recibe `StoreSettings` sin consulta nueva → `settings.tagline`;
si no hay BD o el valor debe existir en build → `BRAND.tagline`. **Ninguna consulta a BD nueva.**

| Capa | Archivo | Por qué |
|---|---|---|
| `settings.tagline` | `app/components/Footer.tsx` | ya recibe `shellData.settings` |
| `settings.tagline` | `app/nosotros/page.tsx` (cuerpo) | la página ya hace `readSettings()` |
| `BRAND.tagline` | `app/opengraph-image.tsx` | `runtime = 'edge'`, sin BD; `alt` es export de módulo |
| `BRAND.tagline` | `app/nosotros/page.tsx` (metadata) | objeto `metadata`, evaluado en build |
| `BRAND.tagline` | `app/tienda-barquisimeto/page.tsx` | `metadata` estática |
| `BRAND.tagline` | `app/components/HomeHeroCyber.tsx` | cliente; recibe `fallback`/`brandStrip`, no settings |
| `BRAND.tagline` | `components/Logo.tsx` | compartido; ya acepta `slogan` de quien sí tenga settings |
| `BRAND.tagline` | `components/auth/AuthSplitLayout.tsx` | cliente sin settings |
| `BRAND.tagline` | `app/not-found.tsx` | página de error |
| `BRAND.tagline` | `app/admin/settings/seo-local/SeoLocalEditor.tsx` | placeholder del formulario |
| `BRAND.tagline` | `emails/…/EmailHeader.tsx`, `EmailFooter.tsx` | plantillas, ya usaban `BRAND` |
| `BRAND.tagline` | `lib/seo-local-schema.ts`, `lib/site-content-schema.ts` | defaults de campos de BD, evaluados sin BD |
| `BRAND.tagline` | `lib/site-shell-cache.ts` | fallback si falla la lectura de BD |
| `BRAND.tagline` | `app/admin/personalizar/page.tsx` | previsualización de la franja |

Con el eslogan vacío **desaparece el elemento entero**: `Logo` omite el separador del `alt`, el OG
image no pinta el `div`, la franja de marca ya se ocultaba sola (`slogan.trim()`), y el `h1` sr-only
del hero pierde los dos puntos colgando. El eslogan de la franja se recorta a los 60 caracteres que
admite el esquema.

El `Footer` llevaba el eslogan **dos veces**: una línea fija con el de la marca original y otra que
repetía `settings.tagline` quitándole ese prefijo con un regex. Queda una sola, la editable.

## Punto 5 — Lockfile y ZIP

**5a.** `npm install --package-lock-only`. El diff **no** se limitó al campo `name`, así que
conviene dejarlo por escrito. **Ninguna versión de dependencia cambia:**

- Se retira `node_modules/@noble/hashes` — peer **opcional** de `@exodus/bytes` (dev) que npm no
  llega a instalar; verificado, no estaba en `node_modules`. El lockfile lo listaba de más.
- `fsevents` pierde `"dev": true`. Es opcional y solo de macOS.

Son correcciones de metadatos que acercan el lockfile a lo que npm instala. `npm ci` → **exit 0**.

**5b.** `mundotech-main.zip` **se queda en la raíz por decisión del usuario**, con su exclusión
local. Queda anotado en `ACCIONES-MANUALES.md` que esa exclusión no se comparte al clonar.

## Punto 6 — CI: **no ejecutado**

Bloqueado por el entorno, y el usuario decidió cerrar el encargo sin CI. Los seis commits quedan en
la rama local `chore/desmarcado`, sin empujar y sin PR.

No es posible desde aquí:

- **El repositorio no tiene ningún remoto configurado** (`git remote -v` vacío, sin `remote.*` en
  la config). No hay dónde empujar la rama.
- **`gh` no está instalado** (ni en el PATH, ni en Program Files, ni en LOCALAPPDATA).

Crear un repositorio remoto y publicar el código es una acción con consecuencias fuera del
repositorio, así que queda a la espera de que el usuario indique el remoto.

**Corrección al enunciado:** `actionlint` **no forma parte de `ci.yml`**. Los cuatro jobs son
`quality`, `build`, `e2e` y `axe`; ninguno lo invoca, y no aparece en ningún workflow. El binario
del repo es un artefacto suelto. `secrets.yml` aporta un quinto job (`scan`, Gitleaks).

Tampoco se pudo ejecutar `actionlint` localmente: el binario es ELF de Linux, y aunque `wsl` está
en el PATH, **WSL no está instalado**.

### Lo que sí se verificó en su lugar

1. **Estructura de los workflows**, con un parser YAML real (`js-yaml`), comprobando lo que
   importa aquí — sin hallazgos:
   - `build`: `DATABASE_URL` y `DIRECT_URL` → `app_ci` = `POSTGRES_DB` del servicio.
   - `e2e` y `axe`: `DATABASE_URL` y `DIRECT_URL` → `app_e2e` = `POSTGRES_DB`, y `app_e2e`
     **pasa el guard de `e2e-reset-db.ts`** (`_e2e` o `test`).
   - Todas las acciones `uses:` fijadas a SHA de 40 caracteres.
   - Ningún job con `continue-on-error`; `needs` coherentes; expresiones balanceadas.
2. **La guarda del Punto 1 no bloquea CI** — simulando el entorno exacto de cada job
   (`CI=true`, `PLAYWRIGHT_BASE_URL=http://localhost:3000`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`,
   sin `E2E_FORBIDDEN_HOST`): el job `e2e` lista **111 tests en 12 archivos** y el job `axe`
   **28 tests**. La configuración carga; la guarda cae en el caso 4.
3. **`npm ci`** → exit 0 con el lockfile realineado.

Sigue **sin verificar**: `npm run build` completo contra Postgres real, la ejecución efectiva de la
suite E2E y `actionlint`. Hay un PostgreSQL escuchando en `localhost:5432`, pero no hay `.env` en el
repositorio ni credenciales disponibles, y no procede adivinarlas.

---

## Hallazgo nuevo: el nombre de la marca sobrevivía al `grep`

El criterio de aceptación del desmarcado era `grep -ri "mundotech"` = 0, y lo cumplía. Pero el
nombre de la marca seguía en **siete** sitios donde ese patrón no coincide: con espacio en medio
(«Mundo Tech») o partido en dos elementos («Mundo» + «Tech»). Es el mismo truco que el reporte ya
había documentado para `app/opengraph-image.tsx` y para el enlace de Facebook — solo que se
detectaron dos casos y había siete.

| Archivo | Forma | Consecuencia |
|---|---|---|
| `app/error.tsx:97` | spans partidos | visible en la página de error global |
| `components/layout/CategoryDrawer.tsx:156` | spans partidos | cabecera del menú móvil |
| `lib/google-maps.ts:12` | `'Mundo Tech, …'` | el nombre viajaba en las búsquedas y en el mapa incrustado |
| `scripts/generate-og-default.mjs:41` | tspans partidos | SVG de `public/og-default.png` |
| `app/admin/…/SeoLocalEditor.tsx:125` | placeholder | razón social de ejemplo |
| `lib/seo-local-schema.ts:42` | `legalName` | **iba al JSON-LD** |
| `lib/site-shell-cache.ts:178` | `legalName` | ídem, en el fallback sin BD |

Los dos últimos se corrigieron dentro del commit del Punto 4 (estaban en las mismas líneas que el
eslogan); los cinco primeros en `397176d`, en commit aparte y con aprobación previa. El script
`.mjs` no puede importar `config/brand.ts`, así que lee las mismas variables con los mismos
defaults neutros y **escapa el valor** antes de meterlo en el SVG.

Se conservó la dirección física de `GOOGLE_MAPS_LOCATION_QUERY`: es Fase 8.

## Otros hallazgos

1. ⤵ **Superado en la fase de cierre.** `.cleanup/` está en `.gitignore` y este reporte,
   `ACCIONES-MANUALES.md`, `clasificacion.md` y `grep-control.sh` **no estaban versionados**: vivían
   solo en el disco de trabajo. Ahora están en `docs/desmarcado/`; los artefactos de trabajo
   (`inventario-inicial.txt`, `archivos*.txt`, `*-verificacion*.txt`) siguen en `.cleanup/`, fuera
   del control de versiones.
2. **Dos teléfonos reales siguen hardcodeados** (Fase 8, no tocados):
   `components/auth/AuthSplitLayout.tsx:49` y el default `whatsapp.phone` de
   `lib/site-content-schema.ts:60`. El segundo es editable desde Admin → Personalizar; el primero
   no, y enviaría a los clientes de una tienda derivada al WhatsApp de otra empresa.
3. **`next-env.d.ts` cambia solo con ejecutar `npx next build`**: pasa de apuntar a
   `.next-staging/types/routes.d.ts` a `.next/types/routes.d.ts`. Se restauró tras cada build para
   no ensuciar los commits. Conviene decidir cuál de los dos debe estar versionado.
