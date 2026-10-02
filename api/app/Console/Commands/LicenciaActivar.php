<?php

namespace App\Console\Commands;

use App\Licencias\LicenciaInvalida;
use App\Services\LicenciaService;
use Illuminate\Console\Command;

/**
 * Activa una clave de activación desde la consola del servidor (para instalaciones
 * que alojás vos: no hace falta entrar al panel del cliente).
 */
class LicenciaActivar extends Command
{
    protected $signature = 'licencia:activar {clave : La clave de activación completa}';

    protected $description = 'Activa una clave de activación en esta instalación';

    public function handle(LicenciaService $licencia): int
    {
        try {
            $e = $licencia->activar((string) $this->argument('clave'));
        } catch (LicenciaInvalida $ex) {
            $this->error($ex->getMessage());

            return self::FAILURE;
        }

        $this->info('Licencia activada: plan '.$e['plan'].', vence el '.date('d/m/Y', strtotime((string) $e['vence'])).' ('.$e['estado'].').');

        return self::SUCCESS;
    }
}
