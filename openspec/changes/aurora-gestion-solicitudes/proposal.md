# Piloto web de gestión de solicitudes para Comercial Aurora

## Why

Comercial Aurora atiende a 300 pequeñas empresas y colegios, procesa cerca de 1.200 pedidos y recibe unas 600 solicitudes al mes. La pérdida estimada del 10 % de las solicitudes y la falta de responsable en el 30 % de los casos dificultan el seguimiento y afectan la confianza de clientes que compran periódicamente.

## What Changes

- Entregar una aplicación web adaptable para cuatro agentes y un coordinador. Los cinco podrán abrir la misma URL y trabajar simultáneamente sobre las mismas solicitudes.
- Registrar manualmente llamadas, correos y mensajes. Cada solicitud tendrá un radicado único, cliente, categoría, estado inicial, responsable asignado automáticamente e historial de atención.
- Permitir consultar y filtrar la bandeja, actualizar estados y ver el plazo de 48 horas corridas. Las ediciones simultáneas de una misma solicitud tendrán control de conflictos.
- Distribuir la interfaz en un único HTML con CSS y JavaScript integrados. Un servicio compartido sincronizará los navegadores y persistirá los datos en archivos JSON. La aplicación permitirá importar clientes de prueba desde CSV o JSON, y exportar y restaurar respaldos JSON con permisos de coordinación.
- Mantener para una etapa posterior el ERP, la captura automática de mensajes y correos, las notificaciones externas, el portal de clientes y la analítica predictiva.

## Capabilities

### New Capabilities

- `radicacion-solicitudes` — Captura manual, validación de datos, generación de radicados y asignación por turnos.
- `seguimiento-solicitudes` — Bandeja, estados, historial y medición del plazo de atención.
- `operacion-compartida` — Acceso individual, sincronización, concurrencia y recuperación de datos.

### Modified Capabilities

## Impact

- **Entrega del piloto:** un enlace HTTPS para abrir y probar la aplicación, cinco cuentas internas, un directorio de clientes ficticios y una guía breve de prueba. El archivo HTML también podrá abrirse con doble clic y conectar al servicio configurado. El trabajo compartido requiere conexión.
- **Piloto de seis semanas:** semanas 1 y 2 para acceso, directorio y radicación; semanas 3 y 4 para seguimiento, plazos y sincronización; semanas 5 y 6 para pruebas con cinco sesiones, respaldo y recuperación, capacitación y medición.
- **Indicadores de negocio:** cobertura y asignación del 100 %, al menos 90 % resuelto en 48 horas, tiempo administrativo de 20 a 12 minutos por caso y sobrecostos mensuales de COP 800.000 a COP 400.000. Son metas que el piloto deberá medir. Para evaluar la cobertura se contrastará el registro con un conteo independiente de contactos recibidos.
- **Presupuesto de referencia:** hasta COP 12.000.000 de implementación inicial y COP 300.000 mensuales de operación. La selección del alojamiento y la estimación se confirman antes de desplegar.
