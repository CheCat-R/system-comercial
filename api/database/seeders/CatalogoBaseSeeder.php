<?php

namespace Database\Seeders;

use App\Models\Configuracion;
use App\Models\ListaVenta;
use App\Models\ModalidadVenta;
use Illuminate\Database\Seeder;

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
    }
}
