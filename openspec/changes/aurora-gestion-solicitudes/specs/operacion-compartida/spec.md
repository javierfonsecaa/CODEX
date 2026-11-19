# Operación compartida

## Purpose

Permitir que agentes y coordinación trabajen al mismo tiempo sobre las mismas solicitudes y recuperen los datos operativos del piloto.

## ADDED Requirements

### Requirement: Acceso individual y permisos
El servicio SHALL autenticar individualmente a cuatro agentes y un coordinador y verificar permisos en cada operación. Todos pueden consultar y radicar. Los agentes editan las solicitudes asignadas a ellos; el coordinador puede editar y reasignar cualquier solicitud y administrar importaciones y respaldos.

#### Scenario: Solicitud de edición fuera del permiso
- **WHEN** un agente intenta editar una solicitud asignada a otro agente
- **THEN** el servicio deniega la mutación, incluso si la petición se envía directamente al servicio

#### Scenario: Sesión ausente o vencida
- **WHEN** un navegador intenta consultar solicitudes o recibir eventos sin una sesión vigente
- **THEN** el servicio requiere autenticación antes de devolver datos

### Requirement: Sincronización y control de conflictos
El sistema SHALL admitir cinco sesiones simultáneas, actualizar sus vistas ante escrituras confirmadas sin recarga manual y detectar ediciones con una versión obsoleta. Tras recuperar la conexión SHALL actualizar la vista con el estado vigente.

#### Scenario: Edición concurrente de un mismo caso
- **WHEN** el agente asignado y el coordinador guardan cambios sobre la misma versión
- **THEN** se confirma una edición y se informa el conflicto a la otra sesión con el estado vigente, conservando el borrador para revisión

#### Scenario: Actualización en cinco sesiones
- **WHEN** se confirma una actualización mientras están conectados los cuatro agentes y el coordinador
- **THEN** las cinco vistas autorizadas reflejan el cambio sin recarga manual, con una meta de actualización de dos segundos bajo las condiciones de prueba del piloto

#### Scenario: Pérdida y recuperación de conexión
- **WHEN** una sesión se desconecta con cambios sin guardar y otro usuario actualiza una solicitud durante la desconexión
- **THEN** la sesión desconectada indica que la vista está desactualizada y, al reconectar, obtiene el estado vigente y conserva el borrador sin reenviarlo automáticamente

### Requirement: Persistencia y recuperación de JSON
El servicio SHALL conservar las escrituras confirmadas en un archivo JSON compartido y confirmar una operación solo después de guardarla. SHALL permitir al coordinador descargar un respaldo JSON de solicitudes, clientes, historial y metadatos operativos, excluyendo credenciales y sesiones. SHALL exigir confirmación expresa antes de restaurar, guardar una copia del estado vigente y registrar quién ejecutó la restauración.

#### Scenario: Reinicio tras escrituras
- **WHEN** se reinicia el servicio después de confirmar una solicitud
- **THEN** la solicitud reaparece con su versión, responsable e historial y el próximo radicado continúa con un ID distinto

#### Scenario: Respaldo inválido
- **WHEN** el coordinador intenta restaurar un respaldo con estructura inválida o referencias inconsistentes
- **THEN** el servicio rechaza la restauración y conserva el estado vigente

#### Scenario: Fallo de escritura
- **WHEN** el servicio no logra guardar una mutación en el archivo JSON
- **THEN** informa el fallo a quien la envió y conserva la última versión confirmada en las demás sesiones

#### Scenario: Restauración de un respaldo anterior
- **WHEN** el coordinador confirma un respaldo válido anterior a una radicación ya confirmada
- **THEN** las sesiones reciben el estado restaurado, las ediciones basadas en versiones previas se rechazan y los próximos radicados no reutilizan IDs ya emitidos

### Requirement: Prueba desde navegador
El piloto SHALL ofrecer una URL HTTPS para abrir la aplicación en navegadores habilitados y distribuir el mismo frontend como un solo HTML que puede conectarse al servicio al abrirlo localmente.

#### Scenario: Primera prueba del piloto
- **WHEN** el evaluador abre la URL con una cuenta de prueba o abre el archivo HTML configurado en un navegador compatible con conexión al servicio
- **THEN** puede autenticarse, registrar un caso de un cliente ficticio y verlo en la bandeja con su radicado, responsable y plazo

#### Scenario: Bandeja y búsqueda con el volumen del piloto
- **WHEN** cinco sesiones usan el entorno de prueba con 300 clientes ficticios y 600 solicitudes representativas
- **THEN** se mide la carga de la bandeja y la respuesta de una búsqueda desde el navegador, con una meta de 1,5 segundos por operación
