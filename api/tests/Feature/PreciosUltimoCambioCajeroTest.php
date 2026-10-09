<?php

namespace Tests\Feature\Hallazgos;

use Database\Seeders\CatalogoBaseSeeder;
use Tests\TestCase;

/**
 * El aviso "cambiaron los precios" del panel (PreciosAlert +
 * core/services/cambiosPrecio.js) existe para el CAJERO —se muestra solo con
 * `ventas.pos`— pero pollea `GET /precios/ultimo-cambio`, que está detrás de
 * `permiso:precios`. El rol cajero no tiene `precios`: recibe 403 cada 30 s y
 * el aviso nunca aparece, así que sigue cobrando el precio viejo.
 */
class PreciosUltimoCambioCajeroTest extends TestCase
{
    public function test_el_cajero_puede_consultar_el_ultimo_cambio_de_precio(): void
    {
        $this->seed(CatalogoBaseSeeder::class);
        $cajero = $this->loguear($this->crearUsuario('Lucas', 'cajero'));

        $this->conToken($cajero)->getJson('/api/precios/ultimo-cambio')->assertOk();

        // Pero el resto de Precios sigue siendo de quien tiene el permiso.
        $this->conToken($cajero)->getJson('/api/precios/historial')->assertStatus(403);
    }

    public function test_quien_ni_cobra_ni_maneja_precios_no_lo_ve(): void
    {
        $this->seed(CatalogoBaseSeeder::class);
        $fraccionador = $this->loguear($this->crearUsuario('Pedro', 'fraccionador'));

        $this->conToken($fraccionador)->getJson('/api/precios/ultimo-cambio')->assertStatus(403);
    }
}
