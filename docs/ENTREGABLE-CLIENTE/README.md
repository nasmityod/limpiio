# Documentación MundoTech E-commerce

**Entregable para el cliente**  
**Sitio en producción:** [https://mundotechve.com](https://mundotechve.com)  
**Versión del documento:** Julio 2026

---

## ¿Qué es este paquete?

Esta carpeta contiene la documentación completa de la plataforma de comercio electrónico desarrollada para **MundoTech Barquisimeto**. Está pensada para el equipo de la tienda: dueños, administradores y operadores que gestionan el día a día del negocio online.

No es un manual técnico de programación. Explica **qué hace la plataforma**, **cómo usarla** y **qué debe configurarse** para que la tienda funcione correctamente.

---

## Índice de documentos

| # | Documento | Para quién | Contenido |
|---|-----------|------------|-----------|
| 1 | [Resumen del proyecto](./01-RESUMEN-PROYECTO.md) | Todos | Visión general, tecnología, URLs, funcionalidades principales |
| 2 | [Tienda online (cliente final)](./02-TIENDA-ONLINE-CLIENTE-FINAL.md) | Equipo de ventas | Experiencia del comprador: catálogo, carrito, checkout, cuenta |
| 3 | [Panel de administración](./03-PANEL-ADMINISTRADOR.md) | Administradores | Acceso, menú, mostrador, secciones del backoffice |
| 4 | [Pedidos, pagos y envíos](./04-PEDIDOS-PAGOS-ENVIOS.md) | Operadores | Flujo de pedidos, estados, comprobantes, etiquetas, envíos |
| 5 | [Catálogo, precios y marketing](./05-CATALOGO-PRECIOS-MARKETING.md) | Catálogo / marketing | Productos, categorías, tasa BCV, home, banners, cupones |
| 6 | [Usuarios y permisos](./06-USUARIOS-PERMISOS.md) | Superadmin | Roles, permisos delegados, gestión de equipo |
| 7 | [Infraestructura y mantenimiento](./07-INFRAESTRUCTURA-Y-MANTENIMIENTO.md) | Referencia técnica ligera | Hosting, backups, tareas automáticas, contacto de soporte |

---

## Accesos rápidos

| Recurso | URL |
|---------|-----|
| Tienda pública | https://mundotechve.com |
| Panel de administración | https://mundotechve.com/admin |
| Inicio de sesión admin | https://mundotechve.com/login |
| Catálogo completo | https://mundotechve.com/productos |
| Ofertas | https://mundotechve.com/ofertas |
| Quiénes somos | https://mundotechve.com/nosotros |
| Tienda física (landing local) | https://mundotechve.com/tienda-barquisimeto |

---

## Checklist de puesta en marcha

Antes de anunciar la tienda al público, verifique que esté configurado lo siguiente en **Admin → Tienda y pagos**:

- [ ] Datos de contacto (teléfonos, correo, dirección)
- [ ] Cuentas de **Pago Móvil** y/o **Transferencia** (completas o todas vacías)
- [ ] **Binance Pay** (si aplica): ID de recepción y QR
- [ ] **WhatsApp de pedidos** (si el modo de compra es WhatsApp)
- [ ] **Tasa de cambio BCV** actualizada
- [ ] **Estimados de envío** por método (MRW, Zoom, Tealca, retiro en tienda)
- [ ] Al menos un producto activo con stock e imágenes
- [ ] Banners y bloques de la página de inicio
- [ ] SEO local (dirección, horarios) en **Admin → SEO Local**

---

## Modos de compra

La plataforma soporta dos modos de checkout, configurados a nivel de servidor:

| Modo | Descripción |
|------|-------------|
| **WhatsApp** | El cliente arma el pedido en una sola página y se redirige a WhatsApp. No requiere cuenta. Ideal para ventas conversacionales. |
| **Full (completo)** | Checkout en pasos con subida de comprobante. Requiere que el cliente inicie sesión. Ideal para operación 100% web con verificación de pagos en el panel. |

El modo activo en producción lo define el equipo técnico. Si necesita cambiarlo, solicítelo al proveedor de desarrollo (requiere redeploy).

---

## Soporte

Para incidencias técnicas (sitio caído, errores de pago, correos que no llegan, cambio de modo de checkout), contacte al equipo de desarrollo que entregó este proyecto.

Para operación diaria (pedidos, stock, precios, contenido), use el panel de administración descrito en los documentos 3 a 6.
