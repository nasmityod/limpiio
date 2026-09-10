# 2. Tienda online — Experiencia del cliente final

Esta guía describe lo que ve y puede hacer un **comprador** en https://mundotechve.com.

---

## Navegación principal

### Página de inicio (`/`)

La home está compuesta por bloques configurables desde el panel admin:

- **Hero / banners** principales con llamadas a la acción.
- **Categorías destacadas** con acceso rápido al catálogo.
- **Ofertas del día** y promociones activas.
- **Barra de beneficios** (envíos, garantía, soporte, pagos).
- **Flash deals** con cuenta regresiva (opcional).
- **Estanterías de productos:** más vendidos, novedades, recomendados.
- **Barra de anuncios** superior (mensaje configurable, ej. horario o promoción).

### Catálogo (`/productos`)

- Listado paginado de todos los productos activos.
- **Búsqueda** por nombre, marca o categoría.
- **Filtros:** categoría, marca, rango de precio, solo ofertas.
- **Ordenamiento:** relevancia, precio, novedades.
- Precios mostrados en **USD y bolívares** según la tasa BCV vigente.

### Categorías (`/categoria/[nombre]`)

Cada categoría tiene su propia página con:
- Título y descripción SEO.
- Productos filtrados por esa categoría.
- Datos estructurados para buscadores (Google).

### Ofertas (`/ofertas`)

Página dedicada a productos con precio rebajado (`precio anterior` > `precio actual`).

### Ficha de producto (`/product/[slug]`)

| Elemento | Descripción |
|----------|-------------|
| Galería de imágenes | Con zoom y deslizamiento |
| Video de producto | Si fue cargado desde admin |
| Precio | USD + equivalente en Bs. |
| Precio anterior | Tachado si hay oferta |
| Stock | Indicador de disponibilidad |
| Especificaciones técnicas | Tabla editable desde admin |
| Reseñas | Solo las aprobadas por moderación |
| Acciones | Agregar al carrito, wishlist, compartir |

El sitio recuerda los **productos recientemente vistos** para facilitar el regreso del cliente.

---

## Carrito de compras

- Icono en el header (drawer en móvil) o página `/cart`.
- Ajustar cantidades respetando stock.
- Subtotal en USD y Bs.
- Persistencia en cuenta o sesión del navegador.
- Recuperación por correo si el cliente abandonó el carrito (24h y 72h).

---

## Proceso de compra (checkout)

### Modo WhatsApp (producción actual)

1. Cliente va a `/checkout` sin necesidad de cuenta.
2. Completa datos, envío y revisa el resumen.
3. Al confirmar: se crea el pedido, descuenta stock y abre WhatsApp con mensaje prearmado.
4. Página de éxito con resumen y enlace de seguimiento.

### Modo Full (checkout completo)

1. Requiere **inicio de sesión**.
2. Tres pasos: datos → pago → revisión.
3. Cliente sube comprobante de pago.
4. Operador verifica en el panel antes de procesar.

---

## Métodos de envío

| Método | Descripción |
|--------|-------------|
| Retiro en tienda | Recoge en Barquisimeto |
| MRW | Estado y oficina/agencia |
| Zoom | Agencia Zoom |
| Tealca | Agencia Tealca |

Costos cobrados a destino; la tienda muestra estimados orientativos desde admin.

---

## Métodos de pago (modo Full)

- **Pago Móvil:** banco, teléfono y cédula/RIF.
- **Transferencia:** banco, cuenta, titular y RIF.
- **Binance Pay:** ID y QR en USDT.

Solo se muestran si están completamente configurados en admin.

---

## Cuenta de usuario

| Sección | Ruta |
|---------|------|
| Resumen | `/account` |
| Mis pedidos | `/account/orders` |
| Mis datos | `/account/details` |
| Direcciones | `/account/addresses` |
| Contraseña | `/account/password` |

Recuperación: `/forgot-password` → `/reset-password`.

---

## Lista de deseos (`/wishlist`)

- Guardar productos para comprar después.
- Notificación por correo cuando un producto agotado vuelve a tener stock.

## Cupones de descuento

En checkout (modo Full), el cliente ingresa un código. Los cupones se gestionan desde Admin → Cupones.

## Reseñas de productos

1. Solo quien compró el producto puede reseñar.
2. La reseña queda **pendiente** hasta moderación.
3. Tras "Entregado", a los 7 días se envía correo pidiendo reseña.

## Búsqueda (`/buscar`)

Barra en el header con resultados instantáneos. Tolerante a errores tipográficos.

## Páginas informativas

| Página | Contenido |
|--------|-----------|
| `/nosotros` | Historia, mapa, horarios, contacto |
| `/tienda-barquisimeto` | Landing SEO local |
| `/shipping-policy` | Política de envíos |
| `/devoluciones` | Devoluciones y garantía |
| `/terms-of-service` | Términos de servicio |
| `/privacy-policy` | Política de privacidad |

## Seguimiento de pedido

- **Con cuenta:** `/account/orders`
- **Sin cuenta (WhatsApp):** enlace en página de éxito
- **Consulta rápida:** `/pedido` (número + email)

## Experiencia móvil

Carrito como drawer, búsqueda en overlay, imágenes adaptativas y checkout de una página en modo WhatsApp.
