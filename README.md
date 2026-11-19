# Comercial Aurora · Mesa de atención

Piloto web para radicar, asignar y seguir solicitudes con cuatro agentes y una cuenta de coordinación. Los navegadores comparten las solicitudes mediante un servicio Node.js. La interfaz está en `index.html` y los datos se guardan en JSON.

## Probar en tu navegador

Con Node.js 22 o superior, ejecuta desde el repositorio:

```sh
npm start -- --demo
```

Abre <http://localhost:3000> y selecciona **Entrar a la demostración**. El modo de prueba carga 300 clientes y 600 solicitudes ficticias la primera vez y guarda los cambios en `data/demo/`. El acceso rápido entra como coordinador. Para probar las cuatro cuentas de agente, usa los usuarios `agente1` a `agente4` y la contraseña pública de demostración `Aurora-piloto-2026`. La cuenta de coordinación se llama `coordinador`. Usa una ventana privada o un perfil diferente para cada sesión.

El modo demostración es para datos ficticios. El servicio escucha en la interfaz local por defecto. Para iniciar una prueba automatizada de las reglas y del almacenamiento ejecuta `npm test`.

## Desplegar el piloto compartido

1. Asigna un directorio persistente y privado a una única instancia de Node.js. Define `AURORA_DATA_DIR` si deseas otra ruta. El servidor conserva allí `solicitudes.json` y respaldos versionados bajo `respaldos/`.
2. Genera las cinco cuentas con `npm run cuentas`. Las contraseñas aleatorias quedan en `data/piloto/credenciales.txt` por defecto, separadas del archivo de hashes. Entrega cada contraseña por el canal privado aprobado y elimina la copia de entrega cuando ya no se necesite.
3. Ejecuta `npm start` sin el parámetro de demostración. Sirve la aplicación mediante un proxy HTTPS que conserve el encabezado `Host` y mantenga sin búfer la ruta `/api/events`. También puedes configurar HTTPS en Node.js con `AURORA_TLS_CERT` y `AURORA_TLS_KEY`; usa un certificado de confianza para los navegadores del piloto. `HOST` y `PORT` permiten ajustar la interfaz y el puerto de escucha.
4. Comparte la URL HTTPS con los usuarios del piloto. Para usar el HTML descargado, ábrelo con doble clic en un navegador que permita archivos locales. Introduce la URL principal del servicio en el formulario de conexión. Puedes distribuir el HTML con esa URL ya configurada mediante `FILE_SERVICE`. El modo compartido requiere conexión y el mismo servicio para todos los usuarios.
5. Compara el costo mensual del alojamiento, el almacenamiento y la retención de respaldos con el tope de COP 300.000. La aplicación funciona sin licencias adicionales ni paquetes de ejecución externos. La estimación y los costos de implementación se confirman con el proveedor y el equipo del piloto.

El entorno inicial de operación arranca con un directorio vacío. Cárgalo desde **Archivos** con un CSV UTF-8 con columnas `nit,razon_social` o un arreglo JSON con esos campos. Los NIT en JSON deben ser cadenas. Coordinación también puede descargar un respaldo completo y restaurarlo con confirmación.

## Guion de aceptación

1. Abre cinco sesiones y entra con los cuatro agentes y coordinación. Comprueba que todas muestran la misma bandeja.
2. Radica un caso de un cliente ficticio, selecciona el canal y la categoría, y guarda. Comprueba el consecutivo, la asignación, el estado Nuevo, el vencimiento y la aparición sin recarga en las demás sesiones.
3. Abre el mismo caso con el agente asignado y coordinación. Guarda cambios incompatibles y verifica que la segunda sesión reciba el aviso y conserve su borrador. Repite con la sesión del agente desconectada durante un cambio y luego restablece la conexión.
4. Resuelve con una respuesta, cierra el caso y comprueba el historial y el indicador de 48 horas. Un agente distinto puede consultar la solicitud, pero solo el asignado o coordinación pueden cambiarla.
5. Como coordinador, descarga un respaldo, registra otro caso y restaura el respaldo. Verifica la recuperación, registra nuevamente y comprueba que el radicado anterior no se reutiliza. Reinicia el servicio y vuelve a consultar los datos.
6. Mide la carga de bandeja y una búsqueda con el conjunto ficticio en cinco sesiones, el tiempo de propagación y el tiempo de radicación. Contrasta la cobertura con un conteo independiente de contactos recibidos y registra tiempo administrativo y costos de reproceso durante el piloto.

La URL pública, el presupuesto del despliegue y el inicio del piloto dependen de la infraestructura y de la coordinación de Comercial Aurora.

## Validación de la implementación

- En Chromium por HTTPS, con cinco sesiones, 300 clientes y 600 solicitudes ficticias, la bandeja cargó entre 346 y 426 ms desde el envío del inicio de sesión. Una búsqueda tomó 14 ms. La confirmación de una radicación tomó 80 ms y el radicado apareció en las cinco bandejas a los 135 ms. Son mediciones de una ejecución local.
- Se verificó la conservación del borrador al reconectar, los permisos de edición y la actualización del historial sin recarga. Las pruebas del servicio verificaron que dos escrituras sobre la misma versión producen una confirmación y un conflicto.
- Se verificaron el reinicio con datos persistentes, la restauración con invalidación de versiones antiguas, la continuidad del consecutivo y la recuperación tras un fallo de escritura. Un respaldo inválido dejó el estado vigente intacto.
- El navegador administrado bloqueó la navegación a archivos locales. Se comprobó la política CORS del servicio para el origen de archivo mediante HTTPS. La apertura del HTML con doble clic queda por validar en el navegador del piloto.
