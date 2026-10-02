<?php

namespace Database\Seeders;

use App\Auth\PlanCatalogo;
use App\Auth\Permisos;
use App\Models\Rol;
use App\Models\Sucursal;
use App\Models\Usuario;
use App\Services\LicenciaService;
use Illuminate\Database\Seeder;

/**
 * La base mínima para poder entrar: sucursales, los cuatro roles de sistema y
 * el superadmin. Es idempotente (usa `updateOrCreate`) para poder correrla
 * sobre una base que ya tiene datos sin duplicar nada.
 *
 * Contraseña inicial del superadmin: `SUPERADMIN_PASSWORD` del .env, o
 * `admin1234`. CAMBIARLA en el primer ingreso está en el checklist del deploy.
 */
class SeguridadSeeder extends Seeder
{
    public function run(): void
    {
        /* ---------------- Sucursales ---------------- */
        Sucursal::query()->updateOrCreate(
            ['tipo' => Sucursal::TIPO_DISTRIBUIDORA],
            ['nombre' => 'Central', 'direccion' => ''],
        );
        /*
         * "Sucursal 1" es de ejemplo — sólo tiene sentido si el plan de esta
         * instalación admite más de una. Sembrarla en un Emprendedor (límite
         * 1) dejaría la base arriba de su propio contrato desde el día cero.
         * `LicenciaService` sin plan fijado es Corporativo (falla abierta),
         * así que el comportamiento de siempre —dev, tests, `db:seed` suelto—
         * no cambia: esto sólo frena cuando alguien fijó el plan a propósito
         * ANTES de sembrar (ver `cliente:aprovisionar`).
         */
        $limiteSucursales = PlanCatalogo::limite(app(LicenciaService::class)->plan(), 'sucursales');
        if ($limiteSucursales === null || $limiteSucursales > 1) {
            Sucursal::query()->firstOrCreate(
                ['nombre' => 'Sucursal 1'],
                ['tipo' => Sucursal::TIPO_EXPRESS],
            );
        }

        /* ---------------- Roles ---------------- */
        $todas = Permisos::todas();

        $superadmin = Rol::query()->updateOrCreate(['clave' => 'superadmin'], [
            'nombre' => 'Superadmin',
            'descripcion' => 'Maneja todo el sistema: crea roles, permisos y usuarios.',
            'permisos' => [Permisos::COMODIN],
            'es_sistema' => true,
        ]);

        /*
         * Admin: todo el catálogo salvo lo que el dueño reparte a mano:
         * `cta_cte` (otorgar crédito) y `sistema.licencia` (la licencia del
         * sistema) quedan sólo para el superadmin.
         */
        Rol::query()->updateOrCreate(['clave' => 'admin'], [
            'nombre' => 'Administrador',
            'descripcion' => 'Operación completa: compras, ventas, almacén, gastos y proveedores.',
            'permisos' => array_values(array_diff($todas, ['cta_cte', 'sistema.licencia'])),
            'es_sistema' => true,
        ]);

        Rol::query()->updateOrCreate(['clave' => 'cajero'], [
            'nombre' => 'Cajero',
            'descripcion' => 'Punto de venta, caja y cobranzas de su sucursal.',
            'permisos' => [
                'dashboard',
                'ventas.pos', 'ventas.listado', 'ventas.ordenes', 'ventas.presupuestos', 'ventas.clientes',
                'ventas.cobranzas', 'ventas.caja',
                'almacen.existencias', 'almacen.incidencias',
                'ventas', 'presupuestos', 'devoluciones', 'diferencias', 'incidencia_crear', 'pedidos',
                'gastos.pagos_proveedor', 'gastos_pagar_proveedor',
            ],
            'es_sistema' => true,
        ]);

        Rol::query()->updateOrCreate(['clave' => 'fraccionador'], [
            'nombre' => 'Fraccionador',
            'descripcion' => 'Almacén: fraccionar granel, preparar envíos, mermas e incidencias.',
            'permisos' => [
                'dashboard',
                'almacen.existencias', 'almacen.fraccionamiento', 'almacen.transferencias',
                'almacen.operaciones', 'almacen.incidencias', 'almacen.conteos',
                'fraccionar', 'preparar', 'etiquetas', 'merma', 'defectuoso', 'incidencia_crear',
            ],
            'es_sistema' => true,
        ]);

        /* ---------------- Superadmin ---------------- */
        if (! Usuario::query()->where('rol_id', $superadmin->id)->exists()) {
            Usuario::query()->create([
                'nombre' => 'Administrador',
                'rol_id' => $superadmin->id,
                'password' => env('SUPERADMIN_PASSWORD', 'admin1234'),
                'activo' => true,
            ]);
        }
    }
}
