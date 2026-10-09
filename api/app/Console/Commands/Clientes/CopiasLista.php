<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\CopiasExternas\CopiaExterna;
use Illuminate\Console\Command;
use Throwable;

class CopiasLista extends Command
{
    protected $signature = 'ccs:copias-lista {dominio? : un cliente; sin él, todos}';

    protected $description = 'Muestra las copias que hay en Google Drive (la última de cada cliente, o todas las de uno)';

    public function handle(): int
    {
        if (! CopiaExterna::activa()) {
            $this->error('Las copias externas no están configuradas. Corré: php artisan ccs:copias-configurar');

            return self::FAILURE;
        }
        $uno = $this->argument('dominio') ? (SelectorDeCliente::normalizar($this->argument('dominio')) ?? $this->argument('dominio')) : null;
        $nombres = $uno ? [$uno] : (Registro::raiz() !== null ? Registro::nombres() : [CopiaExterna::nombreDeEstaBase()]);

        try {
            $servicio = new CopiaExterna;
            $filas = [];
            foreach ($nombres as $n) {
                $copias = $servicio->copiasDe($n);
                if ($uno) {
                    foreach ($copias as $c) {
                        $filas[] = [$c['name'], number_format($c['size'] / 1024, 0, ',', '.').' kB', substr($c['createdTime'], 0, 16)];
                    }
                } else {
                    $filas[] = [$n, count($copias), $copias ? $copias[0]['name'] : '— SIN COPIAS —', $copias ? substr($copias[0]['createdTime'], 0, 16) : ''];
                }
            }
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->table($uno ? ['Archivo', 'Tamaño', 'Subida (UTC)'] : ['Cliente', 'Copias', 'Última', 'Subida (UTC)'], $filas);

        return self::SUCCESS;
    }
}
