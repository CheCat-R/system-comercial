<?php

namespace App\Console\Commands;

use App\Auth\PlanCatalogo;
use App\Services\LicenciaService;
use Illuminate\Console\Command;

/**
 * EL ALTA DE UN CLIENTE NUEVO, de punta a punta, en un solo comando.
 *
 * Hasta ahora era migrar + sembrar + fijar el plan a mano, EN ESE ORDEN
 * exacto (el plan tiene que quedar fijado ANTES de sembrar, porque
 * `SeguridadSeeder` lo lee para decidir si suma "Sucursal 1" — un Emprendedor,
 * límite 1, no la necesita). Equivocar el orden no rompe nada visible: la
 * base queda funcionando igual, solo con una sucursal de más que su plan no
 * admite, y nadie lo nota hasta que alguien intenta cargarle una segunda.
 *
 * Correrlo dos veces es seguro (migrate y los seeders ya son idempotentes),
 * pero no hace nada especial si la base ya tiene operación real cargada —
 * está pensado para una base recién creada, no para "resetear" un cliente
 * que ya está trabajando.
 */
class AprovisionarCliente extends Command
{
    protected $signature = 'cliente:aprovisionar {--plan=corporativo : emprendedor|pymes|corporativo}';

    protected $description = 'Da de alta una instalación nueva: migra, siembra la base mínima y fija el plan comercial';

    public function handle(LicenciaService $licencia): int
    {
        $plan = (string) $this->option('plan');
        if (! in_array($plan, LicenciaService::PLANES, true)) {
            $this->error('Plan inválido: "'.$plan.'". Válidos: '.implode(', ', LicenciaService::PLANES).'.');

            return self::FAILURE;
        }

        $this->info('1/3 — Corriendo migraciones…');
        $this->call('migrate', ['--force' => true]);

        // ANTES de sembrar: SeguridadSeeder lee el plan para decidir las sucursales de ejemplo.
        $this->info('2/3 — Fijando el plan: '.$plan);
        $licencia->fijar($plan);

        $this->info('3/3 — Sembrando la base mínima (roles, superadmin, listas de precio, rubros de gasto)…');
        $this->call('db:seed', ['--force' => true]);

        $limite = PlanCatalogo::limite($plan, 'sucursales');
        $this->newLine();
        $this->info('Listo. Plan "'.$plan.'" — '.($limite === null ? 'sin límite de sucursales.' : 'hasta '.$limite.' sucursal(es).'));
        $this->warn(
            'Usuario inicial: Administrador / '
            .(env('SUPERADMIN_PASSWORD') ? '(la de SUPERADMIN_PASSWORD en el .env)' : 'admin1234 (default — cambiarla en el primer ingreso)')
        );

        return self::SUCCESS;
    }
}
