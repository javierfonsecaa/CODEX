# Radicación de solicitudes

## Purpose

Registrar de forma uniforme los contactos de Comercial Aurora y dejar cada solicitud con un responsable desde el momento de la radicación.

## ADDED Requirements

### Requirement: Captura manual validada
El sistema SHALL permitir el registro manual de contactos de mensajería, correo electrónico y llamada telefónica. El formulario SHALL exigir canal, NIT de un cliente del directorio, categoría y descripción de al menos 10 caracteres tras recortar los espacios de los extremos. Las categorías serán consulta de stock, estado del pedido, inconformidad de envío, facturación y cobro, y devolución. La referencia del pedido es opcional.

#### Scenario: Radicación válida desde el navegador
- **WHEN** un usuario autenticado selecciona un cliente, radica una inconformidad de envío recibida por teléfono y deja vacía la referencia del pedido
- **THEN** el sistema muestra la confirmación con radicado, estado Nuevo y responsable, y conserva en la solicitud el NIT, la razón social al radicar, el canal, la categoría y la descripción

#### Scenario: Validación de campos obligatorios
- **WHEN** se envía una solicitud sin canal, con NIT ausente o desconocido, o con una categoría o descripción inválida
- **THEN** la interfaz identifica los campos por corregir y el servicio rechaza la escritura sin registrar una solicitud ni consumir un consecutivo

### Requirement: Radicado y asignación por turnos
El sistema SHALL asignar un ID inmutable `AUR-YYYYMM-XXXX`, la fecha del servidor en ISO 8601, el estado Nuevo y un agente activo por round-robin. El mes del radicado se determina en la zona `America/Bogota` y el consecutivo comienza en `0001` cada mes. La solicitud, el turno, el consecutivo y el evento de radicación SHALL persistir juntos.

#### Scenario: Dos radicaciones simultáneas
- **WHEN** dos usuarios radican solicitudes válidas simultáneamente con cuatro agentes activos
- **THEN** se guardan dos radicados distintos con responsables consecutivos en el turno y cada solicitud conserva un evento de radicación con su autor

#### Scenario: Se pierde la respuesta de una radicación
- **WHEN** el navegador reenvía la misma radicación confirmada con su clave de idempotencia
- **THEN** el servicio devuelve el radicado original y no consume otro turno ni agrega otro evento

#### Scenario: Primera radicación del mes
- **WHEN** se registra la primera solicitud después del cambio de mes en Colombia
- **THEN** el radicado usa el nuevo mes y el consecutivo `0001`, y la asignación continúa desde el turno persistido

#### Scenario: Sin agentes elegibles o sin consecutivos
- **WHEN** no hay agentes activos elegibles o se agotaron los consecutivos de cuatro dígitos del mes
- **THEN** el servicio informa el motivo y conserva el contador, el turno y el historial vigentes

### Requirement: Directorio de clientes de prueba
El sistema SHALL permitir al coordinador importar clientes desde JSON o CSV y habilitar a los cinco usuarios a buscarlos por NIT o razón social. Cada entrada requiere NIT y razón social. El sistema tratará el NIT como texto y aplicará el archivo completo en una sola operación.

#### Scenario: Importación válida
- **WHEN** el coordinador importa clientes con NIT y razón social válidos
- **THEN** el directorio queda disponible en las sesiones y la selección de un NIT completa la razón social

#### Scenario: Archivo con datos inválidos
- **WHEN** la importación contiene una fila incompleta o un NIT duplicado dentro del archivo
- **THEN** se identifican las filas afectadas y el directorio permanece sin cambios

#### Scenario: Actualización de un cliente existente
- **WHEN** un archivo válido contiene un NIT existente con otra razón social y omite un cliente del directorio
- **THEN** se actualiza por NIT, se conserva el cliente omitido y las solicitudes ya radicadas conservan la razón social registrada al crearse
