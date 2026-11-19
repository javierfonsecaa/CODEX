# Plan de implementación del piloto

## 1. Semanas 1 y 2. Acceso, directorio y radicación

- [ ] 1.1 Configurar el servicio Node.js, el acceso HTTPS, el volumen persistente y los respaldos versionados. Comprobar los costos de despliegue y operación frente a los topes del piloto.
- [ ] 1.2 Aprovisionar cuatro cuentas de agente y una de coordinación, con autenticación individual y permisos verificados en el servicio.
- [ ] 1.3 Implementar el almacenamiento JSON de instancia única con escrituras serializadas y recuperación comprobable tras fallos.
- [ ] 1.4 Crear el HTML adaptable con inicio de sesión, importación CSV y JSON, búsqueda de clientes y formulario de radicación.
- [ ] 1.5 Implementar validación, consecutivo mensual, turnos persistentes e idempotencia. Probar radicaciones simultáneas, cambio de mes en Colombia, reintentos y fallos de guardado sin escrituras parciales.

## 2. Semanas 3 y 4. Seguimiento y colaboración

- [ ] 2.1 Implementar la bandeja, los filtros, el detalle, la reasignación, las transiciones y el historial.
- [ ] 2.2 Implementar el vencimiento y el indicador de coordinación. Verificar estados pendientes, resolución exactamente a las 48 horas, resolución tardía y cierre posterior.
- [ ] 2.3 Implementar eventos en tiempo real, recuperación tras reconexión y control de versiones. Probar dos ediciones simultáneas y conservación del borrador rechazado.
- [ ] 2.4 Implementar exportación y restauración de respaldos JSON. Probar un respaldo válido y uno corrupto, además de la continuidad del consecutivo y la invalidación de versiones tras restaurar.

## 3. Semanas 5 y 6. Prueba de navegador e inicio del piloto

- [ ] 3.1 Publicar la URL de prueba y preparar el HTML para apertura con doble clic, con el mismo servicio HTTPS. Entregar las cinco cuentas por un canal seguro, un conjunto ficticio de 300 clientes y un guion de prueba.
- [ ] 3.2 Ejecutar el guion en cinco sesiones independientes con 300 clientes ficticios y 600 solicitudes representativas. Verificar radicación, permisos, sincronización sin recarga, conflicto de edición y reconexión. Medir carga de bandeja y búsquedas, tiempo de propagación y tiempo de radicación.
- [ ] 3.3 Reiniciar el servicio y ensayar la restauración. Revisar la conservación de radicados, responsables e historial y documentar los resultados y las incidencias.
- [ ] 3.4 Capacitar a los usuarios y acordar el reporte de indicadores, incluyendo la fuente independiente para medir cobertura y el registro de costos repetidos.
