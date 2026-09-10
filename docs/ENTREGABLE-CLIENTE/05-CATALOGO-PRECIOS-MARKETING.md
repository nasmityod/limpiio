# 5. Catálogo, precios y marketing

## Gestión de productos (`/admin/products`)

### Crear un producto

1. Clic en **"Agregar producto"**.
2. Complete los campos obligatorios:
   - **Nombre** del producto.
   - **Categoría** (debe existir previamente).
   - **Precio** en USD.
   - **Stock** (cantidad disponible).
3. Opcionales recomendados:
   - **SKU** (código interno único).
   - **Marca**.
   - **Descripción** detallada.
   - **Precio anterior** (para mostrar oferta).
   - **Especificaciones técnicas** (nombre + valor).
   - **Imágenes** (arrastrar o seleccionar; se suben a la nube).
   - **Video** de producto (procesamiento automático).

4. El **slug** (URL amigable) se genera automáticamente del nombre.

### Editar productos

- Clic en el ícono de edición en la tabla.
- Cambios de **stock** y **precio** también se pueden hacer con edición rápida inline en la tabla.

### Despublicar vs. eliminar

| Acción | Cuándo usarla |
|--------|---------------|
| **Despublicar** | Ocultar del catálogo sin borrar datos. El producto sigue en pedidos anteriores. **Recomendado.** |
| **Eliminar** | Solo si el producto nunca tuvo pedidos ni está en carritos. Si tiene historial, el sistema lo impedirá. |

### Filtros en la tabla

- Todos / Stock bajo / Agotados.
- Búsqueda por nombre o SKU.
- Filtro por categoría.

### Importación masiva (CSV)

1. Clic en **"Importar CSV"**.
2. Seleccione un archivo con columnas: nombre, categoría, precio, stock, etc.
3. El sistema crea productos nuevos o actualiza existentes por SKU/nombre.
4. Se muestra un reporte con éxitos y errores por fila.

### Exportación

Descargue el catálogo completo en CSV para respaldo o edición en Excel.

---

## Categorías (`/admin/categories`)

### Campos por categoría

| Campo | Uso |
|-------|-----|
| Nombre | Visible en la tienda |
| Slug | URL (`/categoria/nombre-slug`) |
| Imagen | Icono o foto de la categoría |
| Destacada | Aparece en la home si está marcada |
| Orden | Posición en listados |
| Descripción | Texto SEO y hero de la categoría |
| Título SEO | Override del `<title>` de la página |
| ID Google | Categoría para Google Merchant Feed |

### Buenas prácticas

- Use slugs cortos y descriptivos (`celulares`, `audifonos`, `accesorios`).
- Marque como destacadas las 4–6 categorías principales del negocio.
- Complete la descripción SEO para mejorar posicionamiento.

---

## Precios y tasa de cambio

### Cómo se calculan los precios

Los productos se venden en **USD**. El equivalente en **bolívares** se calcula automáticamente:

```
Precio en Bs. = Precio USD × Tasa BCV vigente
```

### Tasa BCV automática

- Se actualiza **3 veces al día** desde fuentes oficiales (dolarapi / pydolarve).
- Si el salto es mayor al 15%, el sistema marca la tasa para **revisión manual** antes de aplicarla.
- La fecha de la última tasa se muestra en Admin → Tienda y pagos.

### Ajuste manual de tasa

En **Admin → Tienda y pagos → Tasa de cambio**:

1. Vea la tasa actual y su fecha.
2. Ingrese la nueva tasa si necesita corregirla manualmente.
3. Guarde. Los precios en Bs. del catálogo se recalculan al instante para nuevas visitas.

> Los pedidos ya creados **no cambian** — conservan la tasa congelada al momento de la compra.

### Fórmula de precios automática

Para productos con **costo base** configurado, la tienda puede calcular el precio de venta automáticamente:

| Parámetro | Descripción |
|-----------|-------------|
| **Margen de ganancia %** | Porcentaje global aplicado sobre el costo |
| **Factor BCV–Binance** | Relación para productos importados |

**Recalcular todos los precios:** botón en configuración financiera que aplica la fórmula a todos los productos con costo definido.

Cada producto puede tener su propio margen (`profitMarginPct`) que override el global.

---

## Cupones (`/admin/coupons`)

### Crear un cupón

| Campo | Descripción |
|-------|-------------|
| Código | Texto que el cliente ingresa (ej. `VERANO2026`) |
| Tipo | Porcentaje o monto fijo |
| Valor | 10 (%) o 5.00 (USD) |
| Mínimo de compra | Opcional |
| Usos máximos | Opcional |
| Fecha inicio / fin | Vigencia del cupón |
| Activo | Interruptor on/off |

---

## Reseñas (`/admin/reviews`)

### Moderación

1. Las reseñas nuevas llegan en estado **Pendiente**.
2. Revise el contenido (rating, título, comentario).
3. **Aprobar** → visible en la ficha del producto.
4. **Rechazar** → no se muestra al público.

Solo clientes que compraron el producto pueden reseñar.

---

## Marketing y contenido del sitio

### Gestor Home (`/admin/home-manager`)

Pestañas de configuración:

| Pestaña | Qué configura |
|---------|---------------|
| Categorías | Cuáles aparecen destacadas en la home |
| Ofertas del Día | Tarjetas promocionales con imagen y enlace |
| Barra de Beneficios | Iconos de confianza (envíos, garantía, etc.) |
| Flash Deals | Ofertas con cuenta regresiva |
| Títulos de Sección | Textos de "Más vendidos", "Novedades", etc. |

### Banners (`/admin/banners`)

- Suba imágenes para el hero principal y banners secundarios.
- Configure título, subtítulo, texto del botón y enlace.
- **Punto focal** para recorte en móvil.
- Active/desactive sin eliminar.

### Personalizar sitio (`/admin/personalizar`)

- Colores y estilo del hero.
- Badges de confianza.
- Botón flotante de WhatsApp.
- Popup promocional (opcional).

### Barra de anuncios (`/admin/settings/announcement`)

Mensaje en la franja superior del sitio (ej. "Envíos a toda Venezuela" o "Abierto hoy hasta las 7pm").

### SEO Local (`/admin/settings/seo-local`)

Datos para Google y buscadores locales:

- Nombre legal del negocio.
- Dirección completa.
- Teléfono y horarios de atención.
- Coordenadas GPS.
- URLs de Google Maps.
- Slogan.

Estos datos alimentan el JSON-LD de LocalBusiness en todo el sitio.

---

## Configuración de tienda (`/admin/settings`)

### Datos generales

| Campo | Uso |
|-------|-----|
| Nombre de tienda | Aparece en header, correos y panel |
| Eslogan / tagline | Subtítulo de marca |
| Teléfonos | Contacto principal y secundario |
| Email | Correo de ventas |
| Dirección | Local físico |
| Instagram / Facebook | Enlaces en footer |
| WhatsApp de pedidos | Número para modo checkout WhatsApp |
| Tamaño etiqueta | Dimensiones de impresión |

### Datos financieros

**Pago Móvil** (todo o nada):
- Banco, teléfono, cédula/RIF.

**Transferencia** (todo o nada):
- Banco, número de cuenta, titular, RIF.

**Binance Pay:**
- ID de recepción.
- URL del QR (imagen en almacenamiento de la tienda).

### Estimados de envío

Texto orientativo por método (tienda, MRW, Zoom, Tealca) y overrides por estado de Venezuela.

---

## Feed de Google Merchant

La plataforma genera automáticamente un feed de productos en:

```
https://mundotechve.com/api/merchant-feed
```

Úselo para registrar los productos en Google Merchant Center y habilitar anuncios de Shopping.

---

## Checklist de catálogo saludable

- [ ] Todos los productos activos tienen al menos una imagen.
- [ ] Stock actualizado (especialmente tras ventas en tienda física).
- [ ] Precios revisados tras cambio de tasa BCV significativo.
- [ ] Categorías con descripción SEO completada.
- [ ] Al menos 2–3 banners activos en la home.
- [ ] Barra de beneficios actualizada con políticas reales.
- [ ] Datos bancarios verificados y completos.
