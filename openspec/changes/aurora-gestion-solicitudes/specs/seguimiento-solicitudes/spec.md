# Seguimiento de solicitudes

## Purpose

Dar visibilidad a la atención de cada solicitud y medir si quedó resuelta dentro de las 48 horas corridas.

## ADDED Requirements

### Requirement: Bandeja e historial de atención
El sistema SHALL permitir buscar por radicado, NIT o razón social y combinar filtros de estado y responsable. SHALL registrar cada radicación, cambio de estado y reasignación confirmados mediante eventos con ID, radicado, actor, fecha del servidor, acción y, cuando corresponda, estados previo y nuevo y comentarios. El sistema SHALL impedir la edición o eliminación de eventos individuales.

#### Scenario: Consulta de un caso actualizado
- **WHEN** un usuario abre una solicitud que pasó de En proceso a Pendiente logística
- **THEN** el detalle muestra el nuevo estado y el historial muestra la transición con su autor y hora

#### Scenario: Reasignación desde coordinación
- **WHEN** el coordinador reasigna una solicitud abierta a otro agente activo
- **THEN** la bandeja muestra al nuevo responsable y el historial conserva al responsable anterior y al nuevo, al actor y la hora del cambio

### Requirement: Transiciones de estado
El servicio SHALL aceptar solo las transiciones de la tabla.

| Desde | Destinos permitidos |
| --- | --- |
| Nuevo | En proceso, Pendiente logística, Pendiente ventas, Resuelto |
| En proceso | Pendiente logística, Pendiente ventas, Resuelto |
| Pendiente logística | En proceso, Pendiente ventas, Resuelto |
| Pendiente ventas | En proceso, Pendiente logística, Resuelto |
| Resuelto | Cerrado |
| Cerrado | Ninguno |

#### Scenario: Cierre sin resolución
- **WHEN** se intenta cerrar una solicitud pendiente
- **THEN** el servicio rechaza la transición y conserva el estado vigente

### Requirement: Registro de la resolución
El sistema SHALL exigir una respuesta de fondo para pasar a Resuelto y registrar en ese momento la fecha de resolución del servidor.

#### Scenario: Resolución sin respuesta
- **WHEN** se intenta pasar una solicitud abierta a Resuelto con una respuesta vacía
- **THEN** se rechaza la transición y se conservan el estado, la fecha de resolución y el historial anteriores

### Requirement: Plazo de 48 horas corridas
El sistema SHALL mostrar el vencimiento en bandeja y detalle. SHALL calcular las horas entre recepción y resolución con la hora del servidor, incluyendo estados pendientes. Una solicitud abierta queda vencida al superar 48 horas y su resultado de cumplimiento queda vacío hasta resolverse. Una resolución a las 48 horas exactas o antes cumple el plazo.

#### Scenario: Caso pendiente fuera de plazo
- **WHEN** una solicitud abierta sigue en Pendiente logística después de 48 horas corridas
- **THEN** la bandeja indica que está vencida y el caso todavía no se contabiliza entre las resoluciones del periodo

#### Scenario: Límite exacto de cumplimiento
- **WHEN** una solicitud se resuelve exactamente a las 48 horas y otra se resuelve un segundo después de su propio vencimiento
- **THEN** el sistema registra la primera dentro del plazo y la segunda fuera del plazo

#### Scenario: Cierre posterior
- **WHEN** se cierra una solicitud ya resuelta
- **THEN** el tiempo de atención y el resultado de plazo calculados al resolver se conservan

### Requirement: Indicador de cumplimiento
El sistema SHALL mostrar al coordinador el porcentaje de resoluciones a tiempo sobre el total de solicitudes con fecha de resolución en el periodo, incluyendo las ya cerradas.

#### Scenario: Periodo sin resoluciones
- **WHEN** el coordinador consulta un periodo sin solicitudes resueltas
- **THEN** el indicador muestra «Sin resoluciones» y no presenta un porcentaje
