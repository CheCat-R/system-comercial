<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Ejecutor;
use App\Clientes\Registro;
use Illuminate\Console\Command;

/**
 * LA TAREA PROGRAMADA DE TODOS LOS CLIENTES, con UN solo cron del hosting (una vez por día alcanza):
 *
 *     0 6 * * *  cd /ruta/al/codigo && php artisan ccs:cron      ← 06:00 UTC = 03:00 en Argentina
 *
 * Los clientes se atienden de a uno, no en paralelo: con 60 procesos PHP por cuenta, cuarenta copias a la vez serían un corte para todos.
 * Hoy la única tarea es la copia diaria (`respaldos:automatico`, que ya sabe si el plan del cliente la incluye).
 */
class ClientesCron extends Command
{
    protected $signature = 'ccs:cron';

    protected $description = 'Corre la copia diaria de cada cliente, de a uno (para el cron del hosting)';

    public function handle(): int
    {
        if (Registro::raiz() === null) {
            $this->error('Esta instalación no es multi-cliente.');

            return self::FAILURE;
        }

        $mal = 0;
        foreach (Registro::nombres() as $n) {
            if (Registro::suspension($n)) {
                $this->line($n.': suspendido, se omite.');

                continue;
            }
            $p = Ejecutor::artisan($n, ['respaldos:automatico']);
            $salida = trim($p->getErrorOutput() ?: $p->getOutput());
            if ($p->isSuccessful()) {
                $this->line($n.': '.$salida);
            } else {
                $mal++;
                $this->error($n.': FALLÓ — '.$salida);
            }
        }

        return $mal ? self::FAILURE : self::SUCCESS;
    }
}
