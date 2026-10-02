<?php

namespace App\Console\Commands;

use App\Services\VerificacionEntorno;
use Illuminate\Console\Command;

/**
 * ¿Está lista esta instalación para entregársela a un cliente?
 *
 * Corre la lista de controles de `VerificacionEntorno` y sale con código 1 si
 * alguno es un FALLO — así el instalador (o un script de despliegue) puede
 * cortar en vez de dejar pasar una instalación a medio configurar. Los AVISOS
 * no cortan: son cosas para mirar, no para frenar.
 *
 * No modifica nada.   Uso: php artisan produccion:verificar
 */
class VerificarProduccion extends Command
{
    protected $signature = 'produccion:verificar';

    protected $description = 'Revisa que esta instalación esté lista para un cliente (debug, claves, plan, ARCA, permisos…) sin modificar nada';

    public function handle(VerificacionEntorno $verificacion): int
    {
        $marca = ['ok' => '<info>  OK   </info>', 'aviso' => '<comment> AVISO </comment>', 'fallo' => '<error> FALLO </error>'];
        $fallos = 0;
        $avisos = 0;

        $this->newLine();
        foreach ($verificacion->verificar() as $c) {
            $this->line($marca[$c['nivel']].' '.$c['titulo']);
            if ($c['detalle'] !== '' && $c['nivel'] !== 'ok') {
                $this->line('          '.$c['detalle']);
            }
            $fallos += (int) ($c['nivel'] === 'fallo');
            $avisos += (int) ($c['nivel'] === 'aviso');
        }

        $this->newLine();
        if ($fallos > 0) {
            $this->error($fallos.' fallo(s), '.$avisos.' aviso(s). No entregues esta instalación así.');

            return self::FAILURE;
        }
        $this->info($avisos > 0 ? 'Sin fallos. '.$avisos.' aviso(s) para revisar.' : 'Todo en orden.');

        return self::SUCCESS;
    }
}
