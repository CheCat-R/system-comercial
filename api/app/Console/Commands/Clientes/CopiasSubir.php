<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Ejecutor;
use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\CopiasExternas\CopiaExterna;
use Illuminate\Console\Command;

/**
 * SUBE A GOOGLE DRIVE LA COPIA DE CADA CLIENTE, de a uno (ver `ccs:cron`, que lo hace a diario). Cada cliente en su proceso: si uno
 * falla, los demás se suben igual y el resumen dice cuáles quedaron sin copia.
 */
class CopiasSubir extends Command
{
    protected $signature = 'ccs:copias-subir {--solo=* : solo estos dominios}';

    protected $description = 'Sube a Google Drive (cifrada) la copia de cada cliente';

    public function handle(): int
    {
        if (! CopiaExterna::activa()) {
            $this->error('Las copias externas no están configuradas. Corré: php artisan ccs:copias-configurar');

            return self::FAILURE;
        }
        if (Registro::raiz() === null) {
            $this->error('Esta instalación no es multi-cliente: usá php artisan ccs:copia-externa.');

            return self::FAILURE;
        }

        $nombres = Registro::nombres();
        if ($solo = array_filter((array) $this->option('solo'))) {
            $pedidos = array_map(fn ($s) => SelectorDeCliente::normalizar($s) ?? $s, $solo);
            if ($faltan = array_diff($pedidos, $nombres)) {
                $this->error('No existen: '.implode(', ', $faltan));

                return self::FAILURE;
            }
            $nombres = array_values(array_intersect($nombres, $pedidos));
        }

        $mal = 0;
        foreach ($nombres as $n) {
            if (Registro::suspension($n)) {
                $this->line($n.': suspendido, se omite.');

                continue;
            }
            $p = Ejecutor::artisan($n, ['ccs:copia-externa']);
            $salida = trim($p->getErrorOutput() ?: $p->getOutput());
            if ($p->isSuccessful()) {
                $this->line($n.': '.$salida);
            } else {
                $mal++;
                $this->error($n.': SIN COPIA EXTERNA — '.$salida);
            }
        }

        return $mal ? self::FAILURE : self::SUCCESS;
    }
}
