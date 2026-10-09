<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Ejecutor;
use App\Clientes\Registro;
use Illuminate\Console\Command;

/**
 * LOS CLIENTES DE ESTA INSTALACIÓN, con lo que se ve desde afuera de cada uno. Con `--detalle` se le pregunta a cada cliente
 * por su licencia, sus migraciones pendientes y su última copia (un proceso por cliente: tarda unos segundos cada uno).
 */
class ClientesLista extends Command
{
    protected $signature = 'ccs:lista {--detalle : consulta a cada cliente (licencia, migraciones pendientes, última copia)} {--json : salida para otro programa}';

    protected $description = 'Lista los clientes de esta instalación';

    public function handle(): int
    {
        $filas = [];
        foreach (Registro::nombres() as $n) {
            $ficha = Registro::ficha($n);
            $susp = Registro::suspension($n);
            $fila = [
                'dominio' => $n, 'nombre' => $ficha['nombre'] ?? $n, 'plan' => $ficha['plan'] ?? '?',
                'estado' => $susp ? 'suspendido' : 'activo', 'suspendidoDesde' => $susp['desde'] ?? null,
                'base' => Registro::entorno($n)['DB_DATABASE'] ?? '?', 'creado' => $ficha['creado'] ?? null,
            ];
            if ($this->option('detalle')) {
                $p = Ejecutor::artisan($n, ['ccs:estado', '--json'], [], 120);
                $d = $p->isSuccessful() ? json_decode($p->getOutput(), true) : null;
                $fila['detalle'] = is_array($d) ? $d : ['error' => trim($p->getErrorOutput() ?: $p->getOutput())];
            }
            $filas[] = $fila;
        }

        if ($this->option('json')) {
            $this->line(json_encode($filas, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

            return self::SUCCESS;
        }
        if (! Registro::raiz()) {
            $this->warn('Esta instalación no es multi-cliente (no existe '.Registro::raizPrevista().').');

            return self::SUCCESS;
        }
        if (! $filas) {
            $this->line('Todavía no hay clientes. Se crean con ccs:alta.');

            return self::SUCCESS;
        }

        $this->table(
            $this->option('detalle')
                ? ['Dominio', 'Plan', 'Estado', 'Licencia', 'Vence', 'Migraciones pend.', 'Última copia']
                : ['Dominio', 'Nombre', 'Plan', 'Estado', 'Base', 'Alta'],
            array_map(function ($f) {
                if (! isset($f['detalle'])) {
                    return [$f['dominio'], $f['nombre'], $f['plan'], $f['estado'], $f['base'], substr((string) $f['creado'], 0, 10)];
                }
                $d = $f['detalle'];
                if (isset($d['error'])) {
                    return [$f['dominio'], $f['plan'], $f['estado'], 'ERROR', mb_substr($d['error'], 0, 40), '', ''];
                }

                return [$f['dominio'], $d['plan'], $f['estado'], $d['licencia']['estado'], $d['licencia']['vence'] ?? '-', $d['migracionesPendientes'], $d['ultimaCopia'] ?? 'nunca'];
            }, $filas),
        );

        return self::SUCCESS;
    }
}
