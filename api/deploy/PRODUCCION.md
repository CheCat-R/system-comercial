# Dejar una instalación lista para un cliente

Una instalación = un servidor (o cuenta de hosting) con **su propia base y su propio `.env`**. El plan
(Emprendedor, Pymes, Corporativo) se fija con un comando, no con otro build.

> Este documento cubre la **configuración**. El armado del servidor (nginx, PHP, base de datos) depende
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

## 3. Qué revisa `produccion:verificar`

Debug apagado, `APP_URL` con https, CORS sin `localhost`, migraciones al día, superadmin sin la contraseña
de fábrica, **plan fijado** (sin plan la instalación se comporta como Corporativo), ARCA, permisos de
escritura, configuración en caché y copias automáticas. Sale con código 1 si hay un fallo: sirve para cortar
un script de instalación. No modifica nada.

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
- Las copias automáticas viven en el mismo servidor que la base: no reemplazan a la descarga manual
  (Sistema › Respaldos), que es la copia de afuera.

## 7. Licencia

En producción **se exige licencia**: sin una clave de activación vigente el sistema queda en solo lectura. Después de
`cliente:aprovisionar` (que muestra el ID de la instalación) emitís la clave y la cargás en Sistema › Licencia o con
`php artisan licencia:activar <clave>`. Cómo se emiten y renuevan: [LICENCIAS.md](LICENCIAS.md).
`produccion:verificar` falla mientras no haya una licencia vigente.
