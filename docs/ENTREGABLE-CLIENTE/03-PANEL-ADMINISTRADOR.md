# 3. Panel de administración

## Acceso

| Dato | Valor |
|------|-------|
| URL del panel | https://mundotechve.com/admin |
| Inicio de sesión | https://mundotechve.com/login |
| Requisito | Usuario ADMIN con permisos asignados |

---

## Estructura del menú

### Hoy en la tienda

| Sección | Ruta | Descripción |
|---------|------|-------------|
| Mostrador | `/admin` | Dashboard con KPIs |
| Analítica | `/admin/stats` | Ventas y visitas |

### Catálogo

| Sección | Ruta |
|---------|------|
| Productos | `/admin/products` |
| Categorías | `/admin/categories` |
| Reseñas | `/admin/reviews` |

### Ventas

| Sección | Ruta |
|---------|------|
| Pedidos | `/admin/orders` |
| Cupones | `/admin/coupons` |

### Tu vitrina

| Sección | Ruta |
|---------|------|
| Personalizar sitio | `/admin/personalizar` |
| Gestor Home | `/admin/home-manager` |
| Banners | `/admin/banners` |
| Barra de anuncios | `/admin/settings/announcement` |
| SEO Local | `/admin/settings/seo-local` |

### Configuración

| Sección | Ruta |
|---------|------|
| Tienda y pagos | `/admin/settings` |
| Usuarios | `/admin/settings/users` (solo superadmin) |

---

## Mostrador (dashboard)

### Indicadores (KPIs)

- Productos activos y categorías.
- Stock bajo (menos de 3 unidades) y agotados.
- Pedidos totales y por estado.
- Ingresos en USD y Bs.
- Pedidos Binance pendientes.

### Alertas automáticas

| Alerta | Significado |
|--------|-------------|
| Datos bancarios incompletos | El checkout no mostrará métodos de pago |
| Tasa BCV desactualizada | Precios en Bs. pueden estar incorrectos |
| Backup atrasado | Riesgo de pérdida de datos |

### Tablas rápidas

- Últimos pedidos (enlace al detalle).
- Productos con stock bajo (enlace a edición).

## Analítica (`/admin/stats`)

Ventas por período, productos más vistos y tendencias. Para analítica avanzada, configure Google Analytics 4.

## Navegación móvil

Barra inferior con: Mostrador, Pedidos, Catálogo, Analítica y Más.

---

## Rutina recomendada

**Matutina:** revisar alertas, pedidos pendientes, stock bajo.

**Durante el día:** procesar pedidos, moderar reseñas, actualizar stock.

**Semanal:** analítica, banners/ofertas, verificar tasa BCV.

---

## Consejos

- Despublicar productos (`isActive = false`) en lugar de eliminarlos si tienen historial.
- Completar todos los campos bancarios o dejarlos todos vacíos.
- Usar "Volver a la tienda" para previsualizar cambios.
