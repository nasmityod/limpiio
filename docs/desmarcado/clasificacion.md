# Clasificación de ocurrencias — Fase 0

**Línea base verificada:** 592 ocurrencias · 165 archivos · 531 líneas (patrón original)
**Línea base con el patrón corregido:** 598 ocurrencias · 166 archivos (ver nota metodológica)
**Comando de control:** `bash docs/desmarcado/grep-control.sh count` (hasta la fase de cierre vivía en `.cleanup/`)

Variantes exactas (ocurrencias reales, no líneas):

| Variante | Ocurrencias | Origen del conteo |
|---|---|---|
| `MundoTech` | 292 | `grep-control.sh` original (`grep -ro -i "mundotech"`) |
| `mundotech` | 274 | ídem |
| `MUNDOTECH` | 20 | ídem |
| `Mundotech` | 6 | ídem |
| **Subtotal sin separador** | **592** | **= salida del comando documentado** |
| `Mundo Tech` (espacio) | 5 | grep aparte, ad-hoc — **no incluido en el 592** |
| `Mundo-Tech` (guion) | 1 | nunca contado en la Fase 0; hallado en el desmarcado |
| **Total con el patrón corregido** | **598** | `grep-control.sh` corregido (`-E -i "mundo[ _.-]?tech"`) |

> Nota metodológica (corregida en la fase de cierre): la auditoría previa reportó ~592 ocurrencias
> contando **líneas por variante** (552 + 547 + 40 + 12, con solapamiento). Contando **ocurrencias
> reales** con `grep -o`, las cuatro variantes sin separador suman exactamente 592 sobre 165
> archivos, y ese fue el criterio de control adoptado.
>
> **Lo que la primera versión de esta tabla no decía:** el patrón original del script
> (`mundotech` literal) **no podía casar** las formas con separador. La fila `Mundo Tech` (5) salió de
> un grep aparte y se añadió a la tabla **sin sumarse al total**: las filas sumaban 597 mientras el
> total decía 592. `Mundo-Tech` (1, el enlace de Facebook) no se contó en ningún momento. Además hay
> **5 formas partidas en dos elementos** (`<span>Mundo</span><span>Tech</span>` en `app/error.tsx`,
> `app/not-found.tsx`, `app/opengraph-image.tsx`, `components/layout/CategoryDrawer.tsx` y los
> `<tspan>` de `scripts/generate-og-default.mjs`) que ningún grep de línea puede contar.
>
> En la fase de cierre el script pasó a `-E -i "mundo[ _.-]?tech"` (separador opcional de un solo
> carácter, mitades obligatorias y contiguas) y ganó el modo `split`, que busca la primera mitad
> suelta en archivos de render para revisión manual. Con el patrón corregido la baseline mide
> **598 ocurrencias en 166 archivos**, y HEAD sigue en **0**. Todas las cifras de este documento se
> obtuvieron con `git grep` sobre `baaa221` y con el script corregido en un worktree de ese commit.

---

## Clase D — NO TOCAR (verificado, no asumido)

| Ruta | Ocurrencias | Motivo |
|---|---|---|
| `prisma/migrations/**` | **0** | Integridad del historial (28 migraciones). Verificado limpio. |
| `backups/2026-08-16-catalogo-pre-recategorizacion/**` | **0** | Datos históricos. Verificado limpio. |
| `package-lock.json` | — | Excluido por contrato |
| `node_modules/`, `.next/` | — | Artefactos de build |
| `actionlint` (binario, 5,1 MB) | — | Binario de terceros |
| `tsconfig.tsbuildinfo` | 31 | **Artefacto generado** por `tsc` (ignorado en git). Se regenera solo; excluido del control. |
| `lib/data-store.ts` → `SETTINGS_KEY = 'store_settings'` | 0 | Clave persistida en BD. No contiene la marca; **no se toca**. |

**Nombres de terceros que NO son la marca** (no se renombran): Cashea, Resend, Binance, BCV,
Prisma, Sentry, next-auth, `cashea-web-checkout-sdk`, `types/cashea-web-checkout-sdk.d.ts`.

---

## Clase C — Contratos en runtime (riesgo ALTO)

### C1 · sessionStorage — `components/auth/MundoTechAuthForms.tsx:203`

`sessionStorage.setItem('mundotech-auth-remember', rememberMe ? '1' : '0')`

**Decisión:** renombrar a `auth-remember`.
**Consecuencia:** en navegadores que ya visitaron el sitio, el flag "recordarme" vuelve una vez a su
valor por defecto. No hay pérdida de sesión ni de datos de usuario. Aceptable en una base pensada
para derivar tiendas nuevas. **Queda anotado en el reporte.**

### C2 · Prefijo de objetos en R2 — riesgo DESCARTADO tras verificación

`app/admin/home-manager/page.tsx:69` menciona el folder por defecto `mundotech/banners`, pero es un
**comentario histórico inexacto**. El código real (`lib/r2.ts:159`, `buildKey()`) genera
`${folder}/${slug}-${shortId}.${ext}` con `folder ∈ {banners, products, assets}` — **sin prefijo de
marca**. Ninguna clave de objeto en R2 depende del nombre de marca.

**Decisión:** corregir el comentario (pasa a Clase A). Ninguna imagen ya subida se rompe.

### C3 · Nombres de bucket R2 — `.env.example:36,45`

`R2_BUCKET_NAME=mundotech-media`, `R2_PRIVATE_BUCKET_NAME=mundotech-private`.

Ya son variables de entorno: el valor real vive fuera del repo, en `.env`. Cambiar el **ejemplo** no
toca ningún bucket existente.

**Decisión:** parametrizar el ejemplo a `${APP_SLUG}-media` / `${APP_SLUG}-private` y documentar en
`ACCIONES-MANUALES.md` que, si se reutiliza la cuenta R2 actual, el `.env` real debe conservar el
nombre de bucket vigente.

### C4 · Nombres de descarga CSV

- `app/admin/products/page.tsx:322` → `inventario-mundotech-<fecha>.csv`
- `app/api/admin/products/export.csv/route.ts:114` → idem, vía `Content-Disposition`
- `app/api/orders/export.csv/route.ts:89` → `pedidos-mundotech-<fecha>.csv`

**Decisión:** `inventario-<fecha>.csv` / `pedidos-<fecha>.csv`. Sin marca y sin variable de entorno:
el nombre sugerido de un fichero descargado no justifica una env. Afecta solo al nombre que propone
el navegador; no hay integraciones que lo parseen dentro del repo.
Los tests que lo afirman se actualizan en el mismo commit.

### C5 · Directorio temporal — `app/api/upload-video/route.ts:202`

`mkdtemp(join(tmpdir(), 'mundotech-video-'))`

**Decisión:** `video-upload-`. Temporal efímero por request, sin consumidores externos. Riesgo nulo.

### C6 · Infraestructura (exige cambios en el VPS)

| Ubicación | Valor actual |
|---|---|
| `ecosystem.config.js` | `name: 'mundotech'`, `cwd: '/var/www/mundotech'` |
| `deploy/crontab.vps` | `/var/www/mundotech/…`, `/etc/mundotech/mundotech.env`, `/var/log/mundotech-cron.log` |
| `deploy/nginx/sites-available/mundotech` | `server_name mundotechve.com`, certificados `/etc/ssl/cloudflare/mundotech.{pem,key}` |
| `scripts/deploy-vps.sh:21,39,44` | `MUNDOTECH_SERVICE`, `MUNDOTECH_ENV_FILE` |
| `scripts/install-crontab.sh:10` · `scripts/run-bcv-cron.sh:4,5` | `MUNDOTECH_ENV_FILE`, `MUNDOTECH_BCV_ENDPOINT` |
| `scripts/backup-postgres.sh:11` | `/var/www/mundotech/…`, `/var/log/mundotech-backup.log` |

**Decisión:** parametrizar con `APP_SLUG="${APP_SLUG:-storefront}"` y renombrar las variables a
`APP_SERVICE` / `APP_ENV_FILE` / `APP_BCV_ENDPOINT`, conservando el patrón `${VAR:-default}` que ya
usan los scripts. Las rutas reales quedan **fuera del repo**.
Requiere acción manual en el VPS → documentado en `ACCIONES-MANUALES.md`.

⚠️ `tests/deploy-crontab.test.ts:29` afirma `/var/log/mundotech-cron.log`. Se actualiza en el
**mismo commit** que el crontab, o el test rompe.

### C7 · Guarda de seguridad E2E — `playwright.config.ts:30`

`if (BASE_URL.includes('mundotechve.com')) throw new Error('[E2E SAFETY] …')`

**Decisión: la protección se conserva.** Se convierte en `E2E_FORBIDDEN_HOST` leído de entorno; la
comprobación se ejecuta cuando la variable está definida. No se elimina ni se debilita.

### C8 · Nombres de BD en CI — `.github/workflows/ci.yml`

`mundotech_ci` (80, 89, 91) y `mundotech_e2e` (137, 147-148, 236, 245-246). Son bases de datos
efímeras del runner.

**Decisión:** `app_ci` / `app_e2e`. Riesgo nulo.
✅ Verificado: `scripts/e2e-reset-db.ts:5` aborta si la URL no contiene `_e2e` o `test`.
`app_e2e` sigue cumpliendo esa guarda.

### C9 · Variables de entorno públicas de Binance

`NEXT_PUBLIC_MUNDOTECH_BINANCE_PAY_ID` y `NEXT_PUBLIC_MUNDOTECH_BINANCE_QR_URL`
(`.env.example:84,86`, ambas ya comentadas).

**Decisión:** `NEXT_PUBLIC_BINANCE_PAY_ID` / `NEXT_PUBLIC_BINANCE_QR_URL`.
✅ Verificado: **no se leen desde ningún punto del código**; los valores efectivos vienen de
`StoreSettings` en BD (`binancePayId`, `binanceQrUrl`). Riesgo nulo.

### C10 · Fallbacks a dominio y datos reales — 25 ubicaciones

`process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mundotechve.com'` en 18 archivos de `app/`, más
`lib/indexnow.ts`, `emails/mundotech/site.ts` (URL y correo de contacto), y datos de contacto reales
en `lib/data-store.ts:130-137` y `lib/mundotech-social.ts`.

**Decisión:** el fallback pasa a `http://localhost:3000`; los datos de contacto, a cadena vacía.

**Esto sí cambia comportamiento cuando la env falta** — y es el objetivo declarado: fallar de forma
visible en lugar de apuntar en silencio a un dominio ajeno. Es el único cambio de comportamiento
intencionado de todo el trabajo, y solo se manifiesta en entornos mal configurados.

---

## Clase B — Identificadores con rename coordinado

| Antes | Después | Referencias a actualizar en el mismo commit |
|---|---|---|
| `emails/mundotech/` (21 archivos) | `emails/transactional/` | 12 importadores: `lib/resend.tsx`, `app/api/orders/**`, `app/api/cart/**`, `app/account/actions.ts`, `lib/cashea-session.ts` |
| `emails/mundotech/MundoTechShell.tsx` | `emails/transactional/EmailShell.tsx` | 49 ocurrencias del identificador |
| `…/components/MundoTechHeader.tsx` | `EmailHeader.tsx` | 4 |
| `…/components/MundoTechFooter.tsx` | `EmailFooter.tsx` | 5 |
| `components/auth/MundoTechAuthForms.tsx` | `components/auth/AuthForms.tsx` | `AuthSplitLayout.tsx`, `LoginClient.tsx`, `RegistroClient.tsx` |
| `lib/mundotech-social.ts` / `MUNDOTECH_SOCIAL` | `lib/social-links.ts` / `SOCIAL_LINKS` | 4 archivos, 8 usos |
| `.btn-mundotech-shimmer` | `.btn-brand-shimmer` | `app/globals.css:221,225` + 3 usos (`page.tsx:225`, `HomeHeroCyber.tsx:274`, `AuthForms.tsx:357`) |
| `deploy/nginx/sites-available/mundotech` | `deploy/nginx/sites-available/app` | `scripts/apply-nginx-mundotech.sh` |
| `scripts/apply-nginx-mundotech.sh` | `scripts/apply-nginx.sh` | `README.md` |
| `package.json` → `mundotech-ecommerce` | `ecommerce-platform` | `.gitleaks.toml`, `scripts/generate-sbom.sh`, `.github/dependabot.yml` |
| `MUNDOTECH_SERVICE` / `MUNDOTECH_ENV_FILE` / `MUNDOTECH_BCV_ENDPOINT` | `APP_SERVICE` / `APP_ENV_FILE` / `APP_BCV_ENDPOINT` | 4 scripts `.sh` |
| `*@mundotechtest.com` (16) | `*@example.test` | `e2e/fixtures/constants.ts` (11), `e2e/specs/rbac-permissions.spec.ts`, `scripts/e2e-reset-db.ts`, `ci.yml` |
| `mundotech_ci` / `mundotech_e2e` | `app_ci` / `app_e2e` | `.github/workflows/ci.yml` |

Todos los renames se hacen con `git mv`, con sus importadores actualizados en el mismo commit.
No queda ningún import huérfano entre commits.

---

## Clase A — Texto puro (la mayoría)

Comentarios, JSDoc, textos de UI, asuntos de correo, metadatos SEO y documentación. Se resuelven
contra `config/brand.ts` cuando son visibles al usuario, o se neutralizan cuando son documentación
interna.

Bloques principales:

- **Metadatos / SEO:** `app/layout.tsx` (14), `app/opengraph-image.tsx`, `app/sitemap.ts`,
  `app/robots.ts`, `app/icon.svg` (aria-label).
  ✅ `app/manifest.ts` ya está limpio: resuelve `settings.storeName` desde BD. Es el patrón
  correcto que ya existe en el repo y que **no** debe migrarse a `BRAND`.
- **Páginas de contenido:** `nosotros`, `devoluciones`, `ofertas`, `productos`, `privacy-policy`,
  `terms-of-service`, `shipping-policy`, `tienda-barquisimeto`, `page.tsx`, `buscar`,
  `categoria/[slug]`, `product/[slug]`, `wishlist`, `pedido`, `cart`.
- **Correos:** `lib/resend.tsx` (32 — asuntos y `BRAND_SENDER_NAME`) y las 13 plantillas.
- **UI varia:** `Footer.tsx`, `HomeHeroCyber.tsx`, `Logo.tsx`, `CategoryDrawer.tsx`, `WhatsAppFab.tsx`,
  `Promotions.tsx`, `PromoBanners.tsx`, `FlashDeals.tsx`, checkout, cuenta, admin.
- **Public:** `llms.txt` (13), `opensearch.xml` (6), `admin-manifest.json`,
  `.well-known/security.txt` (3).
- **Docs:** `README.md` (35), `docs/PERFORMANCE-AUDIT-AND-OPTIMIZATION.md` (16),
  `docs/AUDITORIA-RENDIMIENTO-PANEL-ADMIN.md` (8), `docs/ENTREGABLE-CLIENTE/**` (24 → **pendiente
  de decisión del usuario**).
- **Comentarios sueltos:** `prisma/schema.prisma:37`, `context/ProductContext.tsx:28`,
  `types/cashea-web-checkout-sdk.d.ts:6` (el comentario, no el nombre del paquete).

Los comentarios explicativos en español (PRD-101, PRD-111, PRD-248…) **se conservan íntegros**;
solo se les quita la marca.

---

## Hallazgos (se reportan, no se "arreglan" en silencio)

1. **`scripts/check-plan-consistency.mjs` está roto en origen.** Apunta a
   `PLAN-AUDITORIA-CORRECCION-MUNDOTECH.md`, que **no existe** en el repo. `npm run plan:check`
   falla con `ENOENT`, y **CI lo ejecuta** en `.github/workflows/ci.yml:60`. Fallo preexistente,
   anterior a este trabajo. Propuesta en el reporte final; no se inventa el `.md`.

2. **Referencia rota a documentación.** `e2e/specs/cashea.spec.ts:3,24` cita
   `docs/MundoTech-Cashea-Orquestacion-Cursor.md`, que **no existe**. Son solo comentarios.

3. **`npm run build` ya fallaba en la baseline**, por entorno y no por código: `prisma migrate
   deploy` exige `datasource.url`. Aislado (`npx next build`), la compilación **sí** se completa
   —genera chunks y manifiestos sin errores de módulo— y falla después, al recolectar datos de
   página, por no haber BD accesible.

4. **`mundotech-main.zip`** (3,6 MB) en la raíz: artefacto de descarga con la marca en el nombre.
   No aparecía en la auditoría previa. Excluido del control y del git local; **pendiente de decisión.**

5. **`emails/mundotech/site.ts`** contiene, además del dominio, datos de negocio reales como
   fallback: dirección física, teléfonos y handle de Instagram. El handle (`@<marca><número>`) es marca
   (se neutraliza en Fase 3); dirección y teléfonos son datos de negocio → **Fase 8, pendiente**.

6. **`app/icon.svg`** dibuja una «M» (glifo de marca) con `aria-label="MundoTech"`. El aria-label se
   neutraliza; el glifo es un activo binario-equivalente que debe reemplazar el usuario →
   `ACCIONES-MANUALES.md`.
