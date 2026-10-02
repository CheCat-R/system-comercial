# Licencias: cómo se cobra y se activa el sistema

Cada instalación solo usa el sistema mientras tenga una **clave de activación vigente**. La clave la emitís vos
(mensual o anual) y el cliente la pega en **Sistema › Licencia**. Sin licencia, el sistema queda en **solo
lectura**: el cliente ve sus datos y baja respaldos, pero no registra ventas ni compras nuevas. Nunca se le
esconden los datos.

## Una sola vez: crear tus claves

En **tu máquina** (no en el servidor de un cliente):

```bash
cd api
php artisan licencia:generar-claves --privada="C:/Users/vos/ccs-licencias/ccs-privada.pem"
```

- La **clave privada** queda en esa ruta. Tiene que estar **fuera del proyecto** (el comando lo exige) y con
  **copia en un lugar seguro** (gestor de contraseñas o un pendrive aparte). Si la perdés, no podés emitir más
  licencias; si la filtran, cualquiera puede emitirlas. **Nunca va al repositorio ni a un servidor de cliente.**
- La **clave pública** se escribe en `config/licencia.pub`: **commitéala**. Es lo que usan las instalaciones para
  comprobar que la clave la emitiste vos.
- No la cambies después: dejaría sin validar a todos los clientes que ya tienen el sistema (el comando no la pisa
  sin `--forzar`).

> En Windows, si OpenSSL no encuentra su configuración, pasá `--openssl-cnf="C:/xampp/php/extras/openssl/openssl.cnf"`.

## Cada vez que un cliente paga

1. En el sistema del cliente, **Sistema › Licencia** muestra su **ID de instalación**. Te lo pasa (o lo ves con
   `php artisan licencia:estado` si el servidor es tuyo; `cliente:aprovisionar` también lo muestra al terminar).
2. Emitís la clave:

   ```bash
   php artisan licencia:emitir --cliente="Almacén Don Pepe" --plan=pymes \
       --instalacion=<ID> --meses=1 --privada="C:/Users/vos/ccs-licencias/ccs-privada.pem"
   ```

   - **Mensual:** `--meses=1` (o los que pagó). **Anual:** `--anual`. Fecha exacta: `--vence=2027-05-17`.
   - El vencimiento se cuenta desde hoy. **Renovar es emitir otra clave** con el mismo ID.
   - La clave sale en pantalla, en una línea (`CCS1.…`). Se la pasás por WhatsApp o mail.
3. El cliente la pega en **Sistema › Licencia › Activar**. Si el servidor es tuyo, podés activarla vos:
   `php artisan licencia:activar <clave>`.

La clave solo sirve en esa instalación y no se puede alterar: el plan y la fecha están firmados.

## Qué ve el cliente cuando se acerca el vencimiento

| Estado | Cuándo | Qué pasa |
|---|---|---|
| Activa | más de 15 días por delante | Todo normal. |
| Por vencer | 15 días o menos | Aviso al dueño (superadmin) con la fecha. |
| En gracia | venció hace 10 días o menos | Sigue funcionando, con aviso rojo a todos. |
| Vencida | pasó la gracia | **Solo lectura**: se ve todo y se bajan respaldos; no se guarda nada nuevo. |
| Sin licencia | nunca se cargó una | Solo lectura, hasta cargar la clave. |

Cargar una clave vigente lo destraba al instante. Los días de aviso y de gracia están en `config/licencia.php`.

## Una instalación de demostración

Una demo que no tiene que vencer: poné `LICENCIA_EXIGIDA=false` en su `.env` (y `php artisan config:cache`).
Así no pide licencia. No lo pongas en la instalación de un cliente.

## Lo que esto protege y lo que no

- **Protege** contra editar la base, cambiar el plan o la fecha, o usar la clave de otro cliente: la firma no
  coincide y el sistema la rechaza. También contra atrasar el reloj del servidor (se sigue contando desde la
  fecha más alta vista).
- **No puede impedir** que alguien con acceso total a su propio servidor modifique el código para saltearse la
  licencia. Si querés cerrar ese hueco, alojá vos las instalaciones; si las aloja el cliente, vale el contrato.

## Más adelante

Hoy la clave se entrega a mano. Cuando renovar todos los meses sea una carga, el siguiente paso es un panel tuyo
con la lista de clientes, donde las instalaciones consultan solas y renuevan al marcar el pago. Usaría **esta misma
licencia firmada**, así que nada de lo de arriba se tira.
