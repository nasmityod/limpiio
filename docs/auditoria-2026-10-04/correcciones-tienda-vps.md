# Correcciones de tienda pública, dependencias y VPS

Segunda pasada del 4 de octubre de 2026. El destino indicado por el dueño es un VPS propio, sin un volumen objetivo definido todavía. Se corrigen límites e integridad en el código; la capacidad del servidor se mide por separado.

## Hallazgos de la primera auditoría

| ID | Severidad | Cambio aplicado | Verificación |
| --- | --- | --- | --- |
| WEB-01 | Medio | Cola serial de escrituras del carrito y flush antes del refresco; respuestas GET versionadas. | Regresión de refresh inmediato y PATCH lento seguida de DELETE. |
| WEB-02 | Medio | Merge/refresco vinculados a usuario y generación; copia local marcada con propietario. | Cambio A→B con respuesta A tardía, visitante sin sesión y revalidación de la misma cuenta. |
| WEB-03 | Medio | Catálogo, categoría, ofertas y SQL filtrado comparten activos con stock; `disp=all` activa consulta explícita. | Contrato de consultas y comprobación PostgreSQL en el informe final. |
| WEB-04 | Medio | Mapper común conserva `freeShipping`. | Consulta filtrada y contrato de tarjeta completo. |
| WEB-05 | Medio | Conteo independiente de la página y redirección al rango válido; orden desempata por id. | Página vacía conserva total48 en regresión. |
| WEB-06 | Medio | `geolocation=(self)` sólo en SEO Local; política general conserva denegación. | Orden de headers verificado con documentación de Next; no se solicita ubicación del dueño. |
| WEB-07 | Medio | API/SSR declaran origen, validez, fecha y estado; respaldo permanece obsoleto. | Tasa ausente, DB fallida, antigua y vigente. |
| WEB-08 | Bajo | Dirección/contacto del shell compartidos con autenticación y pestaña de envío; nosotros, políticas, 404, home y OG leen configuración. Defaults editoriales dejan de afirmar una calle fija. | Typecheck y revisión de superficies; prueba de dirección nueva. Textos editoriales ya guardados deben revisarse cuando el negocio se mude. |
| WEB-09 | Bajo | Navegación toma la coincidencia de segmento más específica. | Revisión del helper y verificación del título móvil. |
| DEP-01 | Alto | Next16.3.8, React compatible, Prisma7.10, Sharp0.35.5 y transitivas actualizadas; mínimo de guard revisado. Herramientas build/preview se declaran dev. | `security:versions` y análisis del lockfile; build y suite completa al cierre. |
| DEP-02 | Medio | NextAuth4.24.15; middleware convierte fallo de token en ausencia de autenticación. | Bearer malformado devuelve401 en regresión. |
| OPS-01 | Alto | Backup diario privado, entorno igual a systemd, cron por instancia sin reemplazar tareas ajenas. | Render Bash con otra instancia y segundo render sin duplicados. Backup real/restauración del VPS pendientes. |
| OPS-03 | Alto | Rollback común cubre arranque y fallo del swap; despliegues serializados con flock. | Scripts ejecutados en fixture con npm/systemctl/curl/mv simulados: conservan build anterior y lo arrancan. |
| OPS-04 | Medio | Health requiere `/api/health` con timeout; portada200 deja de sustituir readiness DB. | Revisión del script y fixture de recuperación. |

## Nuevos hallazgos y correcciones

| ID | Severidad | Causa/impacto | Corrección |
| --- | --- | --- | --- |
| ESC-01 | Alto | Ofertas transfiere todo el catálogo para mostrar24 tarjetas; memoria/caché crecen por producto. | COUNT y LIMIT/OFFSET en SQL; comparación `originalPrice>price`, stock positivo, desempate id. |
| ESC-02 | Medio | Historial de un cliente devuelve todos sus pedidos/partidas. |20 pedidos/página, total independiente e índice customerId/createdAt/id. |
| ESC-03 | Alto | Build precalcula todas las fichas e incluye inactivos. | Default100 activos recientes; opción0..2000; resto bajo demanda mediante ISR. |
| ESC-04 | Alto | Sitemap carga toda la BD, sin caché, y rebasa el protocolo al crecer. | `/sitemap.xml` es índice; fragmentos de10000 con caché300s e invalidación de catálogo/categorías. XML escapado e imágenes absolutas HTTP(S); DB fallida da503 para evitar publicar sitemap incompleto como éxito. |
| ESC-05 | Alto | Pools sin uso en hot reload, espera/conexiones sin presupuesto explícito y evento de cliente inactivo sin handler. | Cliente y pool compartidos por proceso; default10 conexiones,5s conexión,30s sentencia,10s locks y manejo seguro de error idle. |
| ESC-06 | Alto | Identidades nuevas crecen en memoria; Redis caído añade2s a cada petición y cuotas divergen entre procesos. | Cap20000 buckets sin expulsar activos, barrido acotado, pausa30s de reintentos y modo distribuido estricto por defecto en producción para operaciones sensibles. |
| ESC-07 | Medio | `%/_` se interpreta como comodín; precio/page parcialmente numérico y offsets extremos. | Escape literal SQL, consultas≤120caracteres, precio/número estrictos, sugerencias≤20 y tamaño de página≤100. Matching por similitud sigue siendo intencional. |
| ESC-08 | Alto | Tasa SSR rechazada por DB puede afectar el layout completo. | Fallback explícito sin excepción global; el checkout mantiene su guard monetario. |
| WEB-10 | Medio | Buscar pedido de invitado desde cuenta lleva a una ruta que exige ser propietario autenticado. | `/pedido?n=...`, que requiere también cédula; se corrige ayuda. |
| WEB-11 | Medio | Historial serializa notas internas, email del operador y llaves de comprobante al cliente aunque la UI no las muestre. | DTO de cliente aplicado antes del límite RSC; test de la página real confirma ausencia de valores internos. |
| WEB-12 | Medio | Refresco de invitado elimina productos añadidos mientras consulta el snapshot anterior. | Sólo se elimina un ID si estaba incluido en la consulta y dejó de existir; prueba independiente con respuesta tardía. |
| WEB-13 | Medio | Merge de login sobrescribe altas/cambios/bajas concurrentes; su primer fallo seguido por GET pierde la selección invitada. | Versiones de intención por producto/clear, merge como primera barrera de escrituras y retry de merge antes de aceptar GET. Ocho casos independientes incluyen debounce, clear seguido de alta y revalidación. |
| WEB-14 | Medio | Con 25 líneas en la cuenta, añadir durante el merge mostraba la nueva línea local pero el servidor seguía lleno: PATCH409 y reintentos sin avance. | El merge libera las líneas excluidas por la reconciliación antes de las altas en cola; la baja fallida se conserva para reintento. Tres regresiones comprueban igualdad UI/BD con el límite real simulado, primer DELETE503 y respuesta tardía después de cambiar cuenta. [17 regresiones de carrito aprobadas](./evidencia/cart-capacidad-final.json). |
| DEV-01 | Bajo | Chunks de desarrollo reciben caché immutable y conservan módulos antiguos tras actualizar dependencias; login queda sin hidratar. | Regla de caché sólo en producción. Navegador con origen local limpio confirmó formulario e ingreso admin funcional. |
| OPS-05 | Alto | Purga de Cloudflare pasa token en argv y puede imprimir respuesta externa sin filtrar. | Header en archivo600 temporal, sin cuerpo externo en log y timeouts5/30s. Pruebas simuladas, sin purga real. |
| OPS-06 | Medio | Retención acumula todas las llaves, borra otras instancias y trata errores por objeto como éxito. | Listado/borrado por página≤1000, prefijo **y sufijo exacto YYYYMMDD_HHMMSS.dump**, validación de Errors/token. Revisión cruzada comprobó que shop y shop_other no se mezclan; protección equivalente local. |
| OPS-07 | Alto | Dump grande excede el límite de PUT único o exige reintentar toda la transferencia. | Upload multipart streaming, dos partes en paralelo, parte mínima16MiB ajustada al tamaño, abort de partes en fallo y timeouts. Contrato del SDK verificado; transferencia real requiere credenciales/R2 real. |
| OPS-08 | Medio | Health y cron usan puerto3000 antes de cargar el entorno, pudiendo validar o invocar otra instancia. | URL calculada tras leer entorno; APP_BASE_URL/APP_BCV_ENDPOINT/PORT, con default3000. Diez pruebas Bash herméticas con curl/systemctl/npm simulados cubren puerto3001 y secretos fuera de argv/entorno. |

Los avisos por `eval()` del framework en desarrollo no se atribuyen a producción: la CSP mantiene su política sin unsafe-eval. Se conserva la comprobación de esta restricción. El warning de proporción del logo se eliminó con ancho automático explícito.

## Dependencias restantes

### Cierre del 7 de octubre: parser CSS

DEP-03 (Medio, corregido): el nuevo aviso del 5 de octubre señala complejidad cuadrática en `postcss-selector-parser<7.1.6`. El override fija la rama corregida `^7.1.6` para Tailwind/PostCSS; el lockfile instala 7.1.6. Se conserva Tailwind 3 y se comprueba compatibilidad compilando el CSS de la aplicación en el build final. Los dos avisos medios transitivos desaparecieron. [Aviso y parche del mantenedor](https://github.com/advisories/GHSA-rj75-hqrm-r3gf). La aplicación no recibe CSS no confiable para compilar en peticiones.

DEP-04 (Alto, corregido): el build de Next 16.3.8 detectó `process.cwd` en el grafo Edge de `middleware.ts`. Se migró a `proxy.ts` y export `proxy`, conforme a la guía instalada: runtime Node por defecto, sin declarar `runtime`. Se conservaron matcher, CSP, nonce, redirecciones y guardas; referencias operativas y test se actualizaron. Seis regresiones comprueban credenciales malformadas, API anónima, redirección de admin, paso a guard autoritativo, CSP pública y nonce dinámico. Build Turbopack final aprobado; no se oculta el error cambiando de bundler. [Convención oficial](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

El análisis actualizado `npm audit --omit=dev` devuelve **0 avisos**. El completo conserva **7 altos** procedentes de una sola vulnerabilidad en `braces`, propagada a herramientas de glob/watch, Tailwind y ESLint. [JSON runtime](./evidencia/npm-audit-runtime.json), [JSON completo](./evidencia/npm-audit-completo.json).

El [aviso de braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) declara que todavía no hay versión parcheada. Los patrones del build/lint son configuración local, sin entrada pública arbitraria identificada. Se redujo la exposición al mover Tailwind y CLI de preview de correos a desarrollo. El riesgo de herramienta permanece abierto: no se suprime el aviso ni se aplica downgrade/upgrade mayor incompatible sólo para obtener un cero. Mantener CI aislado, revisar lockfile y aplicar un parche oficial compatible cuando exista. Next/Sharp actualizados cubren también DEP-C01/C02, antes condicionados a plataforma/formato.

## Capacidad y operación

Cada proceso Node tiene su pool: multiplicar `DATABASE_POOL_MAX` por número de workers y reservar conexiones para administración, cron y migraciones. El presupuesto se compara con PostgreSQL `max_connections`. Revisar timeout de sentencias después de medir; subirlo sin optimizar consultas sólo prolonga saturación. [Pool node-postgres](https://node-postgres.com/apis/pool).

El sitemap admite hasta50000 fragmentos de10000 por índice (límite explícito; más requiere una jerarquía adicional). La tienda no promete escala ilimitada. La caché de Next debe coordinarse antes de varias réplicas; el VPS inicial puede servir una instancia. Cuotas sensibles usan Redis distribuido y los trabajos usan leases/claims de BD. La cola de correos distingue aceptación del proveedor de entrega al buzón.

Validar en staging del VPS: backup/restauración, reinicio de PostgreSQL, fallo Redis, disco lleno, espacio durante doble build/swap, caducidad de certificados, memoria del optimizador y crecimiento de colas. El informe final enumera las mediciones locales ejecutadas y las verificaciones que requieren el servidor real.
