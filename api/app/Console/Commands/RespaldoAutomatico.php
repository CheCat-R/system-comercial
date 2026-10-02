<?php

namespace App\Console\Commands;

use App\Services\RespaldosService;
use Illuminate\Console\Command;
use Throwable;

/**
 * LA COPIA DIARIA AUTOMÁTICA de la base (planes Pymes y Corporativo).
 *
 * Corre sola todos los días a las 3:00 (ver `routes/console.php`), pero eso
 * SOLO pasa si el servidor ejecuta el programador de Laravel: una tarea de
 * cron cada minuto con `php artisan schedule:run`. Sin eso el comando nunca
 * corre — por eso Sistema › Respaldos avisa cuando pasan más de 36 horas sin
 * una copia nueva. También se puede correr a mano: `php artisan respaldos:automatico`.
 *
 * En un Emprendedor no hace nada (su plan no la incluye).
 */
class RespaldoAutomatico extends Command
{
    protected $signature = 'respaldos:automatico';

    protected $description = 'Genera la copia diaria comprimida de la base en el servidor y poda las más viejas (Pymes y Corporativo)';

    public function handle(RespaldosService $svc): int
    {
        if (! $svc->automaticoIncluido()) {
            $this->info('El plan de esta instalación no incluye la copia automática: no se hace nada.');

            return self::SUCCESS;
        }

        try {
            $r = $svc->generarAutomatico();
        } catch (Throwable $e) {
            $this->error('No se pudo generar la copia: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info("Copia generada: {$r['archivo']} ({$r['resumen']}).");

        return self::SUCCESS;
    }
}
