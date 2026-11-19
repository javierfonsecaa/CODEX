# Diseño del piloto de Comercial Aurora

## Context

El alcance acordado combina cinco usuarios simultáneos, una interfaz de un solo archivo y persistencia en JSON. El servicio es la fuente compartida de solicitudes, clientes y eventos. Los teléfonos, correos y mensajes se registran manualmente.

## Goals / Non-Goals

- **Objetivos:** validar el flujo completo de atención en navegador, mantener visibles las actualizaciones confirmadas y conservar los datos tras reiniciar el servicio.
- **Fuera del piloto:** trabajo sin conexión, integraciones externas, portal, notificaciones fuera de la aplicación, analítica predictiva y un rol independiente de administrador. Las cuentas del piloto se aprovisionan durante el despliegue.

## Decisions

1. **Entrega y acceso.** Publicar `index.html` por HTTPS con HTML5, CSS3 y JavaScript integrados, sin compilación del cliente. Un servicio Node.js expone autenticación, lectura, mutaciones y eventos. Para abrir el HTML con doble clic se configura en el propio archivo la URL HTTPS del servicio. Se comprueba ese modo en los navegadores del piloto. Las peticiones usan un token de sesión de corta duración guardado en memoria. La política CORS debe contemplar el origen de archivo local sin usar cookies ni conceder acceso anónimo. La URL alojada usa el mismo servicio.
2. **Escrituras y durabilidad.** Ejecutar una sola instancia escritora sobre un volumen persistente. Validar y serializar las mutaciones en el servidor. Guardar en la misma transacción lógica la solicitud, su versión, el turno de asignación, el contador y el evento. Escribir un JSON temporal en el mismo directorio y sustituir el archivo mediante renombrado atómico tras sincronizarlo a disco. Confirmar y difundir cambios solo después de la escritura exitosa. Mantener respaldos versionados con acceso restringido y comprobar la restauración antes del piloto.
3. **Actualización de sesiones.** Enviar eventos por un flujo SSE consumido mediante `fetch` autenticado. Tras reconectar, recuperar una instantánea de la vista autorizada. Cada edición incluye la versión que vio el usuario. Un conflicto devuelve HTTP 409 con la versión vigente y mantiene el borrador local para revisión. La creación usa una clave de idempotencia para que un reintento tras perder la respuesta recupere el mismo radicado. Una restauración invalida versiones anteriores para impedir escrituras basadas en datos desactualizados.
4. **Reglas de atención.** Formar radicados con el mes en `America/Bogota` y un consecutivo mensual. Usar hora del servidor en ISO 8601 y round-robin persistente entre los cuatro agentes activos. Si no hay agentes elegibles o se agota el consecutivo mensual, rechazar la radicación y explicar el motivo. Permitir atención en proceso o pendiente y luego resolución con respuesta; el cierre requiere una resolución previa. El vencimiento se fija a las 48 horas corridas desde la recepción y sigue contando durante estados pendientes. El cierre conserva el resultado registrado al resolver.
5. **Roles, directorio y respaldo.** Los cinco usuarios consultan la bandeja y el historial. Los agentes registran solicitudes y editan las que tienen asignadas. El coordinador puede gestionar cualquier solicitud, reasignar solicitudes abiertas, importar clientes y restaurar datos. Los NIT se tratan como texto. La importación actualiza por NIT sin eliminar clientes omitidos ni cambiar el nombre histórico de las solicitudes. Los respaldos exportables incluyen clientes, solicitudes, historial y metadatos operativos. Las credenciales y los tokens se mantienen fuera del respaldo. Antes de restaurar, validar esquema y referencias, guardar una copia del estado anterior y registrar quién ejecutó la restauración. Preservar el mayor consecutivo conocido de cada mes para evitar reutilizar radicados.

## Risks / Trade-offs

- Una instancia escritora permite coordinar cambios sobre JSON y limita la disponibilidad durante reinicios. Medir búsqueda y bandeja con 300 clientes y datos representativos del volumen mensual. La meta de respuesta es ≤1,5 segundos y se comprueba con cinco sesiones.
- Un historial de solo adición en la aplicación permite auditar acciones de usuarios. La protección frente a modificaciones directas del archivo depende de permisos de infraestructura y respaldos. Los datos del piloto serán ficticios hasta confirmar las condiciones de seguridad para datos reales.
- La demostración del modo de doble clic depende del acceso al servicio HTTPS. Si se pierde la conexión, la interfaz indica cuándo la vista está desactualizada y mantiene el borrador sin confirmar la operación.
