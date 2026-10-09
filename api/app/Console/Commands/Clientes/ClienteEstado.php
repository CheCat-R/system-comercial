<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\Services\LicenciaService;
use App\Services\RespaldosService;
use Illuminate\Console\Command;
use Illuminate\Database\Migrations\Migrator;
use Throwable;

/**
 * EL ESTADO DE UN CLIENTE, visto desde adentro (hay que elegirlo con CCS_CLIENTE). Es lo que `ccs:lista --detalle` le pregunta a cada
 * uno, y lo que más adelante puede leer un panel de administración.
 */
class ClienteEstado extends Command
{
    protected $signature = 'ccs:estado {--json}';

    protected $description = 'Plan, licencia, migraciones pendientes y última copia de UN cliente (usar con CCS_CLIENTE=<dominio>)';

    public function handle(LicenciaService $licencia, RespaldosService $respaldos, Migrator $migrator): int
    {
        if (Registro::raiz() !== null && SelectorDeCliente::nombre() === null) {
            $this->error('Elegí el cliente: CCS_CLIENTE=<dominio> php artisan ccs:estado');

            return self::FAILURE;
        }

        try {
            $ran = $migrator->getRepository()->repositoryExists() ? $migrator->getRepository()->getRan() : [];
            $archivos = array_keys($migrator->getMigrationFiles($migrator->paths() ?: [database_path('migrations')]));
            $estado = $licencia->estado();
            $copias = $respaldos->automatico();

            $d = [
                'dominio' => SelectorDeCliente::nombre(),
                'plan' => $licencia->plan(),
                'licencia' => ['estado' => $estado['estado'], 'vence' => $estado['vence'], 'diasRestantes' => $estado['diasRestantes'], 'cliente' => $estado['cliente']],
                'migracionesPendientes' => count(array_diff($archivos, $ran)),
                'ultimaCopia' => $copias['copias'][0]['fecha'] ?? null,
                'copiaConProblema' => $copias['problema'],
            ];
        } catch (Throwable $e) {
            $this->error('No se pudo leer el estado: '.$e->getMessage());

            return self::FAILURE;
        }

        if ($this->option('json')) {
            $this->line(json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } else {
            $this->table(['', ''], [
                ['Cliente', $d['dominio'] ?? '(instalación única)'], ['Plan', $d['plan']],
                ['Licencia', $d['licencia']['estado'].($d['licencia']['vence'] ? ' · vence '.$d['licencia']['vence'] : '')],
                ['Migraciones pendientes', $d['migracionesPendientes']], ['Última copia', $d['ultimaCopia'] ?? 'nunca'],
            ]);
        }

        return self::SUCCESS;
    }
}
