<?php

namespace App\Console\Commands\Clientes;

use App\Clientes\Ejecutor;
use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use Illuminate\Console\Command;

/**
 * DESPUÉS DE SUBIR CÓDIGO NUEVO: poner al día a todos los clientes, uno por uno.
 *
 * Por cada cliente: modo mantenimiento → copia de la base → migraciones → configuración cacheada → de vuelta en línea.
 * Un cliente que falla NO frena a los demás, salvo que sea el CANARIO (`--canario=`): ese va primero y, si falla, no se toca a nadie
 * más — una versión mala rompe a uno solo, no a todos.
 *
 * Si falla la copia, ese cliente no se migra (y vuelve a quedar en línea con el código nuevo y su base vieja, que es lo que las
 * migraciones aditivas toleran). Si fallan las MIGRACIONES se lo deja en mantenimiento: seguir operando con la base a medio cambiar
 * es peor que unos minutos de corte, y el resumen dice exactamente cómo retomar.
 */
class ClientesActualizar extends Command
{
    protected $signature = 'ccs:actualizar
        {--solo=* : actualizar solo estos dominios}
        {--canario= : dominio que se actualiza primero; si falla, se corta todo}
        {--sin-copia : no hacer la copia previa (no recomendado)}
        {--sin-mantenimiento : no poner en mantenimiento mientras se migra}';

    protected $description = 'Migra y deja al día a todos los clientes, uno por uno';

    public function handle(): int
    {
        if (Registro::raiz() === null) {
            $this->error('Esta instalación no es multi-cliente (no existe '.Registro::raizPrevista().'). Usá php artisan migrate --force.');

            return self::FAILURE;
        }

        $nombres = Registro::nombres();
        if ($solo = array_filter((array) $this->option('solo'))) {
            $desconocidos = array_diff(array_map(fn ($s) => SelectorDeCliente::normalizar($s) ?? $s, $solo), $nombres);
            if ($desconocidos) {
                $this->error('No existen: '.implode(', ', $desconocidos));

                return self::FAILURE;
            }
            $nombres = array_values(array_intersect($nombres, array_map([SelectorDeCliente::class, 'normalizar'], $solo)));
        }
        if ($canario = $this->option('canario')) {
            $canario = SelectorDeCliente::normalizar($canario);
            if (! in_array($canario, $nombres, true)) {
                $this->error('El canario "'.$this->option('canario').'" no está entre los clientes a actualizar.');

                return self::FAILURE;
            }
            $nombres = [$canario, ...array_values(array_diff($nombres, [$canario]))];
        }

        $resultado = [];
        $cortar = false;
        foreach ($nombres as $n) {
            if ($cortar) {
                $resultado[$n] = ['sin procesar', 'se cortó después de fallar el canario'];

                continue;
            }
            if (Registro::suspension($n)) {
                $resultado[$n] = ['omitido', 'suspendido'];

                continue;
            }
            $this->line('→ '.$n);
            $resultado[$n] = $this->actualizar($n);
            if ($canario === $n && $resultado[$n][0] !== 'ok') {
                $cortar = true;
                $this->error('Falló el canario: no se actualiza a nadie más.');
            }
        }

        $this->newLine();
        $this->table(['Cliente', 'Resultado', 'Detalle'], array_map(fn ($n, $r) => [$n, $r[0], $r[1]], array_keys($resultado), $resultado));
        $fallas = array_filter($resultado, fn ($r) => in_array($r[0], ['FALLÓ', 'EN MANTENIMIENTO'], true) || $r[0] === 'sin procesar');

        return $fallas ? self::FAILURE : self::SUCCESS;
    }

    /** @return array{0:string, 1:string} */
    private function actualizar(string $n): array
    {
        $mant = ! $this->option('sin-mantenimiento');
        $paso = fn (array $a) => Ejecutor::artisan($n, $a);
        $texto = fn ($p) => trim($p->getErrorOutput() ?: $p->getOutput());

        if ($mant) {
            $p = $paso(['down', '--retry=60']);
            if (! $p->isSuccessful()) {
                return ['FALLÓ', 'no se pudo poner en mantenimiento: '.$texto($p)];
            }
        }
        $arriba = fn () => $mant ? $paso(['up']) : null;

        if (! $this->option('sin-copia')) {
            $p = $paso(['ccs:respaldar']);
            if (! $p->isSuccessful()) {
                $arriba();

                return ['FALLÓ', 'sin copia previa no se migra: '.$texto($p)];
            }
        }

        $p = $paso(['migrate', '--force']);
        if (! $p->isSuccessful()) {
            return [$mant ? 'EN MANTENIMIENTO' : 'FALLÓ', 'migraciones: '.$texto($p).' — al arreglarlo: CCS_CLIENTE='.$n.' php artisan migrate --force && CCS_CLIENTE='.$n.' php artisan up'];
        }

        $p = $paso(['config:cache']);
        $aviso = $p->isSuccessful() ? '' : 'config:cache falló ('.$texto($p).')';

        if ($mant && ! ($u = $paso(['up']))->isSuccessful()) {
            return ['EN MANTENIMIENTO', 'migró bien pero no volvió a línea: '.$texto($u).' — CCS_CLIENTE='.$n.' php artisan up'];
        }

        return $aviso === '' ? ['ok', 'migrado'] : ['ok', 'migrado; '.$aviso];
    }
}
