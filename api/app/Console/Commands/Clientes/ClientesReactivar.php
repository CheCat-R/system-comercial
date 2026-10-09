<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use Illuminate\Console\Command;

class ClientesReactivar extends Command
{
    protected $signature = 'ccs:reactivar {dominio}';

    protected $description = 'Vuelve a activar a un cliente suspendido';

    public function handle(): int
    {
        $n = SelectorDeCliente::normalizar($this->argument('dominio'));
        if ($n === null || ! Registro::existe($n)) {
            $this->error('No existe el cliente "'.$this->argument('dominio').'".');

            return self::FAILURE;
        }
        if (! Registro::suspension($n)) {
            $this->line($n.' no estaba suspendido.');

            return self::SUCCESS;
        }
        unlink(Registro::carpeta($n).'/.suspendido');
        $this->info($n.' vuelve a atender pedidos.');

        return self::SUCCESS;
    }
}
