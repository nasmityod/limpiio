# 1. Resumen del proyecto

## MundoTech E-commerce

Plataforma de comercio electrónico a medida para **MundoTech Barquisimeto**, tienda física de tecnología, gadgets y variedades ubicada en el centro de Barquisimeto, estado Lara, Venezuela.

**Dominio de producción:** https://mundotechve.com  
**Slogan:** Conectados Contigo

---

## Objetivo del sistema

Centralizar la operación comercial de MundoTech en un canal web profesional que permita:

1. **Mostrar el catálogo** con precios en USD y bolívares (tasa BCV).
2. **Recibir pedidos** por web o redirigirlos a WhatsApp, según el modo configurado.
3. **Gestionar inventario, precios y promociones** desde un panel de administración.
4. **Procesar pagos** vía Pago Móvil, transferencia bancaria y Binance Pay.
5. **Coordinar envíos** nacionales (MRW, Zoom, Tealca) o retiro en tienda.
6. **Comunicarse con el cliente** mediante correos automáticos transaccionales.
7. **Posicionarse en buscadores** con SEO local, sitemap, datos estructurados y feed para Google Merchant.

---

## Stack tecnológico (referencia)

| Capa | Tecnología |
|------|------------|
| Frontend y backend | Next.js 16 (App Router) + React 19 |
| Base de datos | PostgreSQL |
| Autenticación | NextAuth (email/contraseña; Google opcional) |
| Almacenamiento de imágenes | Cloudflare R2 (CDN público) |
| Comprobantes de pago | Cloudflare R2 (bucket privado) |
| Correos transaccionales | Resend |
| Hosting | VPS propio detrás de Cloudflare + nginx |
| Monitoreo de errores | Sentry (opcional) |
| Analítica | Google Analytics 4 (opcional, con consentimiento) |

El cliente no necesita interactuar con estas tecnologías en el día a día; todo se administra desde el panel web.

---

## Módulos principales

### Tienda pública (front office)

- Página de inicio personalizable (categorías destacadas, ofertas, banners).
- Catálogo con búsqueda, filtros por categoría y ordenamiento.
- Ficha de producto con galería, zoom, video, especificaciones y reseñas.
- Carrito persistente (sesión y cuenta de usuario).
- Lista de deseos (wishlist).
- Checkout adaptado al modo activo (WhatsApp o completo).
- Área de cuenta del cliente: pedidos, direcciones guardadas, datos personales.
- Páginas informativas: nosotros, políticas, devoluciones, envíos.
- Landing SEO local para Barquisimeto.

### Panel de administración (back office)

- **Mostrador:** KPIs del día, pedidos recientes, alertas de stock y tasa BCV.
- **Analítica:** ventas, productos más vistos, tendencias.
- **Productos:** CRUD, importación CSV, imágenes, videos, stock, precios.
- **Categorías:** gestión con slugs SEO y categorías de Google.
- **Pedidos:** listado, detalle, cambio de estado, verificación de pagos, etiquetas de envío.
- **Cupones:** descuentos por código.
- **Reseñas:** moderación (aprobar / rechazar).
- **Contenido del sitio:** home, banners, personalización, barra de anuncios, SEO local.
- **Configuración:** datos de tienda, cuentas de pago, tasa BCV, fórmula de precios, usuarios.

### Automatizaciones en segundo plano

| Tarea | Frecuencia | Qué hace |
|-------|------------|----------|
| Actualización tasa BCV | 3 veces al día | Descarga la tasa oficial y la guarda en la tienda |
| Carrito abandonado | Cada 2 horas | Envía recordatorios a 24h y 72h |
| Solicitud de reseña | Diario 10:00 | Pide reseña 7 días después de marcar "Entregado" |
| Purga de vistas | Domingo 01:30 | Limpia estadísticas de vistas antiguas |
| Purga de datos temporales | Diario 03:00 | Borra tokens expirados y comprobantes eliminados |
| Limpieza comprobantes | Cada hora | Elimina uploads de pago pendientes expirados |
| Backup base de datos | Diario 03:00 | Respalda PostgreSQL en almacenamiento en la nube |

---

## Correos automáticos al cliente

La plataforma puede enviar los siguientes correos (requiere Resend configurado):

| Correo | Cuándo se envía |
|--------|-----------------|
| Bienvenida | Al registrarse |
| Confirmación de pedido | Al crear un pedido |
| Pago validado | Cuando el admin aprueba el comprobante |
| Pago rechazado | Cuando el admin rechaza el comprobante |
| Pedido enviado | Al marcar estado "Enviado" con datos de tracking |
| Pedido entregado | Al marcar "Entregado" |
| Pedido cancelado | Al cancelar el pedido |
| Carrito abandonado | 24h y 72h sin completar compra |
| Solicitud de reseña | 7 días después de entrega |
| Restock | Cuando un producto de la wishlist vuelve a stock |
| Recuperar contraseña | Al solicitar reset |
| Confirmar cambio de email | Al cambiar el correo de la cuenta |

---

## Seguridad (resumen para el cliente)

- Acceso al panel protegido por usuario y contraseña.
- Sistema de **permisos por rol**: cada empleado ve solo las secciones autorizadas.
- Un **superadministrador** con acceso total (solo uno por sistema).
- Comprobantes de pago almacenados en bucket privado (no accesibles públicamente).
- Rate limiting contra abuso en formularios y APIs públicas.
- Sesiones invalidadas automáticamente al cambiar contraseña.
- Backups diarios de la base de datos con retención de 30 días.

---

## Integraciones externas

| Servicio | Uso |
|----------|-----|
| **Cloudflare** | CDN, SSL, protección DDoS, almacenamiento R2 |
| **Resend** | Envío de correos desde dominio verificado |
| **API BCV** | Tasa de cambio oficial (dolarapi / pydolarve) |
| **Google** | Search Console, Maps, Merchant Feed, Analytics (opcionales) |
| **Binance Pay** | Pagos en USDT (configurable desde admin) |
| **MRW / Zoom / Tealca** | Métodos de envío con oficinas/agencias preconfiguradas |

---

## Páginas legales incluidas

- Términos de servicio (`/terms-of-service`)
- Política de privacidad (`/privacy-policy`)
- Política de envíos (`/shipping-policy`)
- Política de devoluciones (`/devoluciones`)

Estas páginas deben revisarse periódicamente para reflejar las políticas reales del negocio.
