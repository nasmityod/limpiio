# 4. Pedidos, pagos y envíos

## Estados de un pedido

| Estado | Significado |
|--------|-------------|
| Pendiente | Esperando pago o procesamiento |
| Pendiente verificación Binance | Pago Binance por confirmar |
| En Proceso | Pago OK, preparando pedido |
| Enviado | Despachado con tracking |
| Entregado | Cliente recibió el producto |
| Cancelado | Pedido anulado |

---

## Listado (`/admin/orders`)

Filtros por estado, fecha, cliente, envío y canal. Exportación CSV con permiso dedicado.

---

## Detalle (`/admin/orders/[id]`)

Muestra cliente, productos, totales USD/Bs. (tasa congelada), notas internas, comprobante, acciones de estado, reenvío de correo e impresión de etiqueta.

---

## Verificación de pagos (modo Full)

1. Revisar imagen del comprobante (almacenamiento privado).
2. **Validar** → estado "En Proceso" + correo al cliente.
3. **Rechazar** → correo con motivo.

Binance: aprobación manual desde panel de pagos.

---

## Envío

1. **En Proceso** — preparar productos.
2. **Enviado** — ingresar empresa, guía y URL de tracking; correo automático al cliente.
3. **Entregado** — correo de entrega; a los 7 días solicitud de reseña.

---

## Etiquetas (`/admin/orders/[id]/etiqueta`)

Etiqueta imprimible con remitente, destinatario, número de pedido y código de barras. Tamaño configurable en Admin → Tienda y pagos (default 100×150 mm).

---

## Cancelación

Restaura stock, envía correo y conserva historial para auditoría.

---

## Buenas prácticas

- Responder pendientes en menos de 48 h.
- Verificar monto exacto del comprobante.
- Siempre registrar tracking al enviar.
- Usar notas internas para acuerdos por WhatsApp.
