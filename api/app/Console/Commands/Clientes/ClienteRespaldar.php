<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\Services\RespaldosService;
use Illuminate\Console\Command;
use Throwable;

/**
 * UNA COPIA DE LA BASE DE UN CLIENTE, YA, sin mirar su plan. `respaldos:automatico` es la copia diaria y solo existe en Pymes y
 * Corporativo; antes de actualizar o dar de baja a cualquiera —también un Emprendedor— hace falta una.
 */
class ClienteRespaldar extends Command
{
    protected $signature = 'ccs:respaldar';

    protected $description = 'Genera ahora una copia de la base de UN cliente, sea cual sea su plan (usar con CCS_CLIENTE=<dominio>)';

    public function handle(RespaldosService $respaldos): int
    {
        if (Registro::raiz() !== null && SelectorDeCliente::nombre() === null) {
            $this->error('Elegí el cliente: CCS_CLIENTE=<dominio> php artisan ccs:respaldar');

            return self::FAILURE;
        }
        try {
            $r = $respaldos->generarAutomatico();
        } catch (Throwable $e) {
            $this->error('No se pudo generar la copia: '.$e->getMessage());

            return self::FAILURE;
        }
        $this->info('Copia generada: '.$r['archivo'].' ('.$r['resumen'].').');
        $this->line(str_replace('\\', '/', $respaldos->carpetaAutomaticos()).'/'.$r['archivo']);

        return self::SUCCESS;
    }
}
