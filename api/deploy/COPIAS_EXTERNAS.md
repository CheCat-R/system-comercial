# Copias fuera del servidor (Google Drive)

Las copias del servidor (`storage/app/respaldos`) se pierden junto con el hosting. Esta función sube a **tu Google Drive** una copia
**cifrada** de la base de cada cliente, todos los días, y se queda con las últimas 30 de cada uno.

- Es **tuya** (la de quien opera el servicio), no una función del plan del cliente: se hace para todos, también los Emprendedor.
- El permiso que se le da a Google es `drive.file`: la aplicación **solo ve los archivos que ella misma creó**. No puede leer
  nada más de tu Drive.
- Cada copia se cifra (AES-256-GCM) **antes de salir** del servidor. En Drive no se puede leer sin la clave de cifrado.
- Una copia es una carpeta por cliente dentro de `CCS Respaldos`: `kiosco-lopez.tudominio.com/kiosco-lopez.tudominio.com-2026-10-09-0600.sql.gz.enc`.

## Preparar Google (una sola vez, ~10 minutos)

Los nombres de los menús de Google cambian de vez en cuando; lo importante es esto:

1. Entrá a <https://console.cloud.google.com> con la cuenta de Google donde querés guardar las copias y **creá un proyecto** (por ejemplo "CCS Respaldos").
2. **APIs y servicios › Biblioteca** → buscá **Google Drive API** → **Habilitar**.
3. **Pantalla de consentimiento de OAuth** (o "Google Auth Platform"):
   - Tipo de usuario: **Externo**.
   - Nombre de la aplicación: "CCS Respaldos"; tu mail como contacto.
   - Permisos (scopes): agregá `.../auth/drive.file`.
   - **Publicá la aplicación ("En producción").** Es importante: en modo "Prueba" Google **vence el permiso a los 7 días** y las copias se
     cortarían solas. `drive.file` no requiere verificación de Google.
4. **Credenciales › Crear credenciales › ID de cliente de OAuth** → tipo de aplicación: **"TV y dispositivos de entrada limitada"**.
   Google te muestra el **ID de cliente** y el **secreto**.

**Lo que me pasás (o cargás vos en el comando de abajo): el ID de cliente y el secreto de cliente.** No hace falta ninguna contraseña.

## Conectarlo (una sola vez)

```bash
php artisan ccs:copias-configurar --client-id="XXXX.apps.googleusercontent.com"   # el secreto se pregunta
```

Muestra una dirección de Google y un código: los abrís en **cualquier navegador** (no hace falta uno en el servidor), iniciás sesión y
aprobás. Después crea la carpeta `CCS Respaldos` en tu Drive y muestra la **clave de cifrado**.

> **Guardá la clave de cifrado en tu gestor de contraseñas, fuera del servidor.** Se muestra una sola vez. Sin ella las copias de Drive
> no se pueden abrir: si el servidor se pierde, esa clave es lo único que las rescata. Volver a correr `ccs:copias-configurar`
> conserva la misma clave (cambiarla dejaría ilegibles las copias que ya están en Drive).

La configuración queda en `clientes/_copias.json` (solo el dueño la lee). Probala ya:

```bash
php artisan ccs:copias-subir          # sube la copia de todos los clientes
php artisan ccs:copias-lista          # la última de cada uno
```

## Todos los días

El cron único (`ccs:cron`, ver CLIENTES.md) hace primero las copias del servidor y después sube las de afuera. Si un cliente falla, los
demás se suben igual y el comando termina en error con el nombre de cada uno que quedó sin copia. Un cliente suspendido se omite
(al suspenderlo se sube su copia final).

Una instalación común (un Corporativo dedicado) lo hace sola con el programador de Laravel (03:30 de Argentina).

## Restaurar un cliente si su servidor se perdió

1. Armá el servidor y la base **vacía** del cliente (hPanel), con su `.env`.
2. `CCS_CLIENTE=<dominio> php artisan migrate --force` — arma las tablas (la copia trae los **datos**, no las tablas).
3. Bajá la copia ya descifrada:

   ```bash
   php artisan ccs:copias-lista <dominio>                 # qué copias hay
   php artisan ccs:copias-descargar <dominio> --salida=/ruta   # la más nueva; con --archivo=<nombre> otra
   ```

4. Importá ese `.sql.gz` en la base (phpMyAdmin › Importar lo acepta tal cual, o `gunzip -c copia.sql.gz | mysql …`).
5. Llevá también la carpeta `arca/` del cliente (su certificado) si la tenías respaldada aparte: **no viaja en la copia de la base**.

Si bajaste el archivo a mano desde el sitio de Drive (`.sql.gz.enc`), se descifra en cualquier máquina que tenga este código:

```bash
php artisan ccs:copias-descifrar copia.sql.gz.enc copia.sql.gz --clave="<la clave guardada>"
```

## Qué no cubre

- El **certificado de ARCA** de cada cliente (`clientes/<dominio>/arca/`) y su `.env` no están en la copia de la base. Para recuperar a un
  cliente sin pedirle el trámite de nuevo, hacé aparte una copia de la carpeta `clientes/`.
- Si el hosting se cae **y** perdés la clave de cifrado, las copias no se recuperan. Guardala en dos lugares.
