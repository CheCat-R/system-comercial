<?php

namespace Database\Seeders;

use App\Models\Configuracion;
use App\Models\ListaVenta;
use App\Models\ModalidadVenta;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * El formato de venta mínimo para que exista un precio: dos modalidades y
 * tres listas. La lista es SOLO identidad; el `orden` es la preferencia —
 * entre las que el renglón habilite gana la de orden menor, por eso la
 * mayorista va primero y el mostrador queda último (es el piso).
 * Idempotente.
 */
class CatalogoBaseSeeder extends Seeder
{
    public function run(): void
    {
        $minorista = ModalidadVenta::query()->firstOrCreate(['nombre' => 'Minorista'], ['orden' => 1]);
        $mayorista = ModalidadVenta::query()->firstOrCreate(['nombre' => 'Mayorista'], ['orden' => 2]);

        ListaVenta::query()->firstOrCreate(
            ['modalidad_id' => $mayorista->id, 'numero' => 1],
            ['nombre' => 'Mayorista', 'orden' => 10],
        );
        ListaVenta::query()->firstOrCreate(
            ['modalidad_id' => $minorista->id, 'numero' => 2],
            ['nombre' => 'Oferta', 'orden' => 30],
        );
        $mostrador = ListaVenta::query()->firstOrCreate(
            ['modalidad_id' => $minorista->id, 'numero' => 1],
            ['nombre' => 'Mostrador', 'orden' => 90],
        );

        // La lista base del sistema: el piso con el que se vende si nada habilita otra.
        Configuracion::query()->firstOrCreate(['clave' => 'ventas'], ['valor' => [
            'listaBaseId' => $mostrador->id,
            'montoMinimoMayorista' => 0,
            'modalidadMontoId' => $mayorista->id,
            'mediosPagoMonto' => ['efectivo'],
        ]]);

        // El plan de gastos mínimo (F3): rubros fijos y variables para empezar a cargar. Idempotente por nombre.
        $rubros = [
            ['Alquiler', 'fijo', 10], ['Servicios (luz, agua, gas)', 'fijo', 20], ['Internet y telefonía', 'fijo', 30], ['Sueldos y cargas', 'fijo', 40],
            ['Seguros', 'fijo', 50], ['Impuestos y tasas', 'fijo', 60], ['Honorarios', 'fijo', 70],
            ['Fletes', 'variable', 100], ['Mantenimiento y reparaciones', 'variable', 110], ['Insumos y limpieza', 'variable', 120],
            ['Combustible', 'variable', 130], ['Publicidad', 'variable', 140], ['Varios', 'variable', 900],
        ];
        foreach ($rubros as [$nombre, $tipo, $orden]) {
            DB::table('gasto_categorias')->updateOrInsert(['nombre' => $nombre], ['tipo' => $tipo, 'orden' => $orden, 'activa' => true, 'descripcion' => '']);
        }
    }
}
