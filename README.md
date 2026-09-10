# MundoTech E-commerce

Tienda online de MundoTech Barquisimeto — Next.js 16 (App Router) + Prisma 7 + PostgreSQL + NextAuth 4 + Resend + Cloudflare R2.

**Producción:** VPS propio (`mundotech.service` systemd activo; PM2 con [`ecosystem.config.js`](ecosystem.config.js) como alternativa no simultánea) en `https://mundotechve.com`. CI en GitHub Actions. `vercel.json` está vacío (`{}`); los crons ya no corren en Vercel.

> README operativo (PRD-059): cómo levantar el proyecto, migrar la base de datos y desplegar sin sorpresas.

---

## Requisitos

- Node.js 20+ (CI usa 22)
- PostgreSQL (Neon u otro; producción usa conexión remota con pooling)
- Cuentas/servicios: Resend, Cloudflare R2 (y Upstash Redis recomendado en multi-instancia)
- **Producción VPS:** systemd (`mundotech.service`), nginx ([`deploy/nginx/sites-available/mundotech`](deploy/nginx/sites-available/mundotech)), crontab ([`deploy/crontab.vps`](deploy/crontab.vps) instalado vía [`scripts/install-crontab.sh`](scripts/install-crontab.sh)) — ver [`docs/ENTREGABLE-CRON-BCV-VPS-V2.md`](docs/ENTREGABLE-CRON-BCV-VPS-V2.md)

## Arranque local

```bash
npm install            # postinstall ejecuta `prisma generate`
cp .env.example .env   # completar variables (ver sección Variables de entorno)
npx prisma migrate deploy   # aplica las migraciones versionadas
npm run dev
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build (incluye `prisma migrate deploy` + `prisma generate`) y `next start` |
| `npm run lint` | ESLint (flat config, `eslint-config-next@16`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests unitarios (Vitest, sin BD) |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:studio` | Prisma Studio |
| `npm run deploy:vps` | Deploy atómico en VPS: build staging → swap → health-check → rollback → CF purge opcional |
| `npm run db:seed:reviews` | Siembra reseñas demo (bloqueado en producción salvo `SEED_REVIEWS_FORCE=1`) |
| `npm run db:migrate:images` | Migra URLs legacy del CDN anterior a R2 (`LEGACY_IMAGE_CDN_HOST` + `--dry-run`) |
| `npm run security:versions` | Verifica que Next.js ≥16.2.6 instalado (`scripts/check-security-versions.mjs`) |
| `npm run security:api-guards` | Verifica `rejectInvalidMutationOrigin` en Route Handlers de mutación |
| `npm run security:audit:runtime` | `npm audit --omit=dev --audit-level=high` (bloqueante en CI) |
| `npm run security:audit:dev` | Auditoría no bloqueante devDependencies (genera `docs/DEV-DEPENDENCY-AUDIT.md`) |
| `npm run security:sbom` | Genera SBOM CycloneDX 1.6 en `sbom/` |
| `npm run test:r2-private` | Prueba integración R2 privado (crea/lee/borra objeto) |
| `npm run test:e2e` | `npx playwright test` — E2E con BD aislada |
| `npm run test:e2e:ui` | `npx playwright test --ui` |
| `npm run db:e2e:reset` | Reset/seed BD E2E con guard destructivo |

---

## Variables de entorno

Referencia completa con formato: `.env.example`.

```env
# CRÍTICAS (runtime — la app falla rápido sin estas)
DATABASE_URL=            # Postgres con connection pooling (Neon, etc.)
DIRECT_URL=              # Conexión directa sin PgBouncer — obligatoria para `prisma migrate deploy`
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://mundotechve.com

# Modo de compra server-side (obligatorio en producción)
# whatsapp: checkout de una página, guest permitido, redirige a WhatsApp
# full: checkout con comprobante, sesión obligatoria (fail-closed si ausente/inválido)
# Requiere rebuild/restart al cambiar. No usar NEXT_PUBLIC_CHECKOUT_MODE.
CHECKOUT_MODE=whatsapp

# MEDIA (R2 — obligatorias en runtime de producción, lib/env-validation.ts)
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=mundotech-media
R2_PUBLIC_BASE_URL=https://cdn.tu-dominio.com
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=   # mismo valor; validación de comprobantes en admin (client)

# R2 PRIVADO — bucket para comprobantes de pago (obligatorio en producción)
R2_PRIVATE_BUCKET_NAME=mundotech-private
R2_PRIVATE_ACCESS_KEY_ID=
R2_PRIVATE_SECRET_ACCESS_KEY=

# CRON (obligatoria en producción — invocación vía crontab VPS con Bearer)
CRON_SECRET=

# EMAIL (recomendadas — sin ellas no se envían correos)
RESEND_API_KEY=
RESEND_FROM_ADDRESS=noreply@mundotechve.com

# RECOMENDADAS EN PRODUCCIÓN
DEPLOYMENT_ENV=cloudflare   # VPS detrás de Cloudflare → IP real en rate limit (cf-connecting-ip)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_SITE_URL=https://mundotechve.com
NEXT_PUBLIC_CONTACT_EMAIL=ventas@mundotechve.com

# OBSERVABILIDAD (PRD-033 — opcionales; sin DSN, Sentry es no-op)
SENTRY_DSN=              # errores de servidor (instrumentation.ts)
NEXT_PUBLIC_SENTRY_DSN=  # errores de navegador (instrumentation-client.ts)
                         # ⚠ añadir dominio de ingesta Sentry a connect-src en
                         #   buildStrictCsp() y buildPublicCachedCsp() (middleware.ts)
```

### Modo de compra (`CHECKOUT_MODE`)

El servidor decide el modo; el cliente **no puede** cambiarlo desde el body ni con variables `NEXT_PUBLIC_*`. Valor ausente o inválido → `full` (fail-closed).

| Modo | `/checkout` | `POST /api/orders` | `upload-session` / `upload-proof` | Confirmación guest |
|---|---|---|---|---|
| `whatsapp` | Público (guest o autenticado) | Guest permitido | No disponibles (404) | `/checkout/success?token=` |
| `full` | Solo con sesión | 401 sin sesión | Solo autenticado | Solo `?orderId=` con sesión dueño/admin |

Cambiar `CHECKOUT_MODE` requiere **rebuild y restart** del proceso Node (afecta `middleware.ts` y el bundle del servidor).

#### Cambiar el modo en producción (VPS)

```bash
# 1. Editar el archivo de entorno (una sola línea)
sudoedit /etc/mundotech/mundotech.env
# → cambiar CHECKOUT_MODE=whatsapp  o  CHECKOUT_MODE=full

# 2. Deploy completo (valida el modo antes de compilar; aborta si es inválido)
cd /var/www/mundotech && npm run deploy:vps
```

#### Verificar el modo activo

```bash
# Estado del servicio
sudo systemctl status mundotech.service

# Health endpoint
curl -s http://127.0.0.1:3000/api/health | python3 -m json.tool

# Smoke: /checkout debe ser público (200) en whatsapp o redirigir a /login (307) en full
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/checkout
```

> Guía completa (preflight, smoke tests por modo, rollback, prohibiciones): [`docs/RUNBOOK-CHECKOUT-MODE.md`](docs/RUNBOOK-CHECKOUT-MODE.md)

---

## Base de datos y migraciones (PRD-004)

Las migraciones viven **versionadas** en `prisma/migrations/` (nunca `db push` en ramas compartidas).

| Migración | Contenido |
|---|---|
| `20260613011929_init` | Schema completo consolidado (Product, Order, Category, Review, Cart, AppConfig, etc.) — reemplaza el historial previo de migraciones `20260611*` / `20260612*` |
| `20260613120000_add_video_job` | Tabla `VideoJob` para procesamiento asíncrono de video de producto |
| `20260613130000_add_search_trgm` | Índice trigram (`pg_trgm`) para búsqueda de productos |
| `20260714010000_add_order_channel_stock_deducted` | Columnas `Order.channel` (`TEXT DEFAULT 'web'`) y `Order.stockDeducted` (`BOOLEAN DEFAULT true`), ya usadas por el código pero antes solo declaradas en `schema.prisma` (`ADD COLUMN IF NOT EXISTS`, idempotente ante BD con columnas creadas manualmente) |

### BD nueva (CI, staging, máquina local)

```bash
npx prisma migrate deploy   # aplica las 3 migraciones desde cero
```

### BD existente (ya en producción antes del squash Jun 2026)

Si la BD ya tenía el schema del baseline anterior, el squash `init` puede requerir `migrate resolve` según el historial de `_prisma_migrations`. En un VPS ya operativo con las migraciones aplicadas, `npx prisma migrate deploy` solo aplica diffs pendientes (`add_video_job`, `add_search_trgm`).

### Reglas

1. Cambios de schema **solo** con `npx prisma migrate dev --name <descripcion>`.
2. Si cambian los estados de pedido: primero `lib/definitions.ts`, luego una migración que actualice el CHECK `Order_status_valid`.
3. Tras cambios monetarios o de seguridad en User, aplicar con `migrate deploy` antes del build en prod.

### Efectos operativos relevantes

- **Borrar productos:** con historial de pedidos o presentes en carritos ya **no** se pueden hard-delete (FK RESTRICT). Flujo correcto: despublicar con `isActive=false`.
- **Enlaces de recuperación de carrito ya enviados** dejan de funcionar si rotan tokens (hasheados en BD — PRD-178).
- **Montos monetarios:** Prisma devuelve `Decimal`; la app convierte a `number` en la frontera con `lib/decimal.ts` (`d()` / `dn()`).

---

## Despliegue en VPS (producción)

1. **Servicio:** `mundotech.service` (systemd) ejecuta `npm start` → `next start` en `:3000`. Config PM2 alternativa: [`ecosystem.config.js`](ecosystem.config.js) — solo un gestor activo a la vez.
2. **Proxy:** nginx en [`deploy/nginx/sites-available/mundotech`](deploy/nginx/sites-available/mundotech) (SSL Cloudflare, `client_max_body_size 100m` para videos).
3. **Variables:** `/etc/mundotech/mundotech.env` (systemd + crontab) y `.env` en el repo deben estar sincronizados (`CRON_SECRET`, BD, R2, etc.). **Si `CRON_SECRET` falta en `mundotech.env`, el cron BCV responderá 401 silenciosamente** — diagnosticar con `sudo grep -c "^CRON_SECRET=" /etc/mundotech/mundotech.env` (debe devolver `1`).
4. **Crontab:** Instalar/actualizar con `sudo bash scripts/install-crontab.sh`. El instalador valida `CRON_SECRET` y `scripts/run-bcv-cron.sh` antes de instalar. El archivo fuente es [`deploy/crontab.vps`](deploy/crontab.vps) (TZ America/Caracas).
5. **Build seguro:** `npm run deploy:vps` (alias de `bash scripts/deploy-vps.sh`) — compila en `.next-staging` sin detener el servicio activo, luego swap atómico (stop → mv → start) de ~segundos, health-check con rollback automático, y purga opcional de caché Cloudflare vía `CF_ZONE_ID`/`CF_API_TOKEN` desde `/etc/mundotech/mundotech.env`.
6. **Migraciones:** `npx prisma migrate deploy` se ejecuta dentro de `npm run build` (el script `build` lo incluye automáticamente).

### Artefactos locales del deploy

El script [`scripts/deploy-vps.sh`](scripts/deploy-vps.sh) usa directorios `.next-staging/` y `.next-previous/` durante el swap/rollback atómico:

- `.next-staging/` — build de producción en curso (se elimina al terminar).
- `.next-previous/` — build anterior conservado para rollback automático si el nuevo build no arranca (se sobreescribe en cada deploy).

Estos directorios **nunca se versionan** (`.gitignore` los ignora con `.next-*/`). Pueden existir localmente en el VPS durante la ventana de deploy.

**NO ejecutar `git clean -fdx` en producción:** eliminaría estos directorios y rompería el mecanismo de rollback. Si se necesita limpiar el working tree, usar `git checkout .` o reset selectivo. El borrado en GitHub (ej. `git filter-repo`) no debe ejecutarse directamente contra el build activo en producción.

### Crons (VPS — no Vercel)

Los jobs se invocan con `Authorization: Bearer $CRON_SECRET` desde el crontab de root.  
El cron BCV usa el wrapper [`scripts/run-bcv-cron.sh`](scripts/run-bcv-cron.sh), que valida HTTP status y `body.ok` antes de reportar éxito.  
Horarios en **America/Caracas**.  
Fuente de verdad del crontab: [`deploy/crontab.vps`](deploy/crontab.vps) (instalar con `sudo bash scripts/install-crontab.sh`).  
Documentación operativa completa: [`docs/ENTREGABLE-CRON-BCV-VPS-V2.md`](docs/ENTREGABLE-CRON-BCV-VPS-V2.md) y [`docs/OPERATIONS-RUNBOOK.md`](docs/OPERATIONS-RUNBOOK.md).

| Endpoint / Wrapper | Schedule (Caracas) | Propósito |
|---|---|---|
| `scripts/run-bcv-cron.sh` → `/api/cron/update-bcv-rate` | Todos los días 00:15, 01:15, 05:15 | Tasa BCV desde API externa → `AppConfig` |
| `/api/cron/abandoned-cart` | Cada 2 horas | Emails carrito abandonado (24h / 72h) |
| `/api/cron/review-request` | Todos los días 10:00 | Email de reseña 7 días tras 'Entregado' |
| `/api/cron/purge-product-views` | Dom 01:30 | Purga `ProductView` > 90 días |
| `/api/cron/purge-temporary-data` | Todos los días 03:00 | Purga metadatos temporales: reset tokens, email tokens, registros `PaymentUpload` DELETED (>30d), vistas, carritos abandonados |
| `/api/cron/purge-payment-uploads` | Cada hora :15 | Limpia `PaymentUpload` PENDING/UPLOADING expirados: borra objeto en R2 privado y marca `DELETED` |

**Logs:**
- `/var/log/bcv-cron.log` — cron BCV (644, root)
- `/var/log/mundotech-cron.log` — abandoned-cart, review-request, purge-product-views, purge-temporary-data, purge-payment-uploads

`vercel.json` no define crons (`{}`). Backups del schedule legacy Vercel: `vercel.json.bak.*` en el servidor.

### Tasa BCV automática

- **Fetch:** `lib/bcv-rate.ts` (dolarapi oficial, fallback pydolarve).
- **Persistencia:** `lib/persist-exchange-rate.ts` escribe `exchange_rate_usd_bs` y `exchange_rate_bcv_date` en `AppConfig`.
- **Guardia:** salto >15 % respecto a la tasa actual → `needsReview: true` (ajuste manual en Admin → Configuración).
- **Skip:** si la fecha BCV en BD coincide con la de la API, responde `{ ok: true, sinCambios: true }`.

6. Checklist completo de lanzamiento: `docs/ANALISIS-PRODUCCION-00-INDICE.md` §11 (settings reales en Admin → Configuración: sin ellos el checkout **no muestra** datos bancarios — PRD-101).

## CI (PRD-031/032)

`.github/workflows/ci.yml` corre en cada push/PR con 4 jobs paralelos:

1. **quality:** `npm run lint` + `npm run typecheck` + `npm test` (Vitest, lógica pura sin BD) + auditorías de seguridad (`security:versions`, `security:audit:runtime`, `security:audit:dev`, `security:api-guards`).
2. **build:** Postgres 16 efímero → `prisma migrate deploy` (valida las migraciones desde cero) → `next build` + SBOM CycloneDX.
3. **e2e:** Postgres 16 efímero → migrate → seed (`e2e-reset-db.ts`) → `npx playwright test` (19 tests en 6 spec files).
4. **axe:** Postgres 16 efímero → migrate → seed → `npx playwright test --grep "Axe"` (24 tests Axe).

`.github/workflows/secrets.yml` ejecuta Gitleaks en cada push/PR contra el historial completo.

---

## ⚠ Remediación PII en historial git (PRD-003/143)

`lib/db.json` (volcado legacy con nombres, direcciones y pedidos reales) fue **eliminado del working tree** y añadido a `.gitignore`, pero **sigue en el historial de git**. Si el repo fue pusheado a un remoto, hay que reescribir el historial:

```bash
# 1. Instalar git-filter-repo (https://github.com/newren/git-filter-repo)
pip install git-filter-repo

# 2. SOLO sobre un clon fresco y con los demás trabajos mergeados/commiteados
git clone <url-del-repo> mundotech-limpio
cd mundotech-limpio

# 3. Purgar el archivo de TODO el historial (también purga los PNG de Playwright)
git filter-repo --invert-paths \
  --path lib/db.json \
  --path scripts/playwright-register-result.png \
  --path scripts/playwright-checkout-result.png \
  --path scripts/playwright-checkout-error.png

# 4. filter-repo elimina el remote por seguridad — re-añadir y forzar push
git remote add origin <url-del-repo>
git push --force --all
git push --force --tags

# 5. Cada colaborador debe re-clonar (los clones viejos conservan la PII)
#    y en GitHub: Settings → borrar caches/forks si existieran, o contactar
#    soporte para purgar objetos colgantes si el repo es privado-sensible.
```

Equivalente con BFG: `bfg --delete-files db.json` (mismo flujo de clon fresco + force push).

> Hasta ejecutar esto, trata el repo como si contuviera PII: no hacerlo público ni añadir colaboradores no necesarios.

---

## Estructura clave

| Ruta | Rol |
|---|---|
| `lib/checkout-order.ts` | Núcleo transaccional del checkout (precios BD, stock atómico, tasa congelada) |
| `lib/definitions.ts` | Tipos y estados canónicos (`OrderStatus`, `ReviewStatus`) |
| `lib/data-store.ts` | Settings de tienda (`readSettings()` — única fuente de datos bancarios) |
| `lib/r2.ts` | Cliente Cloudflare R2 (upload/delete, keys UUID) |
| `lib/bcv-rate.ts` | Fetch tasa BCV (dolarapi + fallback) |
| `lib/persist-exchange-rate.ts` | Escritura tasa + fecha BCV en `AppConfig` |
| `lib/home-cache.ts` / `lib/catalog-cache.ts` | Caché ISR home y catálogo |
| `app/api/upload-video/*` | Subida y estado de video de producto (`VideoJob`) |
| `app/ofertas/` | Página pública de ofertas |
| `scripts/migrate-legacy-images-to-r2.ts` | Migración idempotente de URLs legacy del CDN anterior → R2 |
| `scripts/deploy-vps.sh` | Deploy atómico en VPS (build en staging → swap → health-check → rollback → CF purge) |
| `scripts/backup-postgres.sh` | Backup diario PostgreSQL → R2 con retención 30 días |
| `scripts/lib/backup-r2.mjs` | Upload de dump a R2 + retención + marca `AppConfig` |
| `scripts/install-crontab.sh` | Instala/actualiza crontab de root desde `deploy/crontab.vps` |
| `scripts/verify-private-r2.mjs` | Prueba de integración R2 privado (crea/lee/borra) |
| `scripts/e2e-reset-db.ts` | Reset/seed de BD E2E con guard destructivo |
| `scripts/check-security-versions.mjs` | Verifica versiones mínimas de seguridad |
| `scripts/check-api-origin-guards.mjs` | Verifica `rejectInvalidMutationOrigin` en handlers |
| `scripts/audit-dev-dependencies.sh` | Auditoría no bloqueante de devDependencies |
| `scripts/generate-sbom.sh` | Genera SBOM CycloneDX 1.6 |
| `scripts/pentest-probe.mjs` | Probes locales de pentest contra localhost |
| `scripts/generate-placeholder.mjs` | Genera `public/placeholder-product.png` (PNG sin dep.) |
| `scripts/normalize-admin-role.ts` | Normaliza one-shot: minúsculas → `ADMIN`/`CLIENT` |
| `deploy/crontab.vps` | Fuente de verdad del crontab de producción |
| `deploy/nginx/sites-available/mundotech` | Configuración de nginx (SSL Cloudflare, 100m video) |
| `lib/abandoned-cart.ts` | Carrito abandonado (tokens de recuperación **hasheados**) |
| `prisma/schema.prisma` | Schema (dueño: segmento 03 — ver docs/ANALISIS-PRODUCCION-00-INDICE.md) |
| `app/api/cron/*` | Crons autenticados con `CRON_SECRET` |
| `instrumentation.ts` / `instrumentation-client.ts` | Sentry server/cliente (opt-in por DSN) |
| `docs/ENTREGABLE-CRON-BCV-VPS-V2.md` | Runbook crons + tasa BCV en VPS |
| `docs/ANALISIS-PRODUCCION-*.md` | Auditoría de producción segmentada (PRD-001–290) |

---

### Backup y restore de base de datos

El script [`scripts/backup-postgres.sh`](scripts/backup-postgres.sh) realiza backup diario:

1. `pg_dump -F c` usando `DIRECT_URL` (conexión directa, no pooler).
2. Sube el dump a R2 (`scripts/lib/backup-r2.mjs`) bajo `backups/` con retención de 30 días.
3. Conserva copia local en `/home/deploy/backups/` (últimos 7 días).
4. Registra `backup_last_success_at` en `AppConfig` (visible en admin → health).

**Restore manual (runbook):**

```bash
# 1. Descargar dump desde R2 (dashboard o presigned URL)
# 2. Detener la app
sudo systemctl stop mundotech
# 3. Restaurar (usa DIRECT_URL, no pooler)
pg_restore --clean --if-exists -d "$DIRECT_URL" mundotech_YYYYMMDD_HHMMSS.dump
# 4. Re-iniciar y verificar health
sudo systemctl start mundotech
curl -s http://127.0.0.1:3000/api/health
```

Cron sugerido: `0 3 * * *` (Caracas) — instalado automáticamente por [`deploy/crontab.vps`](deploy/crontab.vps).

|---

## Health check

**Público:** `GET /api/health` — retorna `{ status, db, bcvStale, backupStale, purgeStale }`.  
Cache-Control: `no-store`. Timeout DB: 2s. HTTP 503 solo si DB caída.  
Usado por: deploy health-check, UptimeRobot.

**Privado:** `GET /api/admin/operations-health` — requiere sesión ADMIN.  
Retorna timestamps `lastSuccessAt` de BCV, backup y purge con staleness.  
Nunca expone credenciales, paths ni PII.

Detalle completo: [`docs/MONITOREO-HEALTH.md`](docs/MONITOREO-HEALTH.md).

|---

### Pruebas

| Comando | Descripción |
|---|---|
| `npm test` | Tests unitarios (Vitest, lógica pura sin BD). `vitest.config.ts` inyecta dummies de entorno. |
| `npm run test:e2e` | Playwright E2E con BD Postgres aislada (nombre debe contener `_e2e`). Guard de seguridad: aborta si baseURL contiene `mundotechve.com`. |
| `npm run test:e2e:ui` | Playwright UI mode interactivo. |
| `npm run test:r2-private` | Prueba de integración contra R2 privado real: crea objeto → head → signed GET → delete → head 404. Requiere credenciales reales de R2 privado. |
| `npm run security:api-guards` | Verifica que todos los Route Handlers de mutación (POST/PUT/PATCH/DELETE) tengan `rejectInvalidMutationOrigin`. |
| `npm run security:versions` | Verifica que Next.js instalado cumpla ≥16.2.6. |
| `npx playwright test --grep "Axe"` | Escaneo Axe de accesibilidad (24 tests en CI job `axe`). |

### Auditorías de producción (snapshot histórico)

Las siguientes auditorías corresponden al estado del proyecto el **11 de julio de 2026** y **no se actualizan activamente**. Sirven como referencia histórica y checklist de remediación:

| Documento | Alcance |
|---|---|
| `docs/ANALISIS-PRODUCCION-00-INDICE.md` | Índice de auditoría segmentada (PRD-001–290) |
| `docs/ANALISIS-PRODUCCION-01-SEGURIDAD.md` | Seguridad de la aplicación |
| `docs/ANALISIS-PRODUCCION-02-CHECKOUT-FINANZAS.md` | Checkout y finanzas |
| `docs/ANALISIS-PRODUCCION-03-INFRA-DATOS-CACHE.md` | Infraestructura, datos y caché |
| `docs/ANALISIS-PRODUCCION-04-UX-CLIENTE.md` | UX de cliente |
| `docs/ANALISIS-PRODUCCION-05-ADMIN-OPERACIONES.md` | Admin y operaciones |
| `docs/ANALISIS-PRODUCCION-06-EMAILS-NOTIFICACIONES.md` | Emails y notificaciones |
| `docs/AUDITORIA-EXHAUSTIVA-2026-07.md` | Auditoría exhaustiva INF-01 a INF-08 |
| `docs/MEJORAS-PENDIENTES.md` | Mejoras identificadas no priorizadas |

