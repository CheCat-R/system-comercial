<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Ejecutor;
use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use Illuminate\Console\Command;

/**
 * SUSPENDER A UN CLIENTE (falta de pago, baja del servicio). No borra NADA: su base, su historial y sus archivos quedan intactos,
 * solo deja de atender pedidos (503 con un mensaje claro). Antes de cortar, hace una última copia.
 *
 * Volver atrás es `ccs:reactivar`. Borrar de verdad —pasado un plazo— es `ccs:eliminar`.
 */
class ClientesSuspender extends Command
{
    protected $signature = 'ccs:suspender {dominio} {--motivo= : por qué (queda anotado)} {--sin-copia : no hacer la copia final}';

    protected $description = 'Suspende a un cliente: deja de atender pedidos, sin borrar nada';

    public function handle(): int
    {
        $n = SelectorDeCliente::normalizar($this->argument('dominio'));
        if ($n === null || ! Registro::existe($n)) {
            $this->error('No existe el cliente "'.$this->argument('dominio').'". Los que hay: ccs:lista.');

            return self::FAILURE;
        }
        if (Registro::suspension($n)) {
            $this->warn($n.' ya estaba suspendido desde '.Registro::suspension($n)['desde'].'.');

            return self::SUCCESS;
        }

        if (! $this->option('sin-copia')) {
            $p = Ejecutor::artisan($n, ['ccs:respaldar']);
            if (! $p->isSuccessful()) {
                $this->error('No se pudo hacer la copia final, así que NO se suspendió: '.trim($p->getErrorOutput().$p->getOutput()));
                $this->line('Si igual querés suspenderlo, repetí con --sin-copia.');

                return self::FAILURE;
            }
            $this->line(trim($p->getOutput()));
        }

        file_put_contents(Registro::carpeta($n).'/.suspendido', json_encode(['desde' => now()->toIso8601String(), 'motivo' => (string) $this->option('motivo')], JSON_UNESCAPED_UNICODE));
        $this->info($n.' suspendido. Sus datos siguen intactos; para volver: php artisan ccs:reactivar '.$n);

        return self::SUCCESS;
    }
}
