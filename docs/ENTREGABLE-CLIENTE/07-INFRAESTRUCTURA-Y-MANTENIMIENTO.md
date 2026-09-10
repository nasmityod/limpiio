# 7. Infraestructura y mantenimiento

Este documento ofrece una visión general de cómo está alojada la plataforma y qué mantenimiento se realiza automáticamente. Está pensado como referencia para el cliente; las operaciones técnicas las ejecuta el equipo de desarrollo o hosting.

---

## Arquitectura de producción

```
Usuario → Cloudflare (CDN + SSL + protección)
       → nginx (servidor web en VPS)
       → Next.js (aplicación en puerto 3000)
       → PostgreSQL (base de datos)
       → Cloudflare R2 (imágenes y comprobantes)
       → Resend (correos)
```

| Componente | Detalle |
|------------|---------|
| **Dominio** | mundotechve.com |
| **Servidor** | VPS Linux (systemd `mundotech.service`) |
| **Base de datos** | PostgreSQL remoto con connection pooling |
| **CDN / imágenes** | Cloudflare R2 con dominio personalizado |
| **Correos** | Resend con dominio verificado |
| **SSL** | Cloudflare (certificado automático) |

---

## Disponibilidad y monitoreo

### Health check público

```
GET https://mundotechve.com/api/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "db": "ok",
  "bcvStale": false,
  "backupStale": false,
  "purgeStale": false
}
```

- HTTP **200** = todo operativo.
- HTTP **503** = base de datos caída (el sitio puede mostrar error).

Este endpoint es usado por el sistema de deploy y puede configurarse en UptimeRobot u otro monitor externo.

### Panel de operaciones (admin)

Con permiso **OPERATIONS**, el admin puede ver timestamps de:
- Última actualización BCV exitosa.
- Último backup exitoso.
- Última purga de datos temporales.

---

## Tareas automáticas (crons)

Todas las tareas se ejecutan en el servidor sin intervención manual:

| Tarea | Horario (Caracas) | Descripción |
|-------|-------------------|-------------|
| Tasa BCV | 00:15, 01:15, 05:15 | Actualiza tasa de cambio |
| Carrito abandonado | Cada 2 horas | Emails de recuperación |
| Solicitud de reseña | 10:00 diario | 7 días post-entrega |
| Purga vistas | Dom 01:30 | Limpia estadísticas > 90 días |
| Purga datos temporales | 03:00 diario | Tokens, uploads eliminados |
| Limpieza comprobantes | Cada hora (:15) | Uploads de pago expirados |
| Cancelación automática pedidos | Cada 15 min (:07,:22,:37,:52) | Pendientes > 48 h (excluye Cashea) |
| Reconciliación Cashea | ⏸ Pendiente de alta en crontab | Reintenta verificación + marca EXPIRED (Fase 8; ruta lista, flag off = no-op) |
| Backup PostgreSQL | 03:00 diario | Dump a almacenamiento en nube |

### Logs de crons (referencia técnica)

- `/var/log/bcv-cron.log` — actualización de tasa.
- `/var/log/mundotech-cron.log` — demás tareas.

---

## Backups

### Automáticos

- **Frecuencia:** diario a las 03:00 (hora de Caracas).
- **Destino:** almacenamiento en nube (R2) bajo carpeta `backups/`.
- **Retención:** 30 días en la nube, 7 días en copia local del servidor.
- **Registro:** timestamp visible en el panel admin (mostrador).

### Restauración

La restauración de un backup requiere intervención del equipo técnico:

1. Detener la aplicación.
2. Restaurar el dump en PostgreSQL.
3. Reiniciar y verificar health check.

> El cliente no debe intentar restaurar backups por su cuenta.

---

## Despliegue de actualizaciones

Cuando el equipo de desarrollo entrega una nueva versión:

1. Se compila en un directorio de staging (sin detener el sitio).
2. Se hace un swap atómico (~segundos de interrupción).
3. Se verifica el health check.
4. Si falla, rollback automático a la versión anterior.
5. Purga opcional de caché de Cloudflare.

El cliente no necesita hacer nada durante un deploy normal.

---

## Almacenamiento de archivos

| Tipo | Ubicación | Acceso |
|------|-----------|--------|
| Imágenes de productos | R2 público (CDN) | Visible en la web |
| Videos de productos | R2 público (CDN) | Visible en la web |
| Comprobantes de pago | R2 privado | Solo admin con permiso PAYMENTS |
| Backups de BD | R2 (carpeta backups/) | Solo equipo técnico |
| Banners y assets | R2 público | Visible en la web |

---

## Variables de entorno críticas

Estas configuraciones viven en el servidor (`/etc/mundotech/mundotech.env`) y las gestiona el equipo técnico:

| Variable | Propósito |
|----------|-----------|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `NEXTAUTH_SECRET` | Seguridad de sesiones |
| `CHECKOUT_MODE` | `whatsapp` o `full` |
| `R2_*` | Almacenamiento de archivos |
| `RESEND_API_KEY` | Envío de correos |
| `CRON_SECRET` | Autenticación de tareas automáticas |
| `SENTRY_DSN` | Monitoreo de errores (opcional) |
| `NEXT_PUBLIC_GA4_ID` | Google Analytics (opcional) |

> El cliente **no debe modificar** estas variables. Los datos de tienda editables (bancos, contacto, tasa) se cambian desde el panel admin.

---

## Cambio de modo de checkout

Si necesita cambiar entre modo **WhatsApp** y modo **Full**:

1. Solicitar al equipo técnico (requiere cambio de variable + redeploy).
2. El técnico edita `CHECKOUT_MODE` en el servidor.
3. Ejecuta deploy completo.
4. Verifica que `/checkout` responda correctamente.

**No es posible** cambiar el modo desde el panel admin.

---

## Retención de datos

| Dato | Retención |
|------|-----------|
| Pedidos | Permanente (auditoría) |
| Comprobantes eliminados | 30 días tras marcarse DELETED |
| Tokens de reset password | 7 días tras expirar |
| Vistas de producto | 90 días |
| Carritos abandonados | Según política de emails (24h/72h) |
| Backups | 30 días |

---

## Seguridad perimetral

| Capa | Protección |
|------|------------|
| Cloudflare | DDoS, WAF, SSL, IP real |
| nginx | Proxy inverso, límite de tamaño de upload (100 MB para videos) |
| Aplicación | Rate limiting, CSRF, validación de origen, headers de seguridad |
| Base de datos | Conexión cifrada, sin acceso público directo |
| R2 privado | Comprobantes inaccesibles sin autenticación admin |

---

## CI/CD (integración continua)

Cada cambio de código pasa por verificaciones automáticas antes de llegar a producción:

1. **Lint + typecheck + tests unitarios.**
2. **Build** con migraciones de base de datos.
3. **Tests E2E** (19 escenarios con Playwright).
4. **Tests de accesibilidad** (24 escenarios Axe).
5. **Escaneo de secretos** (Gitleaks) en el historial de git.

---

## Contacto y escalamiento

### Incidencias que puede reportar el cliente

| Síntoma | Prioridad | Acción |
|---------|-----------|--------|
| Sitio no carga | Alta | Reportar al equipo técnico |
| Checkout no funciona | Alta | Verificar datos bancarios en admin; si están OK, reportar |
| Correos no llegan | Media | Verificar carpeta spam; reportar si persiste |
| Tasa BCV desactualizada | Media | Verificar alerta en mostrador; ajustar manualmente o reportar |
| Stock incorrecto | Baja | Corregir desde admin → productos |
| Imagen no carga | Baja | Re-subir imagen desde admin |

### Lo que el cliente gestiona por su cuenta

- Productos, stock, precios.
- Pedidos y estados.
- Contenido del sitio (banners, home).
- Datos de contacto y cuentas bancarias.
- Usuarios y permisos del equipo.
- Cupones y promociones.
- Moderación de reseñas.

### Lo que requiere equipo técnico

- Deploy de nuevas versiones.
- Cambio de modo de checkout.
- Restauración de backups.
- Configuración de DNS, SSL, correo.
- Creación/cambio de superadmin.
- Incidencias de servidor o base de datos.

---

## Glosario

| Término | Significado |
|---------|-------------|
| **BCV** | Banco Central de Venezuela; fuente de la tasa oficial USD/Bs. |
| **Slug** | Parte de la URL amigable (`/product/audifonos-bluetooth`) |
| **ISR** | Regeneración estática incremental; el sitio pre-genera páginas para velocidad |
| **R2** | Almacenamiento de archivos de Cloudflare |
| **RBAC** | Control de acceso basado en roles (permisos del panel) |
| **CDN** | Red de distribución de contenido; sirve imágenes rápido desde nodos cercanos |
| **Health check** | Verificación automática de que el sitio y la BD responden |
| **Deploy** | Publicación de una nueva versión del código en producción |
