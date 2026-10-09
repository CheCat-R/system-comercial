<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\CopiasExternas\CopiaExterna;
use App\Services\RespaldosService;
use Illuminate\Console\Command;
use Throwable;

/**
 * LA COPIA EXTERNA DE UNA SOLA BASE (la de este cliente o la de esta instalación). Es lo que corre `ccs:copias-subir` por cada cliente;
 * se puede usar suelta con CCS_CLIENTE=<dominio>.
 */
class CopiaExternaDeUnCliente extends Command
{
    protected $signature = 'ccs:copia-externa';

    protected $description = 'Vuelca, cifra y sube a Google Drive la base de UN cliente (usar con CCS_CLIENTE=<dominio>)';

    public function handle(RespaldosService $respaldos): int
    {
        if (Registro::raiz() !== null && SelectorDeCliente::nombre() === null) {
            $this->error('Elegí el cliente: CCS_CLIENTE=<dominio> php artisan ccs:copia-externa');

            return self::FAILURE;
        }
        try {
            $r = (new CopiaExterna)->subir(CopiaExterna::nombreDeEstaBase(), $respaldos);
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info('Copia en Drive: '.$r['archivo'].' ('.number_format($r['bytes'] / 1024, 0, ',', '.').' kB cifrados; '.$r['resumen'].')'.($r['podadas'] ? ' · se borraron '.$r['podadas'].' viejas.' : '.'));

        return self::SUCCESS;
    }
}
