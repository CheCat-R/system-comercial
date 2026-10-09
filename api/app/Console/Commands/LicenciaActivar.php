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
    protected $signature = 'licencia:activar {clave : La clave de activación completa} {--plan= : rechazar la clave si no es de este plan (lo usa ccs:plan)}';

    protected $description = 'Activa una clave de activación en esta instalación';

    public function handle(LicenciaService $licencia): int
    {
        try {
            if ($esperado = $this->option('plan')) {
                $lic = $licencia->inspeccionar((string) $this->argument('clave'));
                if ($lic->plan !== $esperado) {
                    $this->error('Esa clave es del plan "'.$lic->plan.'" y se esperaba "'.$esperado.'". No se activó.');

                    return self::FAILURE;
                }
            }
            $e = $licencia->activar((string) $this->argument('clave'));
        } catch (LicenciaInvalida $ex) {
            $this->error($ex->getMessage());

            return self::FAILURE;
        }

        $this->info('Licencia activada: plan '.$e['plan'].', vence el '.date('d/m/Y', strtotime((string) $e['vence'])).' ('.$e['estado'].').');

        return self::SUCCESS;
    }
}
