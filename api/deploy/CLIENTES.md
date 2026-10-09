# Varios clientes en una instalación (planes Emprendedor y Pymes)

Un solo código, **una base de datos por cliente**. Cada cliente tiene su subdominio, su base y su carpeta; el dominio de cada pedido
decide a quién le toca. Un Corporativo dedicado no usa esto: tiene su propio servidor con una instalación común.

## Cómo queda en el servidor

```
/home/usuario/ccs/
  api/                          ← el código (se actualiza con cada versión)
  clientes/                     ← los clientes (un deploy NUNCA la toca)
    kiosco-lopez.tudominio.com/
      .env                      ← su base, su APP_KEY, su CUIT y modo de ARCA
      cliente.json              ← nombre, plan, fecha de alta
      storage/                  ← sus logs, su caché y sus copias de seguridad
      arca/                     ← su certificado y su clave privada
      cache/config.php          ← su configuración cacheada
```

La carpeta `clientes/` activa el modo multi-cliente. Sin ella todo funciona como una instalación común. Se puede ubicar en otro lado
con la variable de entorno `CCS_CLIENTES`.

## Alta de un cliente

1. **hPanel › Bases de datos:** crear una base y su usuario (vacía). Anotar nombre, usuario y contraseña.
2. **hPanel › Subdominios:** crear `kiosco-lopez.tudominio.com`, apuntando a la carpeta `public/` del sistema, y activar su SSL.
3. Por SSH, en la carpeta `api/`:

```bash
php artisan ccs:alta kiosco-lopez.tudominio.com --plan=pymes --nombre="Kiosco López" \
    --db=u123_kiosco --usuario-db=u123_kiosco   # la contraseña se pregunta
```

   La primera vez, agregar `--iniciar` (crea la carpeta `clientes/`). El comando migra, siembra, fija el plan y muestra el usuario
   `Administrador` con una **clave temporal** (se ve una sola vez; el sistema le pide al dueño cambiarla al entrar) y el **ID de instalación**.
4. Emitir la licencia con ese ID (`licencia:emitir …`) y cargarla en Sistema › Licencia del cliente.

Si algo falla, el comando borra la carpeta que recién creó: se corrige y se repite.

## Día a día

| Qué | Comando |
|---|---|
| Ver los clientes | `php artisan ccs:lista` (con `--detalle`: licencia, migraciones pendientes, última copia) |
| Estado de uno | `CCS_CLIENTE=kiosco-lopez.tudominio.com php artisan ccs:estado` |
| Copia de uno, ahora | `CCS_CLIENTE=… php artisan ccs:respaldar` |
| Cualquier comando de un cliente | `CCS_CLIENTE=… php artisan <comando>` |

Un comando que toca datos **sin** `CCS_CLIENTE` se rechaza a propósito: es la forma de no migrar la base equivocada.

## Subir una versión nueva

1. Subir el código nuevo a `api/` (la carpeta `clientes/` no se toca). Instalar dependencias si cambiaron.
2. `php artisan ccs:actualizar --canario=<un cliente tuyo o de prueba>`

Por cada cliente: mantenimiento → copia de la base → migraciones → configuración cacheada → de vuelta en línea. El canario va primero:
si falla, no se toca a nadie más. Un cliente que falla no frena a los demás; el resumen final dice cuáles y cómo retomar.
Si fallan las **migraciones**, ese cliente queda en mantenimiento a propósito (mejor un corte corto que operar con la base a medio cambiar).

## Cambiar de plan (subir o bajar)

El plan lo define la **licencia firmada**, y la clave privada que la firma vive en tu máquina (nunca en el servidor). Por eso son dos pasos:

1. En el servidor: `php artisan ccs:plan kiosco-lopez.tudominio.com pymes`
   Muestra cómo está el cliente, avisa si el plan nuevo le queda chico y te deja armado el comando `licencia:emitir`.
2. En tu máquina: ese comando de `licencia:emitir` te da la clave.
3. En el servidor: `php artisan ccs:plan kiosco-lopez.tudominio.com pymes --clave=CCS1.…`
   Verifica que la clave sea **de ese plan y de ese cliente**, la activa y anota el cambio en su ficha (`cliente.json`).

Al **bajar** de plan no se borra nada: lo que el cliente ya tiene queda, y solo se le impide crear más por encima del tope del plan
(3 sucursales y 10 usuarios en Pymes; 1 y 3 en Emprendedor). Conviene avisarle antes y que rija desde su próximo vencimiento.
Una instalación de demostración (`LICENCIA_EXIGIDA=false`) cambia de plan directo, sin clave.

**Pasar a Corporativo dedicado** es una mudanza (otro servidor), no solo un cambio de licencia: hay que llevar su base, su carpeta
`arca/` y su `.env`; el ID de instalación viaja dentro de la base, así que la licencia nueva se emite con el mismo ID.
## Copia diaria de todos

Un solo cron del hosting, una vez por día (el hosting usa UTC: 06:00 UTC son las 03:00 de Argentina):

```
0 6 * * *  cd /home/usuario/ccs/api && php artisan ccs:cron
```

Hace la copia de cada cliente de a uno (no en paralelo, por el límite de procesos PHP). Los Emprendedor no tienen copia diaria por plan.
**Las copias quedan en el mismo servidor**: falta copiarlas a otro lugar.

## Baja de un cliente

1. `php artisan ccs:suspender <dominio> --motivo="…"` — hace una última copia y corta el servicio (503). **No borra nada.**
   `ccs:reactivar <dominio>` lo devuelve.
2. Pasado el plazo acordado (mínimo 90 días por defecto):
   `php artisan ccs:eliminar <dominio> --confirmar=<dominio> --guardar-en=/ruta/de/archivo`
   borra la carpeta del cliente y deja afuera su última copia.
3. A mano en hPanel: borrar la base y el subdominio (el comando lo recuerda).

## Certificado de ARCA

Cada cliente lo tramita desde el panel (Ventas › Configuración › Facturación electrónica): se genera la clave y el pedido en el
servidor y el `.crt` que devuelve ARCA se instala desde ahí. Todo queda en la carpeta `arca/` del cliente, sin tocar el `.env`.
**Pendiente:** el CUIT, el modo homologación/producción y el punto de venta general siguen saliendo del `.env` del cliente.
