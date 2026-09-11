# Acciones manuales pendientes

Lo que **no** puedo hacer desde el repositorio y debes hacer tú antes de poner en marcha una
tienda derivada. Ordenado por lo que rompe antes si se olvida.

---

## 1. Variables de entorno (bloquea el arranque en producción)

Copia `.env.example` a `.env` (o `/etc/<slug>/<slug>.env` en el VPS) y rellena, como mínimo:

```bash
NEXT_PUBLIC_BRAND_NAME="Mi Tienda"
NEXT_PUBLIC_SITE_URL="https://mi-dominio.com"
```

⚠️ **Esas dos variables son obligatorias en producción.** Sin cualquiera de ellas,
`lib/env-validation.ts` lanza al arrancar el servidor. Es deliberado, y el motivo es el mismo en
ambos casos: el fallo por omisión era silencioso.

- `NEXT_PUBLIC_SITE_URL`: antes el sitio caía en silencio a un dominio ajeno; hoy caería a
  `http://localhost:3000` en canonicals, sitemap, tarjetas OG y enlaces de los correos.
- `NEXT_PUBLIC_BRAND_NAME`: sin ella nada se rompe a la vista — los asuntos salen como
  `Tienda · Recibimos tu pedido`, y el `<title>`, el JSON-LD y la imagen OG quedan genéricos. Se
  descubre cuando el primer cliente ya recibió el correo.

La validación **no** corre durante `next build` (`NEXT_PHASE=phase-production-build` la omite) y en
desarrollo solo advierte: el fallo es ruidoso donde importa, sin romper dev, tests ni el build.

Recomendadas para que los correos y el pie no salgan incompletos:

```bash
NEXT_PUBLIC_BRAND_TAGLINE="..."
NEXT_PUBLIC_CONTACT_EMAIL="ventas@mi-dominio.com"
NEXT_PUBLIC_SUPPORT_EMAIL="soporte@mi-dominio.com"
NEXT_PUBLIC_CONTACT_PHONES="0000-0000000 · 0000-0000000"
NEXT_PUBLIC_STORE_ADDRESS="Calle y número, sector, ciudad, estado"
NEXT_PUBLIC_INSTAGRAM_HANDLE="@mi_cuenta"
NEXT_PUBLIC_INSTAGRAM_URL="https://instagram.com/mi_cuenta"
NEXT_PUBLIC_FACEBOOK_URL="https://facebook.com/mi_pagina"
NEXT_PUBLIC_WHATSAPP_URL="https://wa.me/<codigo_pais><numero>"
NEXT_PUBLIC_TIKTOK_URL="https://tiktok.com/@mi_cuenta"
E2E_FORBIDDEN_HOST="mi-dominio.com"
APP_SLUG="mi-tienda"
```

Notas:

- Son variables `NEXT_PUBLIC_*`: **viajan al bundle y requieren rebuild** para propagarse.
- `NEXT_PUBLIC_WHATSAPP_URL` es la que usan el correo de bienvenida, las páginas de éxito del
  checkout y el enlace «Escríbenos por WhatsApp» de las páginas de cuenta (login, registro,
  recuperación). Vacía, ese enlace no se muestra.
- `NEXT_PUBLIC_CONTACT_PHONES` y `NEXT_PUBLIC_STORE_ADDRESS` aparecen **en el cuerpo de los
  correos** (`OrderConfirmationEmail`, `OrderCancelledEmail`, `PaymentRejectedEmail`). Si las dejas
  vacías, frases como «escríbenos por WhatsApp al …» quedan incompletas. El pie del correo sí omite
  las líneas sin dato.
- `E2E_FORBIDDEN_HOST` cambió de semántica: la guarda de host de Playwright es ahora **fail-safe**.
  - **con valor** → se usa ese host.
  - **vacía** → se deriva del hostname de `NEXT_PUBLIC_SITE_URL`.
  - **sin ninguna de las dos** → solo se admiten hosts locales (`localhost`, `127.0.0.1`,
    `0.0.0.0`, `::1`); cualquier host remoto **aborta**.

  Antes, sin este valor la comprobación quedaba inactiva. Declarar tu dominio real es además lo
  que autoriza a lanzar los E2E contra un VPS de staging (host remoto que no coincide con el
  prohibido). La guarda de puerto ocupado y el guard de BD de `scripts/e2e-reset-db.ts` siguen
  intactos: son tres capas independientes.

---

## 2. Activos binarios de marca (siguen siendo los originales)

No los he tocado: son imágenes, y sustituirlas es tu decisión de diseño.

- `public/logo-dark.png` (480×151) — usado en la cabecera de los correos
- `public/logo-light.png`
- `public/og-default.png`
- `public/icon-192.png`, `public/icon-512.png`
- `public/icon-maskable-192.png`, `public/icon-maskable-512.png`
- `app/apple-icon.png`
- `public/placeholder.png`, `public/placeholder-product.png`
- `public/email/social/*.png` (iconos de redes)
- **`app/icon.svg`** — su `aria-label` ya está neutralizado, pero el `<path>` sigue dibujando una
  «M». Sustituye el glifo.

⚠️ Al reemplazar `logo-dark.png`, si la nueva imagen tiene **otra relación de aspecto**, actualiza
`EMAIL_LOGO_NATURAL_WIDTH` / `EMAIL_LOGO_NATURAL_HEIGHT` en `emails/transactional/site.ts` (hoy
480×151) o la cabecera de los correos saldrá deformada. Sube también `EMAIL_LOGO_VERSION` para
romper la caché de Gmail y Cloudflare, y `EMAIL_SOCIAL_ICONS_VERSION` si cambias los iconos.

---

## 3. Servidor (VPS)

El código ya no fija nombres: los deriva de `APP_SLUG` (default `storefront`). El servidor sí hay
que renombrarlo a mano.

```bash
# 1. Servicio systemd (o el nombre en PM2 vía ecosystem.config.js)
sudo systemctl stop mundotech.service
sudo mv /etc/systemd/system/mundotech.service /etc/systemd/system/<slug>.service
sudo systemctl daemon-reload

# 2. Directorio de despliegue
sudo mv /var/www/mundotech /var/www/<slug>

# 3. Archivo de entorno
sudo mkdir -p /etc/<slug>
sudo mv /etc/mundotech/mundotech.env /etc/<slug>/<slug>.env

# 4. Sitio de nginx (el archivo del repo pasó a deploy/nginx/sites-available/app)
sudo rm -f /etc/nginx/sites-enabled/mundotech
APP_SLUG=<slug> bash scripts/apply-nginx.sh
sudo ln -sf /etc/nginx/sites-available/<slug> /etc/nginx/sites-enabled/<slug>
sudo nginx -t && sudo systemctl reload nginx

# 5. Crontab (edita APP_SLUG en la primera línea de deploy/crontab.vps)
sudo bash scripts/install-crontab.sh

# 6. Logs: los nuevos se escriben en /var/log/<slug>-cron.log
sudo mv /var/log/mundotech-cron.log /var/log/<slug>-cron.log      # opcional
sudo mv /var/log/mundotech-backup.log /var/log/<slug>-backup.log  # opcional
```

⚠️ **Antes de aplicar nginx**, edita `deploy/nginx/sites-available/app`: lleva el marcador
`TU_DOMINIO.com` en `server_name` y espera los certificados en
`/etc/ssl/cloudflare/storefront.{pem,key}`. nginx no expande variables ahí, así que hay que
sustituirlo a mano.

---

## 4. Cloudflare R2

- Si **reutilizas la cuenta actual**: deja en el `.env` real los nombres de bucket que ya existen
  (`mundotech-media`, `mundotech-private`). Solo cambió el ejemplo del `.env.example`.
- Si **creas buckets nuevos**: `<slug>-media` y `<slug>-private`, y actualiza `R2_BUCKET_NAME`,
  `R2_PRIVATE_BUCKET_NAME`, `R2_PUBLIC_BASE_URL` y `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`.

✅ **Las imágenes ya subidas no se rompen.** Verifiqué que las claves de objeto no llevan prefijo
de marca: `lib/r2.ts:buildKey()` genera `banners/…`, `products/…` y `assets/…`. El
`mundotech/banners` que mencionaba un comentario era inexacto.

---

## 5. Dominio y DNS

- Registrar el dominio y apuntarlo en Cloudflare.
- Emitir certificados de origen y colocarlos donde los espera nginx (punto 3).
- Verificar el dominio en **Resend** (`https://resend.com/domains`) antes de enviar correos:
  sin remitente propio, `lib/resend.tsx` omite el envío y lo registra en el log.
- Rehacer, si aplica: Google Search Console, propiedad de GA4, Meta Pixel, clave de IndexNow.

---

## 6. Archivos estáticos con `TU_DOMINIO.com`

Se sirven tal cual y **no leen variables de entorno**. Sustituye el marcador a mano:

- `public/llms.txt`
- `public/opensearch.xml`
- `public/.well-known/security.txt` (además, revisa el buzón de contacto y la fecha `Expires`)

---

## 7. Datos de la tienda desde el panel

`DEFAULT_SETTINGS` ya no trae datos de nadie. Entra en **Admin → Configuración** y rellena:

- Nombre, eslogan, teléfonos, correo, dirección, redes sociales.
- **Métodos de pago**: Pago Móvil, transferencia (banco, cuenta, titular, RIF) y Binance Pay.
  Siguen vacíos por diseño, y la validación es todo-o-nada por grupo. El checkout oculta los
  métodos sin configurar (`hasConfiguredPayments`), así que **ningún cliente verá una cuenta que no
  sea real**.

✅ **Ya no hay marcadores.** `phone`, `phone2` y `email` salen vacíos, el esquema lo admite y quien
los renderiza **omite la línea o el bloque entero** — pie, barra superior, páginas legales, ficha de
la tienda y JSON-LD. Hasta que rellenes el panel simplemente no aparecen; nunca un `0000-0000000`
ni una etiqueta huérfana. El botón y los enlaces de WhatsApp también desaparecen en vez de apuntar
a un `wa.me/58` roto.

En **Admin → Personalizar** rellena además el **teléfono del botón flotante de WhatsApp**
(`whatsapp.phone`): sale vacío por defecto y, mientras lo esté, el botón y el enlace del pie no se
muestran. La nota de la franja de marca (`brandStrip.note`) ya no trae teléfono.

Los correos transaccionales **no** leen esta capa: sus datos de contacto vienen de las variables
`NEXT_PUBLIC_CONTACT_*` (ver el punto 1).

---

## 8. Opcionales, pero conviene decidirlos

- **Documentación referenciada que no existe** (4 archivos, todos preexistentes — detalle en
  `REPORTE-DESMARCADO.md`). Hoy 16 comentarios apuntan a `docs/cashea-orquestacion.md`, que no está
  en el repo: créalo o retira las referencias.
- **`mundotech-main.zip`** se queda en la raíz del repositorio **por decisión tuya**, sin versionar,
  con la exclusión local en `.git/info/exclude`. Ten en cuenta que esa exclusión **no se comparte**:
  quien clone el repositorio y descomprima ahí volverá a tenerlo sin excluir. Es la única entrada
  que devuelve `find -iname '*mundotech*'`.
- **Fase 8** (Barquisimeto, Venezuela, Lara, teléfonos, dirección, ruta `/tienda-barquisimeto`):
  ver el desglose medido al final de `REPORTE-DESMARCADO.md`. El eslogan «Conectados Contigo» ya
  **no** está pendiente: se movió a `BRAND.tagline` / `StoreSettings.tagline` en la fase de
  consolidación.
- ✅ **Los dos teléfonos reales que quedaban hardcodeados ya no lo están** (fase de cierre, Punto 2):
  `components/auth/AuthSplitLayout.tsx` lee `NEXT_PUBLIC_WHATSAPP_URL` (punto 1) y el default de
  `whatsapp.phone` en `lib/site-content-schema.ts` sale vacío (punto 7). Con el valor vacío el enlace
  desaparece. Siguen en el repo, **por ser Fase 8**, las menciones que no llegan al cliente: los
  placeholders de los formularios del admin, dos ejemplos en JSDoc de `lib/social-links.ts`, los
  fixtures de `lib/whatsapp-order.test.ts`, la semilla E2E (`scripts/e2e-reset-db.ts`) y
  `scripts/investigate-whatsapp-emojis.mjs`.
- ✅ **`package-lock.json` ya está alineado** (`ecommerce-platform`). `npm ci` termina en exit 0.
