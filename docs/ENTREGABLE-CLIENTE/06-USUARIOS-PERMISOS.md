# 6. Usuarios y permisos

## Roles del sistema

| Rol | Descripción |
|-----|-------------|
| **CLIENT** | Comprador normal. Accede a `/account`, carrito, wishlist. No ve el panel admin. |
| **ADMIN** | Operador del backoffice. Accede a `/admin` según sus permisos delegados. |
| **Superadmin** | Un único usuario con acceso total e irrevocable. Gestiona usuarios y permisos. |

> No existe un rol "ADMIN" genérico con acceso a todo. Cada administrador recibe **permisos específicos** que definen qué secciones puede ver y modificar.

---

## Permisos disponibles

| Permiso | Sección | Qué permite |
|---------|---------|-------------|
| **DASHBOARD** | Mostrador | Ver KPIs y pedidos recientes |
| **ANALYTICS** | Analítica | Ver estadísticas de ventas y visitas |
| **ORDERS** | Pedidos | Ver y gestionar pedidos, estados, envíos |
| **PAYMENTS** | Pagos | Ver comprobantes, validar/rechazar pagos, aprobar Binance |
| **CATALOG** | Catálogo | Productos, categorías, imágenes, stock, precios |
| **REVIEWS** | Reseñas | Moderar reseñas de clientes |
| **PROMOTIONS** | Promociones | Cupones y descuentos |
| **SITE_CONTENT** | Contenido | Home, banners, personalización, anuncios, SEO local |
| **STORE_SETTINGS** | Config. tienda | Datos generales, contacto, estimados de envío |
| **FINANCIAL_SETTINGS** | Config. financiera | Cuentas de pago, tasa BCV, fórmula de precios |
| **OPERATIONS** | Operaciones | Health, backups, herramientas técnicas internas |
| **CUSTOMER_DATA_EXPORT** | Exportación | Descargar CSV con datos personales de clientes |

---

## Matriz de acceso recomendada

### Dueño / gerente (superadmin)

Acceso total. Gestiona usuarios y puede ver/modificar todo.

### Vendedor de mostrador

| Permiso | Motivo |
|---------|--------|
| DASHBOARD | Ver resumen del día |
| ORDERS | Procesar pedidos |
| CATALOG | Consultar stock y precios |

### Operador de almacén / envíos

| Permiso | Motivo |
|---------|--------|
| ORDERS | Ver pedidos y marcar enviados |
| CATALOG | Verificar stock |

### Community manager / marketing

| Permiso | Motivo |
|---------|--------|
| SITE_CONTENT | Gestionar home, banners, anuncios |
| PROMOTIONS | Crear cupones |
| REVIEWS | Moderar reseñas |

### Contador / finanzas

| Permiso | Motivo |
|---------|--------|
| ORDERS | Ver pedidos |
| PAYMENTS | Verificar comprobantes |
| FINANCIAL_SETTINGS | Revisar tasa y cuentas |
| CUSTOMER_DATA_EXPORT | Exportar para contabilidad |
| ANALYTICS | Ver reportes de ventas |

---

## Gestión de usuarios (`/admin/settings/users`)

> Solo accesible por el **superadministrador**.

### Crear un usuario admin

1. Ir a **Admin → Usuarios**.
2. Clic en **"Invitar usuario"** o **"Crear admin"**.
3. Ingresar email, nombre y contraseña temporal.
4. Asignar los **permisos** según la matriz anterior.
5. El usuario inicia sesión en `/login` y accede al panel.

### Modificar permisos

1. Seleccione el usuario en la lista.
2. Active/desactive permisos individuales.
3. Guarde. El cambio queda registrado en el **log de auditoría** (quién cambió qué, cuándo).

### Revocar acceso

- Quite todos los permisos del usuario, o
- Cambie su rol a CLIENT (pierde acceso al panel inmediatamente).

### Cambio de contraseña

- Cada usuario puede cambiar su contraseña en su perfil.
- Al cambiar contraseña, **todas las sesiones activas** se invalidan en máximo 5 minutos (medida de seguridad).

---

## Superadministrador

### Reglas

- Solo puede existir **un** superadmin en todo el sistema.
- Su acceso **no se puede revocar** desde la interfaz.
- Ve todas las secciones del panel sin importar los permisos asignados.
- Es el único que puede gestionar usuarios en `/admin/settings/users`.

### Cambio de superadmin

Esta operación requiere intervención del equipo técnico (cambio directo en base de datos). No se puede hacer desde el panel por seguridad.

---

## Seguridad de acceso

| Medida | Descripción |
|--------|-------------|
| Contraseñas hasheadas | Nunca se almacenan en texto plano |
| Sesiones con JWT | Expiran y se invalidan al cambiar contraseña |
| Permisos por sección | Cada página verifica permisos antes de mostrar datos |
| Auditoría | Todo cambio de permisos queda registrado |
| Página no autorizado | `/admin/unauthorized` si el usuario no tiene permiso |

---

## Preguntas frecuentes

**¿Un vendedor puede ver los datos bancarios?**  
Solo si tiene el permiso `FINANCIAL_SETTINGS`. Recomendamos no dárselo a vendedores de mostrador.

**¿Puedo tener varios superadmins?**  
No. El sistema permite exactamente uno por diseño de seguridad.

**¿Qué pasa si olvido mi contraseña de admin?**  
Use `/forgot-password` con el email registrado. Si es el superadmin y no tiene acceso al correo, contacte al equipo técnico.

**¿Los clientes pueden convertirse en admin?**  
No automáticamente. Un superadmin debe crear la cuenta y asignar permisos explícitamente.
