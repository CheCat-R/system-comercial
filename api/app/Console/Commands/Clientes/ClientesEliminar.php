<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * BORRAR DE VERDAD la carpeta de un cliente (su `.env`, sus copias, su certificado). Es lo único irreversible de todo el circuito, así
 * que tiene muchas trabas:
 *   · tiene que estar SUSPENDIDO hace al menos `--dias` (por defecto 90): el historial es del cliente y puede pedirlo;
 *   · hay que repetir su dominio en `--confirmar=` y decir dónde se guarda la última copia (`--guardar-en=`) o aceptar perderla (`--sin-copia`).
 *
 * La BASE DE DATOS no se toca: se borra a mano en hPanel (este comando no tiene permiso ni debe tenerlo), y el subdominio también.
 */
class ClientesEliminar extends Command
{
    protected $signature = 'ccs:eliminar {dominio}
        {--confirmar= : repetir el dominio para confirmar}
        {--dias=90 : días mínimos de suspensión}
        {--guardar-en= : carpeta donde dejar la última copia de la base antes de borrar}
        {--sin-copia : borrar sin guardar ninguna copia}';

    protected $description = 'Borra la carpeta de un cliente suspendido hace tiempo (la base y el subdominio se borran a mano en hPanel)';

    public function handle(): int
    {
        $n = SelectorDeCliente::normalizar($this->argument('dominio'));
        if ($n === null || ! Registro::existe($n)) {
            $this->error('No existe el cliente "'.$this->argument('dominio').'".');

            return self::FAILURE;
        }
        $susp = Registro::suspension($n);
        if (! $susp) {
            $this->error($n.' no está suspendido. Primero: php artisan ccs:suspender '.$n);

            return self::FAILURE;
        }
        $dias = max(0, (int) $this->option('dias'));
        $pasados = (int) floor(Carbon::parse($susp['desde'])->diffInDays(now(), true));
        if ($pasados < $dias) {
            $this->error($n.' lleva '.$pasados.' días suspendido y el mínimo es '.$dias.'. Se puede borrar a partir del '.Carbon::parse($susp['desde'])->addDays($dias)->format('d/m/Y').'.');

            return self::FAILURE;
        }
        if ($this->option('confirmar') !== $n) {
            $this->error('Para confirmar, repetí el dominio: --confirmar='.$n);

            return self::FAILURE;
        }

        $copia = null;
        $guardar = (string) $this->option('guardar-en');
        if ($guardar === '' && ! $this->option('sin-copia')) {
            $this->error('Indicá dónde guardar la última copia de la base con --guardar-en=<carpeta>, o --sin-copia si no hace falta.');

            return self::FAILURE;
        }
        if ($guardar !== '') {
            $copias = glob(Registro::carpeta($n).'/storage/app/respaldos/respaldo-auto-*.sql.gz') ?: [];
            rsort($copias);
            if (! $copias) {
                $this->error('El cliente no tiene ninguna copia para guardar. Hacela con CCS_CLIENTE='.$n.' php artisan ccs:respaldar, o usá --sin-copia.');

                return self::FAILURE;
            }
            if (! is_dir($guardar) && ! @mkdir($guardar, 0750, true)) {
                $this->error('No se pudo crear '.$guardar.'.');

                return self::FAILURE;
            }
            $copia = rtrim($guardar, '/\\').DIRECTORY_SEPARATOR.$n.'-'.basename($copias[0]);
            if (! copy($copias[0], $copia)) {
                $this->error('No se pudo copiar la última copia a '.$copia.'. No se borró nada.');

                return self::FAILURE;
            }
        }

        $base = Registro::entorno($n)['DB_DATABASE'] ?? '(desconocida)';
        Registro::borrarCarpeta(Registro::carpeta($n));
        $this->info($n.' eliminado.'.($copia ? ' Última copia guardada en '.$copia.'.' : ''));
        $this->line('Faltan dos cosas a mano en hPanel: borrar la base "'.$base.'" y el subdominio '.$n.'.');

        return self::SUCCESS;
    }
}
