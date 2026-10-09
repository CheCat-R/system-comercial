<?php

namespace App\Console\Commands\Clientes;

use App\Auth\PlanCatalogo;
use App\Clientes\Ejecutor;
use App\Clientes\Registro;
use App\Clientes\SelectorDeCliente;
use App\Services\LicenciaService;
use Illuminate\Console\Command;

/**
 * CAMBIAR EL PLAN DE UN CLIENTE (subir o bajar). El plan lo define la LICENCIA FIRMADA, y la clave privada que la firma vive en TU
 * máquina, nunca en el servidor (ver deploy/LICENCIAS.md). Por eso son dos pasos:
 *
 *   1. En el servidor:  php artisan ccs:plan <dominio> <plan>
 *        → muestra cómo está el cliente, avisa si el plan nuevo le queda chico y te arma el comando `licencia:emitir` listo para copiar.
 *   2. En tu máquina:   ese comando de `licencia:emitir`   → te da la clave.
 *   3. En el servidor:  php artisan ccs:plan <dominio> <plan> --clave=CCS1.…
 *        → verifica que la clave sea de ESE plan y de ESE cliente, la activa y deja anotado el cambio en su ficha.
 *
 * Una instalación que no exige licencia (una demo) cambia de plan directo, sin clave.
 *
 * Los datos NUNCA se borran al bajar de plan: lo que ya existe queda y solo se bloquea crear más por encima del tope.
 */
class ClientesPlan extends Command
{
    protected $signature = 'ccs:plan {dominio} {plan : emprendedor|pymes|corporativo} {--clave= : la clave de activación del plan nuevo (la emitís con licencia:emitir)}';

    protected $description = 'Cambia el plan de un cliente: te arma el comando para emitir la licencia y, con la clave, la activa';

    public function handle(): int
    {
        $n = SelectorDeCliente::normalizar($this->argument('dominio'));
        $plan = (string) $this->argument('plan');
        if ($n === null || ! Registro::existe($n)) {
            return $this->fallar('No existe el cliente "'.$this->argument('dominio').'". Los que hay: ccs:lista.');
        }
        if (! in_array($plan, LicenciaService::PLANES, true)) {
            return $this->fallar('Plan inválido: "'.$plan.'". Válidos: '.implode(', ', LicenciaService::PLANES).'.');
        }

        $p = Ejecutor::artisan($n, ['ccs:estado', '--json'], [], 120);
        $e = $p->isSuccessful() ? json_decode($p->getOutput(), true) : null;
        if (! is_array($e)) {
            return $this->fallar('No se pudo leer el estado de '.$n.': '.trim($p->getErrorOutput() ?: $p->getOutput()));
        }

        $actual = $e['plan'];
        $orden = array_flip(LicenciaService::PLANES);
        $sentido = $orden[$plan] <=> $orden[$actual];
        $exigida = $e['licencia']['estado'] !== 'no_exigida';
        $clave = trim((string) $this->option('clave'));

        $this->line($n.' — plan actual: '.$actual.' · licencia: '.$e['licencia']['estado'].($e['licencia']['vence'] ? ' (vence '.$e['licencia']['vence'].')' : '').' · '.$e['sucursales'].' sucursal(es), '.$e['usuariosActivos'].' usuario(s) activo(s)');
        if ($sentido === 0 && $clave === '') {
            $this->info('Ya está en el plan '.$plan.'. Para renovarle la licencia, emití una clave nueva (deploy/LICENCIAS.md).');

            return self::SUCCESS;
        }
        foreach ($this->avisosDeExceso($plan, $e) as $aviso) {
            $this->warn($aviso);
        }

        // Una instalación que no exige licencia (demo): el plan se fija directo.
        if (! $exigida) {
            $q = Ejecutor::artisan($n, ['licencia:plan', $plan]);
            if (! $q->isSuccessful()) {
                return $this->fallar(trim($q->getErrorOutput() ?: $q->getOutput()));
            }
            $this->anotar($n, $actual, $plan);
            $this->info('Listo: '.$n.' pasó a '.$plan.' (esta instalación no exige licencia, así que no hizo falta clave).');

            return self::SUCCESS;
        }

        if ($clave === '') {
            $this->newLine();
            $this->line('1) En TU máquina (la que tiene la clave privada), emití la licencia del plan nuevo:');
            $this->line('   php artisan licencia:emitir --cliente="'.($e['licencia']['cliente'] ?: (Registro::ficha($n)['nombre'] ?? $n)).'" --plan='.$plan.' --instalacion='.$e['instalacion'].' --meses=1 --privada="<ruta a tu clave privada>"');
            $this->line('   (--meses=1 mensual, --anual, o --vence=AAAA-MM-DD)');
            $this->line('2) Acá, con la clave que te dio:');
            $this->line('   php artisan ccs:plan '.$n.' '.$plan.' --clave=CCS1.…');
            if ($sentido < 0) {
                $this->line('   Conviene avisarle antes qué deja de tener, y que rija desde su próximo vencimiento.');
            }

            return self::SUCCESS;
        }

        $q = Ejecutor::artisan($n, ['licencia:activar', $clave, '--plan='.$plan]);
        if (! $q->isSuccessful()) {
            return $this->fallar(trim($q->getErrorOutput() ?: $q->getOutput()).' El plan NO cambió.');
        }
        $this->anotar($n, $actual, $plan);
        $this->info(trim($q->getOutput()));
        $this->info('Listo: '.$n.' pasó de '.$actual.' a '.$plan.'.');

        return self::SUCCESS;
    }

    /** Lo que el cliente tiene de más respecto del plan nuevo. No impide nada: sirve para avisarle antes. */
    private function avisosDeExceso(string $plan, array $e): array
    {
        $out = [];
        foreach (['sucursales' => ['sucursales', 'sucursal(es)'], 'usuarios' => ['usuariosActivos', 'usuario(s) activo(s)']] as $recurso => [$campo, $texto]) {
            $limite = PlanCatalogo::limite($plan, $recurso);
            if ($limite !== null && $e[$campo] > $limite) {
                $out[] = 'El plan '.$plan.' admite '.$limite.' '.$texto.' y tiene '.$e[$campo].'. No se borra nada: lo que existe sigue, pero no podrá crear más hasta quedar por debajo del tope.';
            }
        }

        return $out;
    }

    private function anotar(string $n, string $de, string $a): void
    {
        $ficha = Registro::ficha($n);
        $ficha['plan'] = $a;
        $ficha['cambiosDePlan'][] = ['de' => $de, 'a' => $a, 'fecha' => now()->toIso8601String()];
        Registro::guardarFicha($n, $ficha);
    }

    private function fallar(string $mensaje): int
    {
        $this->error($mensaje);

        return self::FAILURE;
    }
}
