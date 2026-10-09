# Dejar una instalación lista para un cliente

Una instalación = un servidor (o cuenta de hosting) con **su propia base y su propio `.env`**. El plan
(Emprendedor, Pymes, Corporativo) se fija con un comando, no con otro build.

> Este documento cubre la **configuración de una instalación de un solo cliente** (por ejemplo, un
> Corporativo en su propio servidor). Para **varios clientes en un mismo servidor** —un código, una base
> por cliente— ver [CLIENTES.md](CLIENTES.md). El armado del servidor (nginx, PHP, base de datos) depende
> de dónde se aloje cada cliente y todavía no está escrito.

## 1. Primera vez

```bash
cd api
cp .env.production.example .env        # y completar lo marcado con <...>
composer install --no-dev --optimize-autoloader
php artisan key:generate --force
php artisan cliente:aprovisionar --plan=pymes     # migra, siembra y fija el plan
php artisan config:cache
php artisan produccion:verificar                  # tiene que terminar sin FALLOS
```

`cliente:aprovisionar` deja al dueño con la contraseña de fábrica **y obligado a elegir la suya** en el
primer ingreso (no puede usar nada del sistema antes). Si definiste `SUPERADMIN_PASSWORD` en el `.env`,
esa es la inicial y no se fuerza el cambio.

## 2. El programador de tareas (Pymes y Corporativo)

La copia diaria automática solo corre si el servidor ejecuta el programador de Laravel. Una línea de cron:

```
* * * * * cd /ruta/del/proyecto/api && php artisan schedule:run >> /dev/null 2>&1
```

Sin eso no hay copias, y el panel lo avisa a las 36 horas. En Emprendedor no hace falta.

En una instalación con varios clientes no se usa el programador: un solo cron diario corre `php artisan ccs:cron`
(ver [CLIENTES.md](CLIENTES.md)).

## 3. Qué revisa `produccion:verificar`

Debug apagado, `APP_URL` con https, CORS sin `localhost`, migraciones al día, superadmin sin la contraseña
de fábrica, **plan fijado** (sin plan la instalación se comporta como Corporativo), ARCA, permisos de
escritura, configuración en caché y copias automáticas. Sale con código 1 si hay un fallo: sirve para cortar
un script de instalación. No modifica nada.

### Si la API está detrás de un proxy (Traefik, nginx, Cloudflare)

Definí `TRUSTED_PROXIES` en el `.env` con la IP o red del proxy (`10.0.0.2,172.16.0.0/12`). Sin eso, Laravel ve la IP
del proxy en TODOS los pedidos: el freno del login cuenta "por IP" a toda la empresa junta (20 intentos fallidos de
un anónimo dejan afuera a todos) y la auditoría guarda una IP que no es de nadie. Si la API recibe a los clientes
directo, se deja vacío. Usá `*` solo si la API NO se puede alcanzar sin pasar por el proxy (si no, cualquiera puede
mandar un `X-Forwarded-For` inventado). Se verifica con `produccion:verificar`.

## 4. Si alguien se olvida la contraseña

- **Un usuario común:** un administrador se la restablece desde *Gerencia › Usuarios* (la persona elige una
  nueva al entrar).
- **El dueño (superadmin):** solo se puede desde la consola del servidor:

  ```bash
  php artisan usuario:restablecer-clave "Administrador"
  ```

  Muestra una contraseña temporal **una sola vez**, cierra las sesiones de esa persona y la obliga a elegir
  una propia al entrar. Si hubo muchos intentos fallidos, el bloqueo del login se levanta solo a los 5 minutos.

## 5. Actualizar a una versión nueva

```bash
git fetch && git checkout <tag>
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan produccion:verificar
```

## 6. Lo que NO viene en ningún respaldo

- El **certificado y la clave privada de ARCA**: guardarlos aparte. Perderlos no se restaura, se tramita otro.
- El `.env`.
- Los **tickets de acceso a ARCA** y las **sesiones abiertas** (tablas `arca_tokens` y `personal_access_tokens`): son credenciales vivas y no tienen que viajar en un archivo que se descarga y se guarda en una PC o un mail. Al restaurar, todos vuelven a entrar y el sistema pide un ticket de ARCA nuevo.
- Las copias automáticas viven en el mismo servidor que la base: no reemplazan a la descarga manual
  (Sistema › Respaldos), que es la copia que se lleva una persona. Para una copia **cifrada y automática fuera del servidor**
  (Google Drive): [COPIAS_EXTERNAS.md](COPIAS_EXTERNAS.md).

## 7. Licencia

En producción **se exige licencia**: sin una clave de activación vigente el sistema queda en solo lectura. Después de
`cliente:aprovisionar` (que muestra el ID de la instalación) emitís la clave y la cargás en Sistema › Licencia o con
`php artisan licencia:activar <clave>`. Cómo se emiten y renuevan: [LICENCIAS.md](LICENCIAS.md).
`produccion:verificar` falla mientras no haya una licencia vigente.
